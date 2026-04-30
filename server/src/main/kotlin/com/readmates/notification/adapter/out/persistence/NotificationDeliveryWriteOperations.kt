package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.notificationDeliveryDedupeKey
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.PreparedStatement
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.math.max

private const val DELIVERY_LEASE_TIMEOUT_MINUTES = 15
private const val MAX_DELIVERY_ERROR_LENGTH = 500
private const val SKIP_REASON_EMAIL_DISABLED = "EMAIL_DISABLED"

internal class NotificationDeliveryWriteOperations(
    private val queries: NotificationDeliveryQueries,
    private val rowMappers: NotificationDeliveryRowMappers,
) {
    fun persistPlannedDeliveries(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
    ): List<NotificationDeliveryItem> {
        val persistedMessage = queries.loadPersistedEventMessage(jdbcTemplate, message.eventId)
        val existingDeliveries = queries.deliveryItemsForEvent(jdbcTemplate, persistedMessage)
        if (existingDeliveries.isNotEmpty()) {
            return existingDeliveries
        }

        val recipients = queries.recipientsFor(jdbcTemplate, persistedMessage)
        if (recipients.isEmpty()) {
            return emptyList()
        }

        val rows = recipients.flatMap { recipient ->
            listOf(
                DeliveryInsertRow(
                    id = UUID.randomUUID(),
                    recipient = recipient,
                    channel = NotificationChannel.IN_APP,
                    status = NotificationDeliveryStatus.SENT,
                    skipReason = null,
                ),
                DeliveryInsertRow(
                    id = UUID.randomUUID(),
                    recipient = recipient,
                    channel = NotificationChannel.EMAIL,
                    status = if (recipient.emailAllowed) {
                        NotificationDeliveryStatus.PENDING
                    } else {
                        NotificationDeliveryStatus.SKIPPED
                    },
                    skipReason = if (recipient.emailAllowed) null else SKIP_REASON_EMAIL_DISABLED,
                ),
            )
        }

        insertDeliveryRows(jdbcTemplate, persistedMessage, rows)
        insertMemberNotifications(jdbcTemplate, persistedMessage, recipients)
        return queries.deliveryItemsForEvent(jdbcTemplate, persistedMessage)
    }

    fun claimEmailDelivery(jdbcTemplate: JdbcTemplate, id: UUID): ClaimedNotificationDeliveryItem? {
        resetStaleSendingRows(jdbcTemplate)
        val selectedId = jdbcTemplate.query(
            """
            select id
            from notification_deliveries
            where id = ?
              and channel = 'EMAIL'
              and status in ('PENDING', 'FAILED')
              and next_attempt_at <= utc_timestamp(6)
            limit 1
            for update skip locked
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("id").let(UUID::fromString) },
            id.dbString(),
        ).firstOrNull() ?: return null

        val updated = jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'SENDING',
                locked_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where id = ?
              and channel = 'EMAIL'
              and status in ('PENDING', 'FAILED')
            """.trimIndent(),
            selectedId.dbString(),
        )
        if (updated == 0) {
            return null
        }

        return queries.claimedDeliveryItems(jdbcTemplate, listOf(selectedId)).firstOrNull()
    }

    fun claimEmailDeliveries(jdbcTemplate: JdbcTemplate, limit: Int): List<ClaimedNotificationDeliveryItem> {
        if (limit <= 0) {
            return emptyList()
        }

        resetStaleSendingRows(jdbcTemplate)
        val ids = jdbcTemplate.query(
            """
            select id
            from notification_deliveries
            where channel = 'EMAIL'
              and status in ('PENDING', 'FAILED')
              and next_attempt_at <= utc_timestamp(6)
            order by next_attempt_at, created_at
            limit ?
            for update skip locked
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("id").let(UUID::fromString) },
            limit,
        )
        if (ids.isEmpty()) {
            return emptyList()
        }

        val placeholders = ids.joinToString(",") { "?" }
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'SENDING',
                locked_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where id in ($placeholders)
              and channel = 'EMAIL'
              and status in ('PENDING', 'FAILED')
            """.trimIndent(),
            *ids.map { it.dbString() as Any }.toTypedArray(),
        )

        return queries.claimedDeliveryItems(jdbcTemplate, ids)
    }

    fun claimEmailDeliveriesForClub(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        limit: Int,
    ): List<ClaimedNotificationDeliveryItem> {
        if (limit <= 0) {
            return emptyList()
        }

        resetStaleSendingRows(jdbcTemplate, clubId)
        val ids = jdbcTemplate.query(
            """
            select id
            from notification_deliveries
            where club_id = ?
              and channel = 'EMAIL'
              and status in ('PENDING', 'FAILED')
              and next_attempt_at <= utc_timestamp(6)
            order by next_attempt_at, created_at
            limit ?
            for update skip locked
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("id").let(UUID::fromString) },
            clubId.dbString(),
            limit,
        )
        if (ids.isEmpty()) {
            return emptyList()
        }

        val placeholders = ids.joinToString(",") { "?" }
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'SENDING',
                locked_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where club_id = ?
              and id in ($placeholders)
              and channel = 'EMAIL'
              and status in ('PENDING', 'FAILED')
            """.trimIndent(),
            *(listOf(clubId.dbString() as Any) + ids.map { it.dbString() as Any }).toTypedArray(),
        )

        return queries.claimedDeliveryItems(jdbcTemplate, ids)
    }

    fun claimHostEmailDelivery(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        id: UUID,
    ): ClaimedNotificationDeliveryItem? {
        resetStaleSendingRows(jdbcTemplate, clubId)
        val selectedId = jdbcTemplate.query(
            """
            select id
            from notification_deliveries
            where club_id = ?
              and id = ?
              and channel = 'EMAIL'
              and status in ('PENDING', 'FAILED')
              and next_attempt_at <= utc_timestamp(6)
            limit 1
            for update skip locked
            """.trimIndent(),
            { resultSet, _ -> resultSet.getString("id").let(UUID::fromString) },
            clubId.dbString(),
            id.dbString(),
        ).firstOrNull() ?: return null

        val updated = jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'SENDING',
                locked_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where club_id = ?
              and id = ?
              and channel = 'EMAIL'
              and status in ('PENDING', 'FAILED')
            """.trimIndent(),
            clubId.dbString(),
            selectedId.dbString(),
        )
        if (updated == 0) {
            return null
        }

        return queries.claimedDeliveryItems(jdbcTemplate, listOf(selectedId)).firstOrNull()
    }

    fun markDeliverySent(jdbcTemplate: JdbcTemplate, id: UUID, lockedAt: OffsetDateTime): Boolean =
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'SENT',
                sent_at = utc_timestamp(6),
                locked_at = null,
                last_error = null,
                updated_at = utc_timestamp(6)
            where id = ?
              and status = 'SENDING'
              and locked_at = ?
            """.trimIndent(),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) > 0

    fun markDeliveryFailed(
        jdbcTemplate: JdbcTemplate,
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean =
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'FAILED',
                attempt_count = attempt_count + 1,
                next_attempt_at = timestampadd(MINUTE, ?, utc_timestamp(6)),
                locked_at = null,
                last_error = ?,
                updated_at = utc_timestamp(6)
            where id = ?
              and status = 'SENDING'
              and locked_at = ?
            """.trimIndent(),
            max(0L, nextAttemptDelayMinutes),
            sanitizeNotificationError(error, MAX_DELIVERY_ERROR_LENGTH),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) > 0

    fun markDeliveryDead(jdbcTemplate: JdbcTemplate, id: UUID, lockedAt: OffsetDateTime, error: String): Boolean =
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'DEAD',
                attempt_count = attempt_count + 1,
                next_attempt_at = utc_timestamp(6),
                locked_at = null,
                last_error = ?,
                updated_at = utc_timestamp(6)
            where id = ?
              and status = 'SENDING'
              and locked_at = ?
            """.trimIndent(),
            sanitizeNotificationError(error, MAX_DELIVERY_ERROR_LENGTH),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) > 0

    fun restoreDeadEmailDeliveryForClub(jdbcTemplate: JdbcTemplate, clubId: UUID, id: UUID): Boolean =
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'PENDING',
                next_attempt_at = utc_timestamp(6),
                locked_at = null,
                updated_at = utc_timestamp(6)
            where club_id = ?
              and id = ?
              and channel = 'EMAIL'
              and status = 'DEAD'
            """.trimIndent(),
            clubId.dbString(),
            id.dbString(),
        ) > 0

    private fun insertDeliveryRows(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
        rows: List<DeliveryInsertRow>,
    ) {
        if (rows.isEmpty()) {
            return
        }

        jdbcTemplate.batchUpdate(
            """
            insert ignore into notification_deliveries (
              id,
              event_id,
              club_id,
              recipient_membership_id,
              channel,
              status,
              dedupe_key,
              sent_at,
              skip_reason
            )
            values (?, ?, ?, ?, ?, ?, ?, if(? = 'SENT', utc_timestamp(6), null), ?)
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(ps: PreparedStatement, i: Int) {
                    val row = rows[i]
                    ps.setString(1, row.id.dbString())
                    ps.setString(2, message.eventId.dbString())
                    ps.setString(3, message.clubId.dbString())
                    ps.setString(4, row.recipient.membershipId.dbString())
                    ps.setString(5, row.channel.name)
                    ps.setString(6, row.status.name)
                    ps.setString(7, notificationDeliveryDedupeKey(message.eventId, row.recipient.membershipId, row.channel))
                    ps.setString(8, row.status.name)
                    ps.setString(9, row.skipReason)
                }

                override fun getBatchSize(): Int = rows.size
            },
        )
    }

    private fun insertMemberNotifications(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
        recipients: List<DeliveryRecipient>,
    ) {
        val inAppRows = queries.deliveryRowsForMemberNotifications(jdbcTemplate, message, recipients.map { it.membershipId })
        if (inAppRows.isEmpty()) {
            return
        }

        jdbcTemplate.batchUpdate(
            """
            insert ignore into member_notifications (
              id,
              event_id,
              delivery_id,
              club_id,
              recipient_membership_id,
              event_type,
              title,
              body,
              deep_link_path
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(ps: PreparedStatement, i: Int) {
                    val row = inAppRows[i]
                    val copy = rowMappers.copyFor(message, row.displayName)
                    ps.setString(1, UUID.randomUUID().dbString())
                    ps.setString(2, message.eventId.dbString())
                    ps.setString(3, row.id.dbString())
                    ps.setString(4, message.clubId.dbString())
                    ps.setString(5, row.recipientMembershipId.dbString())
                    ps.setString(6, message.eventType.name)
                    ps.setString(7, copy.title)
                    ps.setString(8, copy.body)
                    ps.setString(9, copy.deepLinkPath)
                }

                override fun getBatchSize(): Int = inAppRows.size
            },
        )
    }

    private fun resetStaleSendingRows(jdbcTemplate: JdbcTemplate, clubId: UUID? = null) {
        val clubPredicate = if (clubId == null) "" else "and club_id = ?"
        val args = if (clubId == null) emptyArray() else arrayOf(clubId.dbString() as Any)
        jdbcTemplate.update(
            """
            update notification_deliveries
            set status = 'PENDING',
                locked_at = null,
                next_attempt_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where channel = 'EMAIL'
              and status = 'SENDING'
              and locked_at < timestampadd(MINUTE, ?, utc_timestamp(6))
              $clubPredicate
            """.trimIndent(),
            -DELIVERY_LEASE_TIMEOUT_MINUTES,
            *args,
        )
    }
}
