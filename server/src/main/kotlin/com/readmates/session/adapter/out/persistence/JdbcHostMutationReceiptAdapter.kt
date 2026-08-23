package com.readmates.session.adapter.out.persistence

import com.readmates.session.application.model.HostMutationReceiptRecord
import com.readmates.session.application.model.NotificationDecision
import com.readmates.session.application.model.SessionVersionVector
import com.readmates.session.application.port.out.HostMutationReceiptPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.db.uuidOrNull
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.ZoneOffset
import java.util.UUID

@Repository
class JdbcHostMutationReceiptAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : HostMutationReceiptPort {
    override fun insert(record: HostMutationReceiptRecord) {
        val createdAt = record.createdAt
        jdbcTemplate.update(
            """
            insert into host_session_mutation_receipts (
              id, club_id, actor_membership_id, operation, resource_id,
              session_revision, exposure_revision, participant_set_revision,
              record_draft_revision, live_record_revision, publication_revision,
              notification_decision, dispatch_receipt_id, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            record.receiptId.dbString(),
            record.clubId.dbString(),
            record.actorMembershipId.dbString(),
            record.operation,
            record.resourceId.dbString(),
            record.resultingVersions.sessionRevision,
            record.resultingVersions.exposureRevision,
            record.resultingVersions.participantSetRevision,
            record.resultingVersions.recordDraftRevision,
            record.resultingVersions.liveRecordRevision,
            record.resultingVersions.publicationRevision,
            record.notificationDecision.name,
            record.dispatchReceiptId?.dbString(),
            createdAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
        writePublicConvergence(record)
    }

    private fun writePublicConvergence(record: HostMutationReceiptRecord) {
        if (record.operation !in PUBLIC_EFFECT_OPERATIONS) {
            return
        }
        val publicProjection = loadPublicProjection(record.resourceId) ?: return
        jdbcTemplate.update(
            """
            insert into public_projection_generations (
              publication_id, club_id, session_id, generation,
              live_record_revision, origin_readable, updated_at
            ) values (?, ?, ?, 1, ?, ?, utc_timestamp(6))
            on duplicate key update
              generation = public_projection_generations.generation + 1,
              live_record_revision = values(live_record_revision),
              origin_readable = values(origin_readable),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            publicProjection.publicationId.dbString(),
            record.clubId.dbString(),
            record.resourceId.dbString(),
            record.resultingVersions.liveRecordRevision,
            publicProjection.originReadable,
        )
        val committedGeneration =
            jdbcTemplate.queryForObject(
                "select generation from public_projection_generations where publication_id = ?",
                Long::class.java,
                publicProjection.publicationId.dbString(),
            ) ?: error("Public projection generation was not persisted")
        val convergenceId = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into public_mutation_convergence_receipts (
              mutation_receipt_id, convergence_id, publication_id_snapshot,
              session_id_snapshot, committed_generation, origin_readable, created_at
            ) values (?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            record.receiptId.dbString(),
            convergenceId.dbString(),
            publicProjection.publicationId.dbString(),
            record.resourceId.dbString(),
            committedGeneration,
            publicProjection.originReadable,
            record.createdAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
        jdbcTemplate.update(
            """
            insert into public_convergence_work (
              convergence_id, next_attempt_no, available_at
            ) values (?, 1, ?)
            """.trimIndent(),
            convergenceId.dbString(),
            record.createdAt.atOffset(ZoneOffset.UTC).toUtcLocalDateTime(),
        )
    }

    private fun loadPublicProjection(sessionId: UUID): PublicProjectionWriteSnapshot? =
        jdbcTemplate
            .query(
                """
                select publication.id as publication_id,
                       (
                         sessions.state = 'PUBLISHED'
                         and sessions.access_scope = 'GUEST_READABLE'
                         and publication.site_visibility = 'PUBLIC_RECORD'
                       ) as origin_readable
                from active_sessions sessions
                join public_session_publications publication
                  on publication.session_id = sessions.id
                 and publication.club_id = sessions.club_id
                where sessions.id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    PublicProjectionWriteSnapshot(
                        publicationId = resultSet.uuid("publication_id"),
                        originReadable = resultSet.getBoolean("origin_readable"),
                    )
                },
                sessionId.dbString(),
            ).firstOrNull()

    override fun find(
        clubId: UUID,
        receiptId: UUID,
    ): HostMutationReceiptRecord? =
        jdbcTemplate
            .query(
                """
                select id, club_id, actor_membership_id, operation, resource_id,
                       session_revision, exposure_revision, participant_set_revision,
                       record_draft_revision, live_record_revision, publication_revision,
                       notification_decision, dispatch_receipt_id, created_at
                from host_session_mutation_receipts
                where club_id = ? and id = ?
                """.trimIndent(),
                { resultSet, _ -> resultSet.toRecord() },
                clubId.dbString(),
                receiptId.dbString(),
            ).firstOrNull()

    private fun ResultSet.toRecord(): HostMutationReceiptRecord =
        HostMutationReceiptRecord(
            receiptId = uuid("id"),
            clubId = uuid("club_id"),
            actorMembershipId = uuid("actor_membership_id"),
            operation = getString("operation"),
            resourceId = uuid("resource_id"),
            resultingVersions =
                SessionVersionVector(
                    sessionRevision = getLong("session_revision"),
                    exposureRevision = getLong("exposure_revision"),
                    participantSetRevision = getLong("participant_set_revision"),
                    recordDraftRevision = getLongOrNull("record_draft_revision"),
                    liveRecordRevision = getLongOrNull("live_record_revision"),
                    publicationRevision = getLong("publication_revision"),
                ),
            notificationDecision = NotificationDecision.valueOf(getString("notification_decision")),
            dispatchReceiptId = uuidOrNull("dispatch_receipt_id"),
            createdAt = utcOffsetDateTime("created_at").toInstant(),
        )

    private fun ResultSet.getLongOrNull(column: String): Long? {
        val value = getLong(column)
        return if (wasNull()) null else value
    }

    private data class PublicProjectionWriteSnapshot(
        val publicationId: UUID,
        val originReadable: Boolean,
    )

    private companion object {
        val PUBLIC_EFFECT_OPERATIONS =
            setOf(
                "SESSION_EXPOSURE",
                "SESSION_PUBLICATION",
                "SESSION_REVERSE",
                "SESSION_RECORD_APPLY",
                "SESSION_PUBLISH",
                "SESSION_CORRECTION_PUBLISH",
            )
    }
}
