package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import org.springframework.jdbc.core.JdbcTemplate
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.math.max

private const val MAX_DELIVERY_ERROR_LENGTH = 500

internal class NotificationDeliveryStatusOperations {
    fun findDeliveryStatus(
        jdbcTemplate: JdbcTemplate,
        id: UUID,
    ): NotificationDeliveryStatus? =
        jdbcTemplate
            .query(
                """
                select status
                from notification_deliveries
                where id = ?
                """.trimIndent(),
                { resultSet, _ -> NotificationDeliveryStatus.valueOf(resultSet.getString("status")) },
                id.dbString(),
            ).firstOrNull()

    fun markDeliverySent(
        jdbcTemplate: JdbcTemplate,
        id: UUID,
        lockedAt: OffsetDateTime,
    ): Boolean =
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

    fun markDeliveryDead(
        jdbcTemplate: JdbcTemplate,
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
    ): Boolean =
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

    fun restoreDeadEmailDeliveryForClub(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        id: UUID,
    ): Boolean =
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
}
