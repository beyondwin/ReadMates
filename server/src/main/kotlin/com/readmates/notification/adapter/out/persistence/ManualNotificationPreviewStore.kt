package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.port.out.ManualNotificationPreviewRecord
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import java.time.OffsetDateTime
import java.util.UUID

internal class ManualNotificationPreviewStore(
    private val jdbcTemplate: JdbcTemplate,
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
            )
            values (?, ?, ?, ?, ?, ?)
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

    fun findPreview(
        id: UUID,
        clubId: UUID,
        hostMembershipId: UUID,
    ): ManualNotificationPreviewRecord? =
        jdbcTemplate
            .query(
                """
                select id, club_id, host_membership_id, selection_hash, target_snapshot_hash, expires_at
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
    val expiresAt: OffsetDateTime,
    val consumedEventId: UUID?,
)
