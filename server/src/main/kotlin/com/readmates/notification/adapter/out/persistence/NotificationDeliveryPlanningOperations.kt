package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.notificationDeliveryDedupeKey
import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.PreparedStatement
import java.util.UUID

private const val SKIP_REASON_EMAIL_DISABLED = "EMAIL_DISABLED"

internal class NotificationDeliveryPlanningOperations(
    private val rowMappers: NotificationDeliveryRowMappers,
) {
    fun persistPlannedDeliveries(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
    ): List<NotificationDeliveryItem> {
        val persistedMessage = loadPersistedEventMessage(jdbcTemplate, message.eventId)
        val existingDeliveries = deliveryItemsForEvent(jdbcTemplate, persistedMessage)
        if (existingDeliveries.isNotEmpty()) {
            return existingDeliveries
        }

        val recipients = recipientsFor(jdbcTemplate, persistedMessage)
        if (recipients.isEmpty()) {
            return emptyList()
        }

        val rows = recipients.flatMap { recipient ->
            deliveryRowsForRecipient(persistedMessage, recipient)
        }

        insertDeliveryRows(jdbcTemplate, persistedMessage, rows)
        insertMemberNotifications(jdbcTemplate, persistedMessage, recipients)
        return deliveryItemsForEvent(jdbcTemplate, persistedMessage)
    }

    private fun loadPersistedEventMessage(jdbcTemplate: JdbcTemplate, eventId: UUID): NotificationEventMessage =
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

    private fun recipientsFor(jdbcTemplate: JdbcTemplate, message: NotificationEventMessage): List<DeliveryRecipient> =
        message.payload.manualDispatch?.let { manualRecipients(jdbcTemplate, message) } ?: when (message.eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED ->
                sessionViewerRecipients(jdbcTemplate, message, "next_book_published_enabled", "sessions.state = 'DRAFT'")
            NotificationEventType.SESSION_REMINDER_DUE ->
                sessionViewerRecipients(jdbcTemplate, message, "session_reminder_due_enabled", "sessions.state in ('DRAFT', 'OPEN')")
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED ->
                feedbackRecipients(jdbcTemplate, message)
            NotificationEventType.REVIEW_PUBLISHED ->
                reviewRecipients(jdbcTemplate, message)
        }

    private fun deliveryRowsForRecipient(
        message: NotificationEventMessage,
        recipient: DeliveryRecipient,
    ): List<DeliveryInsertRow> {
        val manual = message.payload.manualDispatch
        val requested = manual?.requestedChannels
        val frozenInAppIds = manual?.inAppMembershipIds?.toSet().orEmpty()
        val frozenEmailIds = manual?.emailMembershipIds?.toSet().orEmpty()
        val hasFrozenSnapshot = manual != null && (
            manual.targetMembershipIds.isNotEmpty() ||
                manual.inAppMembershipIds.isNotEmpty() ||
                manual.emailMembershipIds.isNotEmpty()
            )
        val includeInApp = if (hasFrozenSnapshot) {
            recipient.membershipId in frozenInAppIds
        } else {
            requested == null ||
                requested == ManualNotificationRequestedChannels.IN_APP ||
                requested == ManualNotificationRequestedChannels.BOTH
        }
        val includeEmail = if (hasFrozenSnapshot) {
            recipient.membershipId in frozenEmailIds
        } else {
            requested == null ||
                requested == ManualNotificationRequestedChannels.EMAIL ||
                requested == ManualNotificationRequestedChannels.BOTH
        }
        return buildList {
            if (includeInApp) {
                add(
                    DeliveryInsertRow(
                        id = UUID.randomUUID(),
                        recipient = recipient,
                        channel = NotificationChannel.IN_APP,
                        status = NotificationDeliveryStatus.SENT,
                        skipReason = null,
                    ),
                )
            }
            if (includeEmail) {
                add(
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
        }
    }

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

    private fun manualRecipients(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
    ): List<DeliveryRecipient> {
        val manual = requireNotNull(message.payload.manualDispatch)
        if (
            manual.targetMembershipIds.isNotEmpty() ||
            manual.inAppMembershipIds.isNotEmpty() ||
            manual.emailMembershipIds.isNotEmpty()
        ) {
            return frozenManualRecipients(jdbcTemplate, message)
        }
        return legacyManualRecipients(jdbcTemplate, message)
    }

    private fun legacyManualRecipients(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
    ): List<DeliveryRecipient> {
        val manual = requireNotNull(message.payload.manualDispatch)
        val baseIds = manualBaseMembershipIds(jdbcTemplate, message)
        val includedIds = activeMembershipIds(jdbcTemplate, message.clubId, manual.includedMembershipIds)
        val finalIds = (baseIds - manual.excludedMembershipIds.toSet() + includedIds).toList()
        if (finalIds.isEmpty()) {
            return emptyList()
        }
        val placeholders = finalIds.joinToString(",") { "?" }
        val preferenceColumn = when (message.eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED -> "next_book_published_enabled"
            NotificationEventType.SESSION_REMINDER_DUE -> "session_reminder_due_enabled"
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> "feedback_document_published_enabled"
            NotificationEventType.REVIEW_PUBLISHED -> "review_published_enabled"
        }
        return jdbcTemplate.query(
            """
            select
              memberships.id as recipient_membership_id,
              coalesce(memberships.short_name, users.name) as display_name,
              (
                users.email is not null
                and users.email <> ''
                and coalesce(notification_preferences.email_enabled, true)
                and coalesce(notification_preferences.$preferenceColumn, true)
              ) as email_allowed
            from memberships
            join users on users.id = memberships.user_id
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where memberships.club_id = ?
              and memberships.status = 'ACTIVE'
              and memberships.id in ($placeholders)
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toDeliveryRecipient() } },
            *(listOf(message.clubId.dbString() as Any) + finalIds.map { it.dbString() as Any }).toTypedArray(),
        )
    }

    private fun frozenManualRecipients(
        jdbcTemplate: JdbcTemplate,
        message: NotificationEventMessage,
    ): List<DeliveryRecipient> {
        val manual = requireNotNull(message.payload.manualDispatch)
        val finalIds = manual.targetMembershipIds.distinct()
        if (finalIds.isEmpty()) return emptyList()
        val placeholders = finalIds.joinToString(",") { "?" }
        val emailIds = manual.emailMembershipIds.distinct()
        val emailPredicate = if (emailIds.isEmpty()) {
            "false"
        } else {
            "memberships.id in (${emailIds.joinToString(",") { "?" }})"
        }
        val args = if (emailIds.isEmpty()) {
            listOf(message.clubId.dbString() as Any) + finalIds.map { it.dbString() as Any }
        } else {
            emailIds.map { it.dbString() as Any } +
                listOf(message.clubId.dbString() as Any) +
                finalIds.map { it.dbString() as Any }
        }
        return jdbcTemplate.query(
            """
            select
              memberships.id as recipient_membership_id,
              coalesce(memberships.short_name, users.name) as display_name,
              (
                users.email is not null
                and users.email <> ''
                and $emailPredicate
              ) as email_allowed
            from memberships
            join users on users.id = memberships.user_id
            where memberships.club_id = ?
              and memberships.status = 'ACTIVE'
              and memberships.id in ($placeholders)
            """.trimIndent(),
            { resultSet, _ -> with(rowMappers) { resultSet.toDeliveryRecipient() } },
            *args.toTypedArray(),
        )
    }

    private fun manualBaseMembershipIds(jdbcTemplate: JdbcTemplate, message: NotificationEventMessage): Set<UUID> {
        val manual = requireNotNull(message.payload.manualDispatch)
        val sessionId = rowMappers.sessionId(message)
        val sql = when (manual.audience) {
            ManualNotificationAudience.ALL_ACTIVE_MEMBERS -> """
                select memberships.id
                from memberships
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
            """
            ManualNotificationAudience.SESSION_PARTICIPANTS -> """
                select memberships.id
                from memberships
                join session_participants on session_participants.membership_id = memberships.id
                  and session_participants.club_id = memberships.club_id
                  and session_participants.session_id = ?
                  and session_participants.participation_status = 'ACTIVE'
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
            """
            ManualNotificationAudience.CONFIRMED_ATTENDEES -> """
                select memberships.id
                from memberships
                join session_participants on session_participants.membership_id = memberships.id
                  and session_participants.club_id = memberships.club_id
                  and session_participants.session_id = ?
                  and session_participants.participation_status = 'ACTIVE'
                  and session_participants.attendance_status = 'ATTENDED'
                where memberships.club_id = ?
                  and memberships.status = 'ACTIVE'
            """
        }.trimIndent()
        val args = if (manual.audience == ManualNotificationAudience.ALL_ACTIVE_MEMBERS) {
            arrayOf(message.clubId.dbString())
        } else {
            arrayOf(sessionId.dbString(), message.clubId.dbString())
        }
        return jdbcTemplate.query(sql, { rs, _ -> rs.uuid("id") }, *args).toSet()
    }

    private fun activeMembershipIds(jdbcTemplate: JdbcTemplate, clubId: UUID, membershipIds: List<UUID>): Set<UUID> {
        if (membershipIds.isEmpty()) return emptySet()
        val placeholders = membershipIds.joinToString(",") { "?" }
        return jdbcTemplate.query(
            """
            select id
            from memberships
            where club_id = ?
              and status = 'ACTIVE'
              and id in ($placeholders)
            """.trimIndent(),
            { rs, _ -> rs.uuid("id") },
            *(listOf(clubId.dbString() as Any) + membershipIds.map { it.dbString() as Any }).toTypedArray(),
        ).toSet()
    }

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
        val inAppRows = deliveryRowsForMemberNotifications(jdbcTemplate, message, recipients.map { it.membershipId })
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

    private fun deliveryRowsForMemberNotifications(
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

    private fun deliveryItemsForEvent(jdbcTemplate: JdbcTemplate, message: NotificationEventMessage): List<NotificationDeliveryItem> =
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
}

class MissingNotificationEventOutboxException(
    message: String,
) : RuntimeException(message)
