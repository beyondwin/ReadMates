package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.sessionrecord.application.port.out.AppliedSessionRecordPublicEffect
import com.readmates.sessionrecord.application.port.out.SessionRecordPublicProjectionPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class JdbcSessionRecordPublicProjectionAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : SessionRecordPublicProjectionPort {
    override fun recordApplied(effect: AppliedSessionRecordPublicEffect) {
        val projection = loadPublishedProjection(effect) ?: return
        jdbcTemplate.update(
            """
            insert into public_projection_generations (
              publication_id, club_id, session_id, generation,
              live_record_revision, origin_readable, updated_at
            ) values (?, ?, ?, 1, ?, ?, utc_timestamp(6))
            on duplicate key update
              generation = public_projection_generations.generation + 1,
              live_record_revision = values(live_record_revision),
              origin_readable = if(
                public_projection_generations.emergency_denied,
                false,
                values(origin_readable)
              ),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            projection.publicationId.dbString(),
            effect.clubId.dbString(),
            effect.sessionId.dbString(),
            effect.liveRecordRevision,
            projection.originReadable,
        )
        val storedProjection =
            jdbcTemplate.queryForMap(
                "select generation, origin_readable from public_projection_generations where publication_id = ?",
                projection.publicationId.dbString(),
            )
        val generation = (storedProjection["generation"] as Number).toLong()
        val originReadable = storedProjection["origin_readable"] as Boolean
        val convergenceId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into public_mutation_convergence_receipts (
              mutation_receipt_id, convergence_id, publication_id_snapshot,
              session_id_snapshot, committed_generation, origin_readable, created_at
            ) values (?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            effect.receiptId.dbString(),
            convergenceId.dbString(),
            projection.publicationId.dbString(),
            effect.sessionId.dbString(),
            generation,
            originReadable,
            effect.committedAt.toUtcLocalDateTime(),
        )
        jdbcTemplate.update(
            """
            insert into public_convergence_work (convergence_id, next_attempt_no, available_at)
            values (?, 1, ?)
            """.trimIndent(),
            convergenceId.dbString(),
            effect.committedAt.toUtcLocalDateTime(),
        )
    }

    private fun loadPublishedProjection(effect: AppliedSessionRecordPublicEffect): Projection? =
        jdbcTemplate
            .query(
                """
                select publication.id as publication_id,
                       (
                         sessions.access_scope = 'GUEST_READABLE'
                         and publication.site_visibility = 'PUBLIC_RECORD'
                       ) as origin_readable
                from active_sessions sessions
                join public_session_publications publication
                  on publication.session_id = sessions.id
                 and publication.club_id = sessions.club_id
                where sessions.id = ?
                  and sessions.club_id = ?
                  and sessions.state = 'PUBLISHED'
                """.trimIndent(),
                { resultSet, _ ->
                    Projection(
                        publicationId = resultSet.uuid("publication_id"),
                        originReadable = resultSet.getBoolean("origin_readable"),
                    )
                },
                effect.sessionId.dbString(),
                effect.clubId.dbString(),
            ).firstOrNull()

    private data class Projection(
        val publicationId: UUID,
        val originReadable: Boolean,
    )
}
