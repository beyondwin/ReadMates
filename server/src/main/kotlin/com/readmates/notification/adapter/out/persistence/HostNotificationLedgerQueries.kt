package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationFailure
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import java.time.OffsetDateTime
import java.util.UUID

internal class HostNotificationLedgerQueries(
    private val rowMappers: NotificationDeliveryRowMappers,
    private val backlogQueries: NotificationDeliveryBacklogQueries,
) {
    fun hostSummary(jdbcTemplate: JdbcTemplate, clubId: UUID): HostNotificationSummary =
        HostNotificationSummary(
            pending = backlogQueries.countByStatus(jdbcTemplate, clubId, NotificationChannel.EMAIL, NotificationDeliveryStatus.PENDING),
            failed = backlogQueries.countByStatus(jdbcTemplate, clubId, NotificationChannel.EMAIL, NotificationDeliveryStatus.FAILED),
            dead = backlogQueries.countByStatus(jdbcTemplate, clubId, NotificationChannel.EMAIL, NotificationDeliveryStatus.DEAD),
            sentLast24h = jdbcTemplate.queryForObject(
                """
                select count(*)
                from notification_deliveries
                where club_id = ?
                  and channel = 'EMAIL'
                  and status = 'SENT'
                  and sent_at >= timestampadd(HOUR, -24, utc_timestamp(6))
                """.trimIndent(),
                Int::class.java,
                clubId.dbString(),
            ) ?: 0,
            latestFailures = latestFailures(jdbcTemplate, clubId),
        )

    fun listHostEmailItems(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        query: HostNotificationItemQuery,
        pageRequest: PageRequest,
    ): HostNotificationItemList {
        val cursor = NotificationDeliveryUpdatedAtDescCursor.from(pageRequest.cursor)
        val predicates = mutableListOf(
            "notification_deliveries.club_id = ?",
            "notification_deliveries.channel = 'EMAIL'",
        )
        val args = mutableListOf<Any>(clubId.dbString())
        query.status?.let {
            predicates += "notification_deliveries.status = ?"
            args += it.name
        }
        query.eventType?.let {
            predicates += "notification_event_outbox.event_type = ?"
            args += it.name
        }
        if (cursor != null) {
            predicates += """
                (
                  notification_deliveries.updated_at < ?
                  or (notification_deliveries.updated_at = ? and notification_deliveries.created_at < ?)
                  or (notification_deliveries.updated_at = ? and notification_deliveries.created_at = ? and notification_deliveries.id < ?)
                )
            """.trimIndent()
            args += cursor.updatedAt.toUtcLocalDateTime()
            args += cursor.updatedAt.toUtcLocalDateTime()
            args += cursor.createdAt.toUtcLocalDateTime()
            args += cursor.updatedAt.toUtcLocalDateTime()
            args += cursor.createdAt.toUtcLocalDateTime()
            args += cursor.id
        }
        args += pageRequest.limit + 1

        val items = jdbcTemplate.query(
            """
            select
              notification_deliveries.id,
              notification_event_outbox.event_type,
              notification_deliveries.status,
              users.email as recipient_email,
              notification_deliveries.attempt_count,
              notification_deliveries.next_attempt_at,
              notification_deliveries.created_at,
              notification_deliveries.updated_at
            from notification_deliveries
            join notification_event_outbox on notification_event_outbox.id = notification_deliveries.event_id
              and notification_event_outbox.club_id = notification_deliveries.club_id
            join memberships on memberships.id = notification_deliveries.recipient_membership_id
              and memberships.club_id = notification_deliveries.club_id
            join users on users.id = memberships.user_id
            where ${predicates.joinToString(" and ")}
            order by notification_deliveries.updated_at desc, notification_deliveries.created_at desc, notification_deliveries.id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toHostNotificationItem() } },
            *args.toTypedArray(),
        )

        return HostNotificationItemList(
            items = items.take(pageRequest.limit),
            nextCursor = if (items.size > pageRequest.limit) {
                items.take(pageRequest.limit).lastOrNull()
                    ?.let { notificationDeliveryUpdatedAtDescCursor(it.updatedAt, it.createdAt, it.id.toString()) }
            } else {
                null
            },
        )
    }

    fun hostEmailDetail(jdbcTemplate: JdbcTemplate, clubId: UUID, id: UUID): HostNotificationDetail? =
        jdbcTemplate.query(
            """
            select
              notification_deliveries.id,
              notification_deliveries.event_id,
              notification_deliveries.status,
              notification_deliveries.attempt_count,
              notification_deliveries.last_error,
              notification_deliveries.created_at,
              notification_deliveries.updated_at,
              notification_event_outbox.event_type,
              notification_event_outbox.aggregate_id,
              notification_event_outbox.payload_json,
              clubs.slug as club_slug,
              clubs.name as club_name,
              users.email as recipient_email,
              coalesce(memberships.short_name, users.name) as display_name
            from notification_deliveries
            join notification_event_outbox on notification_event_outbox.id = notification_deliveries.event_id
              and notification_event_outbox.club_id = notification_deliveries.club_id
            join clubs on clubs.id = notification_event_outbox.club_id
            join memberships on memberships.id = notification_deliveries.recipient_membership_id
              and memberships.club_id = notification_deliveries.club_id
            join users on users.id = memberships.user_id
            where notification_deliveries.club_id = ?
              and notification_deliveries.id = ?
              and notification_deliveries.channel = 'EMAIL'
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toHostNotificationDetail() } },
            clubId.dbString(),
            id.dbString(),
        ).firstOrNull()

    fun listHostDeliveries(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        pageRequest: PageRequest,
    ): CursorPage<HostNotificationDelivery> {
        val cursor = NotificationDeliveryUpdatedAtDescCursor.from(pageRequest.cursor)
        val statusPredicate = if (status == null) "" else "and notification_deliveries.status = ?"
        val channelPredicate = if (channel == null) "" else "and notification_deliveries.channel = ?"
        val cursorPredicate = if (cursor == null) {
            ""
        } else {
            """
            and (
              notification_deliveries.updated_at < ?
              or (notification_deliveries.updated_at = ? and notification_deliveries.created_at < ?)
              or (notification_deliveries.updated_at = ? and notification_deliveries.created_at = ? and notification_deliveries.id < ?)
            )
            """.trimIndent()
        }
        val args = mutableListOf<Any>(clubId.dbString())
        status?.let { args += it.name }
        channel?.let { args += it.name }
        if (cursor != null) {
            args += cursor.updatedAt.toUtcLocalDateTime()
            args += cursor.updatedAt.toUtcLocalDateTime()
            args += cursor.createdAt.toUtcLocalDateTime()
            args += cursor.updatedAt.toUtcLocalDateTime()
            args += cursor.createdAt.toUtcLocalDateTime()
            args += cursor.id
        }
        args += pageRequest.limit + 1
        val rows = jdbcTemplate.query(
            """
            select
              notification_deliveries.id,
              notification_deliveries.event_id,
              notification_deliveries.channel,
              notification_deliveries.status,
              case when notification_deliveries.channel = 'EMAIL' then users.email else null end as recipient_email,
              notification_deliveries.attempt_count,
              notification_deliveries.created_at,
              notification_deliveries.updated_at
            from notification_deliveries
            join memberships on memberships.id = notification_deliveries.recipient_membership_id
              and memberships.club_id = notification_deliveries.club_id
            join users on users.id = memberships.user_id
            where notification_deliveries.club_id = ?
              $statusPredicate
              $channelPredicate
              $cursorPredicate
            order by notification_deliveries.updated_at desc, notification_deliveries.created_at desc, notification_deliveries.id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toHostNotificationDelivery() } },
            *args.toTypedArray(),
        )
        return pageFromRows(rows, pageRequest.limit) { row ->
            notificationDeliveryUpdatedAtDescCursor(row.updatedAt, row.createdAt, row.id.toString())
        }
    }

    private fun latestFailures(jdbcTemplate: JdbcTemplate, clubId: UUID): List<HostNotificationFailure> =
        jdbcTemplate.query(
            """
            select
              notification_deliveries.id,
              notification_event_outbox.event_type,
              users.email as recipient_email,
              notification_deliveries.attempt_count,
              notification_deliveries.updated_at
            from notification_deliveries
            join notification_event_outbox on notification_event_outbox.id = notification_deliveries.event_id
              and notification_event_outbox.club_id = notification_deliveries.club_id
            join memberships on memberships.id = notification_deliveries.recipient_membership_id
              and memberships.club_id = notification_deliveries.club_id
            join users on users.id = memberships.user_id
            where notification_deliveries.club_id = ?
              and notification_deliveries.channel = 'EMAIL'
              and notification_deliveries.status in ('FAILED', 'DEAD')
            order by notification_deliveries.updated_at desc, notification_deliveries.created_at desc
            limit 10
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toHostNotificationFailure() } },
            clubId.dbString(),
        )
}

private fun notificationDeliveryUpdatedAtDescCursor(updatedAt: OffsetDateTime, createdAt: OffsetDateTime, id: String): String? =
    CursorCodec.encode(
        mapOf(
            "updatedAt" to updatedAt.toString(),
            "createdAt" to createdAt.toString(),
            "id" to id,
        ),
    )

private fun <T> pageFromRows(rows: List<T>, limit: Int, cursorFor: (T) -> String?): CursorPage<T> {
    val visibleRows = rows.take(limit)
    return CursorPage(
        items = visibleRows,
        nextCursor = if (rows.size > limit) visibleRows.lastOrNull()?.let(cursorFor) else null,
    )
}

private data class NotificationDeliveryUpdatedAtDescCursor(
    val updatedAt: OffsetDateTime,
    val createdAt: OffsetDateTime,
    val id: String,
) {
    companion object {
        fun from(cursor: Map<String, String>): NotificationDeliveryUpdatedAtDescCursor? {
            val updatedAt = cursor["updatedAt"]?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
                ?: return null
            val createdAt = cursor["createdAt"]?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
                ?: return null
            val id = cursor["id"]?.takeIf { it.isNotBlank() } ?: return null
            return NotificationDeliveryUpdatedAtDescCursor(updatedAt, createdAt, id)
        }
    }
}
