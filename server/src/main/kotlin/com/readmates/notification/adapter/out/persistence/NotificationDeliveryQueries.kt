package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationFailure
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.springframework.jdbc.core.JdbcTemplate
import java.time.OffsetDateTime
import java.util.UUID

internal class NotificationDeliveryQueries(
    private val rowMappers: NotificationDeliveryRowMappers,
) {
    fun findDeliveryStatus(jdbcTemplate: JdbcTemplate, id: UUID): NotificationDeliveryStatus? =
        jdbcTemplate.query(
            """
            select status
            from notification_deliveries
            where id = ?
            """.trimIndent(),
            { resultSet, _ -> NotificationDeliveryStatus.valueOf(resultSet.getString("status")) },
            id.dbString(),
        ).firstOrNull()

    fun deliveryBacklog(jdbcTemplate: JdbcTemplate): NotificationDeliveryBacklog {
        val counts = jdbcTemplate.query(
            """
            select status, count(*) as status_count
            from notification_deliveries
            where channel = 'EMAIL'
              and status in ('PENDING', 'FAILED', 'DEAD', 'SENDING')
            group by status
            """.trimIndent(),
            { resultSet, _ ->
                NotificationDeliveryStatus.valueOf(resultSet.getString("status")) to resultSet.getInt("status_count")
            },
        ).toMap()

        return NotificationDeliveryBacklog(
            pending = counts[NotificationDeliveryStatus.PENDING] ?: 0,
            failed = counts[NotificationDeliveryStatus.FAILED] ?: 0,
            dead = counts[NotificationDeliveryStatus.DEAD] ?: 0,
            sending = counts[NotificationDeliveryStatus.SENDING] ?: 0,
        )
    }

    fun countByStatus(
        jdbcTemplate: JdbcTemplate,
        clubId: UUID,
        channel: NotificationChannel?,
        status: NotificationDeliveryStatus,
    ): Int {
        val channelPredicate = if (channel == null) "" else "and channel = ?"
        val args = mutableListOf<Any>(clubId.dbString(), status.name)
        channel?.let { args += it.name }
        return jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_deliveries
            where club_id = ?
              and status = ?
              $channelPredicate
            """.trimIndent(),
            Int::class.java,
            *args.toTypedArray(),
        ) ?: 0
    }

    fun hostSummary(jdbcTemplate: JdbcTemplate, clubId: UUID): HostNotificationSummary =
        HostNotificationSummary(
            pending = countByStatus(jdbcTemplate, clubId, NotificationChannel.EMAIL, NotificationDeliveryStatus.PENDING),
            failed = countByStatus(jdbcTemplate, clubId, NotificationChannel.EMAIL, NotificationDeliveryStatus.FAILED),
            dead = countByStatus(jdbcTemplate, clubId, NotificationChannel.EMAIL, NotificationDeliveryStatus.DEAD),
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

    fun recipientsFor(jdbcTemplate: JdbcTemplate, message: NotificationEventMessage): List<DeliveryRecipient> =
        when (message.eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED ->
                sessionViewerRecipients(jdbcTemplate, message, "next_book_published_enabled", "sessions.state = 'DRAFT'")
            NotificationEventType.SESSION_REMINDER_DUE ->
                sessionViewerRecipients(jdbcTemplate, message, "session_reminder_due_enabled", "sessions.state in ('DRAFT', 'OPEN')")
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED ->
                feedbackRecipients(jdbcTemplate, message)
            NotificationEventType.REVIEW_PUBLISHED ->
                reviewRecipients(jdbcTemplate, message)
        }

    fun loadPersistedEventMessage(jdbcTemplate: JdbcTemplate, eventId: UUID): NotificationEventMessage =
        jdbcTemplate.query(
            """
            select notification_event_outbox.id,
                   notification_event_outbox.club_id,
                   clubs.slug as club_slug,
                   notification_event_outbox.event_type,
                   notification_event_outbox.aggregate_type,
                   notification_event_outbox.aggregate_id,
                   notification_event_outbox.payload_json,
                   notification_event_outbox.created_at,
                   clubs.name as club_name
            from notification_event_outbox
            join clubs on clubs.id = notification_event_outbox.club_id
            where notification_event_outbox.id = ?
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toNotificationEventMessage() } },
            eventId.dbString(),
        ).firstOrNull()
            ?: throw MissingNotificationEventOutboxException(
                "Notification event outbox row not found for eventId=$eventId",
            )

    private fun sessionViewerRecipients(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
        preferenceColumn: String,
        statePredicate: String,
    ): List<DeliveryRecipient> =
        jdbcTemplate.query(
            """
            select
              memberships.id as recipient_membership_id,
              coalesce(memberships.short_name, users.name) as display_name,
              (
                memberships.status = 'ACTIVE'
                and coalesce(notification_preferences.email_enabled, true)
                and coalesce(notification_preferences.$preferenceColumn, true)
              ) as email_allowed
            from sessions
            join memberships on memberships.club_id = sessions.club_id
            join users on users.id = memberships.user_id
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where sessions.club_id = ?
              and sessions.id = ?
              and $statePredicate
              and sessions.visibility in ('MEMBER', 'PUBLIC')
              and memberships.status = 'ACTIVE'
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toDeliveryRecipient() } },
            message.clubId.dbString(),
            rowMappers.sessionId(message).dbString(),
        )

    private fun feedbackRecipients(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
    ): List<DeliveryRecipient> =
        jdbcTemplate.query(
            """
            select
              memberships.id as recipient_membership_id,
              coalesce(memberships.short_name, users.name) as display_name,
              (
                memberships.status = 'ACTIVE'
                and session_participants.membership_id is not null
                and coalesce(notification_preferences.email_enabled, true)
                and coalesce(notification_preferences.feedback_document_published_enabled, true)
              ) as email_allowed
            from sessions
            join memberships on memberships.club_id = sessions.club_id
            join users on users.id = memberships.user_id
            left join session_participants on session_participants.club_id = sessions.club_id
              and session_participants.session_id = sessions.id
              and session_participants.membership_id = memberships.id
              and session_participants.participation_status = 'ACTIVE'
              and session_participants.attendance_status = 'ATTENDED'
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where sessions.club_id = ?
              and sessions.id = ?
              and sessions.state in ('CLOSED', 'PUBLISHED')
              and memberships.status = 'ACTIVE'
              and (
                session_participants.membership_id is not null
                or memberships.role = 'HOST'
              )
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toDeliveryRecipient() } },
            message.clubId.dbString(),
            rowMappers.sessionId(message).dbString(),
        )

    private fun reviewRecipients(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
    ): List<DeliveryRecipient> =
        jdbcTemplate.query(
            """
            select
              memberships.id as recipient_membership_id,
              coalesce(memberships.short_name, users.name) as display_name,
              (
                memberships.status = 'ACTIVE'
                and coalesce(notification_preferences.email_enabled, true)
                and coalesce(notification_preferences.review_published_enabled, false)
              ) as email_allowed
            from sessions
            join memberships on memberships.club_id = sessions.club_id
            join users on users.id = memberships.user_id
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where sessions.club_id = ?
              and sessions.id = ?
              and sessions.state = 'PUBLISHED'
              and sessions.visibility in ('MEMBER', 'PUBLIC')
              and memberships.status = 'ACTIVE'
              and memberships.id <> ?
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toDeliveryRecipient() } },
            message.clubId.dbString(),
            rowMappers.sessionId(message).dbString(),
            (message.payload.authorMembershipId ?: UUID(0, 0)).dbString(),
        )

    fun deliveryRowsForMemberNotifications(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
        membershipIds: List<UUID>,
    ): List<MemberNotificationDeliveryRow> {
        if (membershipIds.isEmpty()) {
            return emptyList()
        }

        val placeholders = membershipIds.joinToString(",") { "?" }
        return jdbcTemplate.query(
            """
            select
              notification_deliveries.id,
              notification_deliveries.recipient_membership_id,
              coalesce(memberships.short_name, users.name) as display_name
            from notification_deliveries
            join memberships on memberships.id = notification_deliveries.recipient_membership_id
              and memberships.club_id = notification_deliveries.club_id
            join users on users.id = memberships.user_id
            where notification_deliveries.event_id = ?
              and notification_deliveries.club_id = ?
              and notification_deliveries.channel = 'IN_APP'
              and notification_deliveries.recipient_membership_id in ($placeholders)
            """.trimIndent(),
            { resultSet, _ ->
                MemberNotificationDeliveryRow(
                    id = resultSet.uuid("id"),
                    recipientMembershipId = resultSet.uuid("recipient_membership_id"),
                    displayName = resultSet.getString("display_name"),
                )
            },
            *(listOf(message.eventId.dbString() as Any, message.clubId.dbString() as Any) +
                membershipIds.map { it.dbString() as Any }).toTypedArray(),
        )
    }

    fun deliveryItemsForEvent(jdbcTemplate: JdbcTemplate, message: NotificationEventMessage): List<NotificationDeliveryItem> =
        jdbcTemplate.query(
            """
            select
              notification_deliveries.id,
              notification_deliveries.event_id,
              notification_deliveries.club_id,
              notification_deliveries.recipient_membership_id,
              notification_deliveries.channel,
              notification_deliveries.status,
              notification_deliveries.attempt_count,
              notification_deliveries.locked_at,
              users.email as recipient_email,
              coalesce(memberships.short_name, users.name) as display_name
            from notification_deliveries
            join memberships on memberships.id = notification_deliveries.recipient_membership_id
              and memberships.club_id = notification_deliveries.club_id
            join users on users.id = memberships.user_id
            where notification_deliveries.event_id = ?
              and notification_deliveries.club_id = ?
            order by notification_deliveries.created_at, notification_deliveries.id
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toNotificationDeliveryItem(message) } },
            message.eventId.dbString(),
            message.clubId.dbString(),
        )

    fun claimedDeliveryItems(jdbcTemplate: JdbcTemplate, ids: List<UUID>): List<ClaimedNotificationDeliveryItem> {
        if (ids.isEmpty()) {
            return emptyList()
        }

        val placeholders = ids.joinToString(",") { "?" }
        val orderedArgs = (ids.map { it.dbString() as Any } + ids.map { it.dbString() as Any }).toTypedArray()
        return jdbcTemplate.query(
            """
            select
              notification_deliveries.id,
              notification_deliveries.event_id,
              notification_deliveries.club_id,
              notification_deliveries.recipient_membership_id,
              notification_deliveries.channel,
              notification_deliveries.status,
              notification_deliveries.attempt_count,
              notification_deliveries.locked_at,
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
            where notification_deliveries.id in ($placeholders)
            order by field(notification_deliveries.id, $placeholders)
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toClaimedNotificationDeliveryItem() } },
            *orderedArgs,
        )
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
