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
    }

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
}
