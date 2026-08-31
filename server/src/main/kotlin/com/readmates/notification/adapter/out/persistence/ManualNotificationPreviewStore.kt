package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.port.out.ManualNotificationPreviewRecord
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.util.UUID

internal class ManualNotificationPreviewStore(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
) {
    fun insertPreview(
        clubId: UUID,
        hostMembershipId: UUID,
        selectionHash: String,
        targetSnapshotHash: String,
        expiresAt: OffsetDateTime,
    ): UUID {
        val id = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatch_previews (
              id, club_id, host_membership_id, selection_hash, target_snapshot_hash, expires_at
            ) values (?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            id.dbString(),
            clubId.dbString(),
            hostMembershipId.dbString(),
            selectionHash,
            targetSnapshotHash,
            expiresAt.toUtcLocalDateTime(),
        )
        return id
    }

    @Suppress("LongParameterList")
    fun insertPreview(
        clubId: UUID,
        hostMembershipId: UUID,
        selectionHash: String,
        targetSnapshotHash: String,
        scheduleRevision: Long,
        targetSnapshotRevision: String,
        targetMembershipIds: List<UUID>,
        eligibilityFingerprint: String,
        subject: String,
        body: String,
        contentHash: String,
        expiresAt: OffsetDateTime,
    ): UUID {
        val id = UUID.randomUUID()
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatch_previews (
              id, club_id, host_membership_id, selection_hash, target_snapshot_hash, schedule_revision,
              target_snapshot_revision, target_membership_ids_json, eligibility_fingerprint,
              custom_subject, custom_body, content_hash, expires_at
            )
            values (?, ?, ?, ?, ?, ?, ?, cast(? as json), ?, ?, ?, ?, ?)
            """.trimIndent(),
            id.dbString(),
            clubId.dbString(),
            hostMembershipId.dbString(),
            selectionHash,
            targetSnapshotHash,
            scheduleRevision,
            targetSnapshotRevision,
            objectMapper.writeValueAsString(targetMembershipIds),
            eligibilityFingerprint,
            subject,
            body,
            contentHash,
            expiresAt.toUtcLocalDateTime(),
        )
        return id
    }

    fun findPreview(
        id: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
    ): ManualNotificationPreviewRecord? =
        jdbcTemplate
            .query(
                """
                select id, club_id, host_membership_id, selection_hash, target_snapshot_hash, schedule_revision,
                       target_snapshot_revision, target_membership_ids_json, eligibility_fingerprint,
                       custom_subject, custom_body, content_hash, expires_at
                from notification_manual_dispatch_previews
                where id = ?
                  and club_id = ?
                  and host_membership_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    ManualNotificationPreviewRecord(
                        id = resultSet.uuid("id"),
                        clubId = resultSet.uuid("club_id"),
                        hostMembershipId = resultSet.uuid("host_membership_id"),
                        selectionHash = resultSet.getString("selection_hash"),
                        targetSnapshotHash = resultSet.getString("target_snapshot_hash"),
                        scheduleRevision = resultSet.getLong("schedule_revision"),
                        targetSnapshotRevision = resultSet.getString("target_snapshot_revision"),
                        targetMembershipIds =
                            resultSet
                                .getString("target_membership_ids_json")
                                ?.let {
                                    objectMapper.readValue<List<UUID>>(
                                        it,
                                        objectMapper.typeFactory.constructCollectionType(
                                            List::class.java,
                                            UUID::class.java,
                                        ),
                                    )
                                }.orEmpty(),
                        eligibilityFingerprint = resultSet.getString("eligibility_fingerprint").orEmpty(),
                        subject = resultSet.getString("custom_subject").orEmpty(),
                        body = resultSet.getString("custom_body").orEmpty(),
                        contentHash = resultSet.getString("content_hash").orEmpty(),
                        expiresAt = resultSet.utcOffsetDateTime("expires_at"),
                    )
                },
                id.dbString(),
                clubId.dbString(),
                hostMembershipId.dbString(),
            ).firstOrNull()

    fun lockPreview(
        id: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
    ): LockedManualNotificationPreview? =
        jdbcTemplate
            .query(
                """
                select
                  id,
                  club_id,
                  host_membership_id,
                  selection_hash,
                  target_snapshot_hash,
                  schedule_revision,
                  target_snapshot_revision,
                  eligibility_fingerprint,
                  custom_subject,
                  custom_body,
                  content_hash,
                  expires_at,
                  consumed_event_id
                from notification_manual_dispatch_previews
                where id = ?
                  and club_id = ?
                  and host_membership_id = ?
                for update
                """.trimIndent(),
                { resultSet, _ ->
                    LockedManualNotificationPreview(
                        id = resultSet.uuid("id"),
                        selectionHash = resultSet.getString("selection_hash"),
                        targetSnapshotHash = resultSet.getString("target_snapshot_hash"),
                        scheduleRevision = resultSet.getLong("schedule_revision"),
                        targetSnapshotRevision = resultSet.getString("target_snapshot_revision").orEmpty(),
                        eligibilityFingerprint = resultSet.getString("eligibility_fingerprint").orEmpty(),
                        subject = resultSet.getString("custom_subject").orEmpty(),
                        body = resultSet.getString("custom_body").orEmpty(),
                        contentHash = resultSet.getString("content_hash").orEmpty(),
                        expiresAt = resultSet.utcOffsetDateTime("expires_at"),
                        consumedEventId = resultSet.getString("consumed_event_id")?.let(UUID::fromString),
                    )
                },
                id.dbString(),
                clubId.dbString(),
                hostMembershipId.dbString(),
            ).firstOrNull()

    fun consume(
        previewId: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
        eventId: UUID,
    ) {
        jdbcTemplate.update(
            """
            update notification_manual_dispatch_previews
            set consumed_at = utc_timestamp(6),
                consumed_event_id = ?
            where id = ?
              and club_id = ?
              and host_membership_id = ?
              and consumed_event_id is null
            """.trimIndent(),
            eventId.dbString(),
            previewId.dbString(),
            clubId.dbString(),
            hostMembershipId.dbString(),
        )
    }
}

internal data class LockedManualNotificationPreview(
    val id: UUID,
    val selectionHash: String,
    val targetSnapshotHash: String?,
    val scheduleRevision: Long,
    val targetSnapshotRevision: String,
    val eligibilityFingerprint: String,
    val subject: String,
    val body: String,
    val contentHash: String,
    val expiresAt: OffsetDateTime,
    val consumedEventId: UUID?,
)
