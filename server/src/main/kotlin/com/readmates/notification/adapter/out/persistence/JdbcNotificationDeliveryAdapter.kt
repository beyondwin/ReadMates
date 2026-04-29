package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.notificationDeliveryDedupeKey
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.math.max

private const val DELIVERY_LEASE_TIMEOUT_MINUTES = 15
private const val MAX_DELIVERY_ERROR_LENGTH = 500
private const val SKIP_REASON_EMAIL_DISABLED = "EMAIL_DISABLED"

private data class DeliveryRecipient(
    val membershipId: UUID,
    val displayName: String?,
    val emailAllowed: Boolean,
)

private data class DeliveryCopy(
    val title: String,
    val body: String,
    val deepLinkPath: String,
    val emailSubject: String,
    val emailBodyText: String,
)

private data class DeliveryInsertRow(
    val id: UUID,
    val recipient: DeliveryRecipient,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val skipReason: String?,
)

@Repository
class JdbcNotificationDeliveryAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : NotificationDeliveryPort {
    @Transactional
    override fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> {
        val jdbcTemplate = jdbcTemplate()
        val recipients = recipientsFor(jdbcTemplate, message)
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

        insertDeliveryRows(jdbcTemplate, message, rows)
        insertMemberNotifications(jdbcTemplate, message, recipients)
        return deliveryItemsForEvent(jdbcTemplate, message)
    }

    @Transactional
    override fun claimEmailDelivery(id: UUID): ClaimedNotificationDeliveryItem? {
        val jdbcTemplate = jdbcTemplate()
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
            { resultSet, _ -> resultSet.uuid("id") },
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

        return claimedDeliveryItems(jdbcTemplate, listOf(selectedId)).firstOrNull()
    }

    @Transactional
    override fun claimEmailDeliveries(limit: Int): List<ClaimedNotificationDeliveryItem> {
        if (limit <= 0) {
            return emptyList()
        }

        val jdbcTemplate = jdbcTemplate()
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
            { resultSet, _ -> resultSet.uuid("id") },
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

        return claimedDeliveryItems(jdbcTemplate, ids)
    }

    override fun markDeliverySent(id: UUID, lockedAt: OffsetDateTime): Boolean =
        jdbcTemplate().update(
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

    override fun markDeliveryFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean =
        jdbcTemplate().update(
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

    override fun markDeliveryDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean =
        jdbcTemplate().update(
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

    override fun countByStatus(
        clubId: UUID,
        channel: NotificationChannel?,
        status: NotificationDeliveryStatus,
    ): Int {
        val channelPredicate = if (channel == null) "" else "and channel = ?"
        val args = mutableListOf<Any>(clubId.dbString(), status.name)
        channel?.let { args += it.name }
        return jdbcTemplate().queryForObject(
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

    private fun recipientsFor(jdbcTemplate: JdbcTemplate, message: NotificationEventMessage): List<DeliveryRecipient> =
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
              and memberships.status in ('ACTIVE', 'VIEWER')
            """.trimIndent(),
            { resultSet, _ -> resultSet.toDeliveryRecipient() },
            message.clubId.dbString(),
            sessionId(message).dbString(),
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
              and memberships.status in ('ACTIVE', 'VIEWER')
              and (
                session_participants.membership_id is not null
                or memberships.role = 'HOST'
              )
            """.trimIndent(),
            { resultSet, _ -> resultSet.toDeliveryRecipient() },
            message.clubId.dbString(),
            sessionId(message).dbString(),
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
              and memberships.status in ('ACTIVE', 'VIEWER')
              and memberships.id <> ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toDeliveryRecipient() },
            message.clubId.dbString(),
            sessionId(message).dbString(),
            (message.payload.authorMembershipId ?: UUID(0, 0)).dbString(),
        )

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
                    val copy = copyFor(message, row.displayName)
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
            { resultSet, _ -> resultSet.toNotificationDeliveryItem(message) },
            message.eventId.dbString(),
            message.clubId.dbString(),
        )

    private fun claimedDeliveryItems(jdbcTemplate: JdbcTemplate, ids: List<UUID>): List<ClaimedNotificationDeliveryItem> {
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
              users.email as recipient_email,
              coalesce(memberships.short_name, users.name) as display_name,
              sessions.number as session_number,
              sessions.book_title
            from notification_deliveries
            join notification_event_outbox on notification_event_outbox.id = notification_deliveries.event_id
              and notification_event_outbox.club_id = notification_deliveries.club_id
            join memberships on memberships.id = notification_deliveries.recipient_membership_id
              and memberships.club_id = notification_deliveries.club_id
            join users on users.id = memberships.user_id
            join sessions on sessions.id = notification_event_outbox.aggregate_id
              and sessions.club_id = notification_event_outbox.club_id
            where notification_deliveries.id in ($placeholders)
            order by field(notification_deliveries.id, $placeholders)
            """.trimIndent(),
            { resultSet, _ -> resultSet.toClaimedNotificationDeliveryItem() },
            *orderedArgs,
        )
    }

    private fun resetStaleSendingRows(jdbcTemplate: JdbcTemplate) {
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
            """.trimIndent(),
            -DELIVERY_LEASE_TIMEOUT_MINUTES,
        )
    }

    private fun ResultSet.toDeliveryRecipient(): DeliveryRecipient =
        DeliveryRecipient(
            membershipId = uuid("recipient_membership_id"),
            displayName = getString("display_name"),
            emailAllowed = getBoolean("email_allowed"),
        )

    private fun ResultSet.toNotificationDeliveryItem(message: NotificationEventMessage): NotificationDeliveryItem {
        val channel = NotificationChannel.valueOf(getString("channel"))
        val copy = if (channel == NotificationChannel.EMAIL) copyFor(message, getString("display_name")) else null
        return NotificationDeliveryItem(
            id = uuid("id"),
            eventId = uuid("event_id"),
            clubId = uuid("club_id"),
            recipientMembershipId = uuid("recipient_membership_id"),
            channel = channel,
            status = NotificationDeliveryStatus.valueOf(getString("status")),
            attemptCount = getInt("attempt_count"),
            lockedAt = utcOffsetDateTimeOrNull("locked_at"),
            recipientEmail = if (channel == NotificationChannel.EMAIL) getString("recipient_email") else null,
            subject = copy?.emailSubject,
            bodyText = copy?.emailBodyText,
        )
    }

    private fun ResultSet.toClaimedNotificationDeliveryItem(): ClaimedNotificationDeliveryItem {
        val eventType = NotificationEventType.valueOf(getString("event_type"))
        val copy = copyFor(
            eventType = eventType,
            sessionId = uuid("aggregate_id"),
            sessionNumber = getInt("session_number"),
            bookTitle = getString("book_title"),
            displayName = getString("display_name"),
        )
        return ClaimedNotificationDeliveryItem(
            id = uuid("id"),
            eventId = uuid("event_id"),
            clubId = uuid("club_id"),
            recipientMembershipId = uuid("recipient_membership_id"),
            channel = NotificationChannel.valueOf(getString("channel")),
            status = NotificationDeliveryStatus.valueOf(getString("status")),
            attemptCount = getInt("attempt_count"),
            lockedAt = utcOffsetDateTime("locked_at"),
            recipientEmail = getString("recipient_email"),
            subject = copy.emailSubject,
            bodyText = copy.emailBodyText,
        )
    }

    private fun copyFor(message: NotificationEventMessage, displayName: String?): DeliveryCopy =
        copyFor(
            eventType = message.eventType,
            sessionId = sessionId(message),
            sessionNumber = message.payload.sessionNumber ?: 0,
            bookTitle = message.payload.bookTitle ?: "선정 도서",
            displayName = displayName,
        )

    private fun copyFor(
        eventType: NotificationEventType,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        displayName: String?,
    ): DeliveryCopy {
        val memberName = displayName ?: "멤버"
        return when (eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED -> DeliveryCopy(
                title = "다음 책이 공개되었습니다",
                body = "${sessionNumber}회차 책은 $bookTitle 입니다.",
                deepLinkPath = "/sessions/$sessionId",
                emailSubject = "다음 책이 공개되었습니다",
                emailBodyText = """
                    ${memberName}님,

                    ${sessionNumber}회차 책은 $bookTitle 입니다.
                    ReadMates에서 모임 정보를 확인해 주세요.
                """.trimIndent(),
            )
            NotificationEventType.SESSION_REMINDER_DUE -> DeliveryCopy(
                title = "내일 독서모임이 있습니다",
                body = "내일 ${sessionNumber}회차 $bookTitle 모임이 있습니다.",
                deepLinkPath = "/sessions/$sessionId",
                emailSubject = "내일 독서모임이 있습니다",
                emailBodyText = """
                    ${memberName}님,

                    내일 ${sessionNumber}회차 $bookTitle 모임이 있습니다.
                    ReadMates에서 준비 내용을 확인해 주세요.
                """.trimIndent(),
            )
            NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> DeliveryCopy(
                title = "피드백 문서가 올라왔습니다",
                body = "${sessionNumber}회차 $bookTitle 피드백 문서가 올라왔습니다.",
                deepLinkPath = "/feedback-documents",
                emailSubject = "피드백 문서가 올라왔습니다",
                emailBodyText = """
                    ${memberName}님,

                    ${sessionNumber}회차 $bookTitle 피드백 문서가 올라왔습니다.
                    ReadMates에서 확인해 주세요.
                """.trimIndent(),
            )
            NotificationEventType.REVIEW_PUBLISHED -> DeliveryCopy(
                title = "새 서평이 공개되었습니다",
                body = "${sessionNumber}회차 $bookTitle 에 새 서평이 공개되었습니다.",
                deepLinkPath = "/notes?sessionId=$sessionId",
                emailSubject = "새 서평이 공개되었습니다",
                emailBodyText = """
                    ${memberName}님,

                    ${sessionNumber}회차 $bookTitle 에 새 서평이 공개되었습니다.
                    ReadMates에서 확인해 주세요.
                """.trimIndent(),
            )
        }
    }

    private fun sessionId(message: NotificationEventMessage): UUID =
        message.payload.sessionId ?: message.aggregateId

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("Notification delivery storage is unavailable")

    private data class MemberNotificationDeliveryRow(
        val id: UUID,
        val recipientMembershipId: UUID,
        val displayName: String?,
    )
}
