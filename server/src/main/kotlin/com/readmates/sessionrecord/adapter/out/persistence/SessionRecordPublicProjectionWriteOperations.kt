package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import java.util.UUID

/** Commits public correction projection facts beside the session-record apply receipt. */
internal class SessionRecordPublicProjectionWriteOperations(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun rotateAffected(
        clubId: UUID,
        sessionId: UUID,
        mutationReceiptId: UUID,
    ) {
        lockSession(clubId, sessionId)
        val origin = loadAffectedOrigin(clubId, sessionId) ?: return
        val convergenceId = UUID.randomUUID()
        val clubGeneration = incrementClubGeneration(clubId)
        val generation = rotateCurrent(clubId, sessionId, convergenceId, clubGeneration, origin)
        insertWork(clubId, sessionId, convergenceId, origin.publicationId)
        insertLink(clubId, sessionId, mutationReceiptId, convergenceId, generation, clubGeneration, origin)
    }

    private fun lockSession(
        clubId: UUID,
        sessionId: UUID,
    ) {
        jdbcTemplate.queryForObject(
            "select id from active_sessions where club_id = ? and id = ? for update",
            String::class.java,
            clubId.dbString(),
            sessionId.dbString(),
        )
    }

    private fun loadAffectedOrigin(
        clubId: UUID,
        sessionId: UUID,
    ): OriginProjection? =
        jdbcTemplate
            .query(
                """
                select publications.id as publication_id,
                       coalesce((
                         select max(revisions.version)
                         from session_record_revisions revisions
                         where revisions.club_id = sessions.club_id
                           and revisions.session_id = sessions.id
                       ), 0) as live_record_revision,
                       previous_projection.origin_readable as previous_origin_readable,
                       (
                         sessions.deleted_at is null
                         and binary clubs.status = binary 'ACTIVE'
                         and binary clubs.public_visibility = binary 'PUBLIC'
                         and binary sessions.state = binary 'PUBLISHED'
                         and binary sessions.access_scope = binary 'GUEST_READABLE'
                         and binary publications.site_visibility = binary 'PUBLIC_RECORD'
                       ) as origin_readable
                from active_sessions
                join clubs on clubs.id = sessions.club_id
                join public_session_publications publications
                  on publications.club_id = sessions.club_id
                 and publications.session_id = sessions.id
                left join public_projection_current previous_projection
                  on previous_projection.session_id = sessions.id
                where sessions.club_id = ?
                  and sessions.id = ?
                  and (
                    coalesce(previous_projection.origin_readable, false) = true
                    or (
                      sessions.deleted_at is null
                      and binary clubs.status = binary 'ACTIVE'
                      and binary clubs.public_visibility = binary 'PUBLIC'
                      and binary sessions.state = binary 'PUBLISHED'
                      and binary sessions.access_scope = binary 'GUEST_READABLE'
                      and binary publications.site_visibility = binary 'PUBLIC_RECORD'
                    )
                  )
                """.trimIndent(),
                { rs, _ ->
                    val liveReadable = rs.getBoolean("origin_readable")
                    val previousReadable =
                        rs.getBoolean("previous_origin_readable").let { if (rs.wasNull()) null else it }
                    OriginProjection(
                        publicationId = rs.uuid("publication_id"),
                        liveRecordRevision = rs.getLong("live_record_revision"),
                        originReadable = liveReadable && previousReadable != false,
                    )
                },
                clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull()

    private fun incrementClubGeneration(clubId: UUID): Long {
        jdbcTemplate.update(
            """
            insert into public_club_projection_generations (club_id, generation, origin_readable, updated_at)
            select clubs.id, 1,
                   (binary clubs.status = binary 'ACTIVE' and binary clubs.public_visibility = binary 'PUBLIC'),
                   utc_timestamp(6)
            from clubs where clubs.id = ?
            on duplicate key update generation = generation + 1, updated_at = utc_timestamp(6)
            """.trimIndent(),
            clubId.dbString(),
        )
        return checkNotNull(
            jdbcTemplate.queryForObject(
                "select generation from public_club_projection_generations where club_id = ?",
                Long::class.java,
                clubId.dbString(),
            ),
        )
    }

    private fun rotateCurrent(
        clubId: UUID,
        sessionId: UUID,
        convergenceId: UUID,
        clubGeneration: Long,
        origin: OriginProjection,
    ): Long {
        jdbcTemplate.update(
            """
            insert into public_projection_current (
              session_id, club_id, publication_id_snapshot, generation, club_generation,
              live_record_revision, origin_readable, convergence_id, updated_at
            ) values (?, ?, ?, 1, ?, ?, ?, ?, utc_timestamp(6))
            on duplicate key update
              publication_id_snapshot = values(publication_id_snapshot),
              generation = generation + 1,
              club_generation = values(club_generation),
              live_record_revision = values(live_record_revision),
              origin_readable = values(origin_readable),
              convergence_id = values(convergence_id),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            sessionId.dbString(),
            clubId.dbString(),
            origin.publicationId.dbString(),
            clubGeneration,
            origin.liveRecordRevision,
            origin.originReadable,
            convergenceId.dbString(),
        )
        return checkNotNull(
            jdbcTemplate.queryForObject(
                "select generation from public_projection_current where session_id = ?",
                Long::class.java,
                sessionId.dbString(),
            ),
        )
    }

    private fun insertWork(
        clubId: UUID,
        sessionId: UUID,
        convergenceId: UUID,
        publicationId: UUID,
    ) {
        jdbcTemplate.update(
            """
            insert into public_convergence_work (
              convergence_id, club_id_snapshot, session_id_snapshot, publication_id_snapshot,
              next_attempt_no, available_at, retention_until, created_at, updated_at
            ) values (
              ?, ?, ?, ?, 1, utc_timestamp(6), timestampadd(day, 30, utc_timestamp(6)),
              utc_timestamp(6), utc_timestamp(6)
            )
            """.trimIndent(),
            convergenceId.dbString(),
            clubId.dbString(),
            sessionId.dbString(),
            publicationId.dbString(),
        )
    }

    private fun insertLink(
        clubId: UUID,
        sessionId: UUID,
        mutationReceiptId: UUID,
        convergenceId: UUID,
        generation: Long,
        clubGeneration: Long,
        origin: OriginProjection,
    ) {
        jdbcTemplate.update(
            """
            insert into public_mutation_convergence_links (
              mutation_receipt_id, convergence_id, club_id_snapshot, session_id_snapshot,
              publication_id_snapshot, committed_generation, committed_club_generation,
              live_record_revision, origin_readable, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, utc_timestamp(6))
            """.trimIndent(),
            mutationReceiptId.dbString(),
            convergenceId.dbString(),
            clubId.dbString(),
            sessionId.dbString(),
            origin.publicationId.dbString(),
            generation,
            clubGeneration,
            origin.liveRecordRevision,
            origin.originReadable,
        )
    }

    private data class OriginProjection(
        val publicationId: UUID,
        val liveRecordRevision: Long,
        val originReadable: Boolean,
    )
}
