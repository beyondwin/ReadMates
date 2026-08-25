package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.HostSessionNotFoundException
import com.readmates.session.application.model.HostPublicProjectionEffect
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuidOrNull
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.ResultSet
import java.util.UUID

/** Writes neutral projection facts in the transaction owned by the session feature. */
internal class HostPublicProjectionWriteOperations(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun rotateAffectedContent(
        clubId: UUID,
        sessionId: UUID,
    ): HostPublicProjectionEffect? {
        lockSession(clubId, sessionId)
        val affected =
            jdbcTemplate.queryForObject(
                """
                select (
                  coalesce(current_projection.origin_readable, false)
                  or (
                    sessions.deleted_at is null
                    and binary clubs.status = binary 'ACTIVE'
                    and binary clubs.public_visibility = binary 'PUBLIC'
                    and binary sessions.state = binary 'PUBLISHED'
                    and binary sessions.access_scope = binary 'GUEST_READABLE'
                    and binary publications.site_visibility = binary 'PUBLIC_RECORD'
                  )
                )
                from sessions
                join clubs on clubs.id = sessions.club_id
                left join public_session_publications publications
                  on publications.club_id = sessions.club_id and publications.session_id = sessions.id
                left join public_projection_current current_projection
                  on current_projection.session_id = sessions.id
                where sessions.club_id = ? and sessions.id = ?
                """.trimIndent(),
                Boolean::class.java,
                clubId.dbString(),
                sessionId.dbString(),
            ) ?: false
        return if (affected) rotateLocked(clubId, sessionId, allowReadablePromotion = false) else null
    }

    fun rotate(
        clubId: UUID,
        sessionId: UUID,
        allowReadablePromotion: Boolean = true,
    ): HostPublicProjectionEffect {
        lockSession(clubId, sessionId)
        return rotateLocked(clubId, sessionId, allowReadablePromotion)
    }

    private fun rotateLocked(
        clubId: UUID,
        sessionId: UUID,
        allowReadablePromotion: Boolean,
    ): HostPublicProjectionEffect {
        val convergenceId = UUID.randomUUID()
        val origin = loadOrigin(clubId, sessionId, allowReadablePromotion)
        val clubGeneration = incrementClubGeneration(clubId)
        val generation = rotateCurrent(clubId, sessionId, clubGeneration, convergenceId, origin)
        insertWork(clubId, sessionId, convergenceId, origin.publicationId)
        return HostPublicProjectionEffect(
            convergenceId = convergenceId,
            clubId = clubId,
            sessionId = sessionId,
            publicationId = origin.publicationId,
            generation = generation,
            clubGeneration = clubGeneration,
            liveRecordRevision = origin.liveRecordRevision,
            originReadable = origin.originReadable,
        )
    }

    private fun lockSession(
        clubId: UUID,
        sessionId: UUID,
    ) {
        jdbcTemplate.queryForObject(
            "select id from sessions where club_id = ? and id = ? for update",
            String::class.java,
            clubId.dbString(),
            sessionId.dbString(),
        ) ?: throw HostSessionNotFoundException()
    }

    private fun incrementClubGeneration(clubId: UUID): Long {
        jdbcTemplate.update(
            """
            insert into public_club_projection_generations (club_id, generation, origin_readable, updated_at)
            select clubs.id, 1,
                   (binary clubs.status = binary 'ACTIVE' and binary clubs.public_visibility = binary 'PUBLIC'),
                   utc_timestamp(6)
            from clubs where clubs.id = ?
            on duplicate key update
              generation = generation + 1,
              updated_at = utc_timestamp(6)
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

    private fun loadOrigin(
        clubId: UUID,
        sessionId: UUID,
        allowReadablePromotion: Boolean,
    ): OriginProjection =
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
                       current_projection.origin_readable as previous_origin_readable,
                       (
                         sessions.deleted_at is null
                         and binary clubs.status = binary 'ACTIVE'
                         and binary clubs.public_visibility = binary 'PUBLIC'
                         and binary sessions.state = binary 'PUBLISHED'
                         and binary sessions.access_scope = binary 'GUEST_READABLE'
                         and binary publications.site_visibility = binary 'PUBLIC_RECORD'
                       ) as origin_readable
                from sessions
                join clubs on clubs.id = sessions.club_id
                left join public_session_publications publications
                  on publications.club_id = sessions.club_id
                 and publications.session_id = sessions.id
                left join public_projection_current current_projection
                  on current_projection.session_id = sessions.id
                where sessions.club_id = ? and sessions.id = ?
                """.trimIndent(),
                { rs, _ -> rs.toOrigin(allowReadablePromotion) },
                clubId.dbString(),
                sessionId.dbString(),
            ).firstOrNull() ?: throw HostSessionNotFoundException()

    private fun rotateCurrent(
        clubId: UUID,
        sessionId: UUID,
        clubGeneration: Long,
        convergenceId: UUID,
        origin: OriginProjection,
    ): Long {
        jdbcTemplate.update(
            """
            insert into public_projection_current (
              session_id, club_id, publication_id_snapshot, generation, club_generation,
              live_record_revision, origin_readable, convergence_id, updated_at
            ) values (?, ?, ?, 1, ?, ?, ?, ?, utc_timestamp(6))
            on duplicate key update
              club_id = values(club_id),
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
            origin.publicationId?.dbString(),
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
        publicationId: UUID?,
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
            publicationId?.dbString(),
        )
    }

    private fun ResultSet.toOrigin(allowReadablePromotion: Boolean): OriginProjection {
        val liveReadable = getBoolean("origin_readable")
        val previousReadable = getBoolean("previous_origin_readable").let { if (wasNull()) null else it }
        return OriginProjection(
            publicationId = uuidOrNull("publication_id"),
            liveRecordRevision = getLong("live_record_revision"),
            originReadable = liveReadable && (allowReadablePromotion || previousReadable != false),
        )
    }

    private data class OriginProjection(
        val publicationId: UUID?,
        val liveRecordRevision: Long,
        val originReadable: Boolean,
    )
}
