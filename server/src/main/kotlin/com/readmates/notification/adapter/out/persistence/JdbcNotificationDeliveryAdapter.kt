package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ClaimedNotificationDeliveryItem
import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationFailure
import com.readmates.notification.application.model.HostNotificationItem
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationDeliveryItem
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationDeliveryBacklog
import com.readmates.notification.application.model.clubScopedAppPath
import com.readmates.notification.application.model.notificationDeliveryDedupeKey
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.application.port.out.NotificationDeliveryPort
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
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
import tools.jackson.databind.ObjectMapper
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
    private val objectMapper: ObjectMapper,
) : NotificationDeliveryPort {
    private val payloadType = objectMapper.typeFactory.constructType(NotificationEventPayload::class.java)

    @Transactional
    override fun persistPlannedDeliveries(message: NotificationEventMessage): List<NotificationDeliveryItem> {
        val jdbcTemplate = jdbcTemplate()
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
        return deliveryItemsForEvent(jdbcTemplate, persistedMessage)
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

    @Transactional
    override fun claimEmailDeliveriesForClub(clubId: UUID, limit: Int): List<ClaimedNotificationDeliveryItem> {
        if (limit <= 0) {
            return emptyList()
        }

        val jdbcTemplate = jdbcTemplate()
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
            { resultSet, _ -> resultSet.uuid("id") },
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

        return claimedDeliveryItems(jdbcTemplate, ids)
    }

    @Transactional
    override fun claimHostEmailDelivery(clubId: UUID, id: UUID): ClaimedNotificationDeliveryItem? {
        val jdbcTemplate = jdbcTemplate()
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
            { resultSet, _ -> resultSet.uuid("id") },
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

        return claimedDeliveryItems(jdbcTemplate, listOf(selectedId)).firstOrNull()
    }

    override fun findDeliveryStatus(id: UUID): NotificationDeliveryStatus? =
        jdbcTemplate().query(
            """
            select status
            from notification_deliveries
            where id = ?
            """.trimIndent(),
            { resultSet, _ -> NotificationDeliveryStatus.valueOf(resultSet.getString("status")) },
            id.dbString(),
        ).firstOrNull()

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

    override fun restoreDeadEmailDeliveryForClub(clubId: UUID, id: UUID): Boolean =
        jdbcTemplate().update(
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

    override fun deliveryBacklog(): NotificationDeliveryBacklog {
        val counts = jdbcTemplate().query(
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

    override fun hostSummary(clubId: UUID): HostNotificationSummary =
        HostNotificationSummary(
            pending = countByStatus(clubId, NotificationChannel.EMAIL, NotificationDeliveryStatus.PENDING),
            failed = countByStatus(clubId, NotificationChannel.EMAIL, NotificationDeliveryStatus.FAILED),
            dead = countByStatus(clubId, NotificationChannel.EMAIL, NotificationDeliveryStatus.DEAD),
            sentLast24h = jdbcTemplate().queryForObject(
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
            latestFailures = latestFailures(clubId),
        )

    override fun listHostEmailItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList {
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
        args += query.limit.coerceIn(1, 100)

        val items = jdbcTemplate().query(
            """
            select
              notification_deliveries.id,
              notification_event_outbox.event_type,
              notification_deliveries.status,
              users.email as recipient_email,
              notification_deliveries.attempt_count,
              notification_deliveries.next_attempt_at,
              notification_deliveries.updated_at
            from notification_deliveries
            join notification_event_outbox on notification_event_outbox.id = notification_deliveries.event_id
              and notification_event_outbox.club_id = notification_deliveries.club_id
            join memberships on memberships.id = notification_deliveries.recipient_membership_id
              and memberships.club_id = notification_deliveries.club_id
            join users on users.id = memberships.user_id
            where ${predicates.joinToString(" and ")}
            order by notification_deliveries.updated_at desc, notification_deliveries.created_at desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostNotificationItem() },
            *args.toTypedArray(),
        )

        return HostNotificationItemList(items)
    }

    override fun hostEmailDetail(clubId: UUID, id: UUID): HostNotificationDetail? =
        jdbcTemplate().query(
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
            { resultSet, _ -> resultSet.toHostNotificationDetail() },
            clubId.dbString(),
            id.dbString(),
        ).firstOrNull()

    override fun listHostDeliveries(
        clubId: UUID,
        status: NotificationDeliveryStatus?,
        channel: NotificationChannel?,
        limit: Int,
    ): List<HostNotificationDelivery> {
        val statusPredicate = if (status == null) "" else "and notification_deliveries.status = ?"
        val channelPredicate = if (channel == null) "" else "and notification_deliveries.channel = ?"
        val args = mutableListOf<Any>(clubId.dbString())
        status?.let { args += it.name }
        channel?.let { args += it.name }
        args += limit
        return jdbcTemplate().query(
            """
            select
              notification_deliveries.id,
              notification_deliveries.event_id,
              notification_deliveries.channel,
              notification_deliveries.status,
              case when notification_deliveries.channel = 'EMAIL' then users.email else null end as recipient_email,
              notification_deliveries.attempt_count,
              notification_deliveries.updated_at
            from notification_deliveries
            join memberships on memberships.id = notification_deliveries.recipient_membership_id
              and memberships.club_id = notification_deliveries.club_id
            join users on users.id = memberships.user_id
            where notification_deliveries.club_id = ?
              $statusPredicate
              $channelPredicate
            order by notification_deliveries.updated_at desc, notification_deliveries.created_at desc, notification_deliveries.id desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostNotificationDelivery() },
            *args.toTypedArray(),
        )
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
                   notification_event_outbox.created_at
            from notification_event_outbox
            join clubs on clubs.id = notification_event_outbox.club_id
            where notification_event_outbox.id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNotificationEventMessage() },
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
              and memberships.status = 'ACTIVE'
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
              and memberships.status = 'ACTIVE'
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
              notification_event_outbox.payload_json,
              clubs.slug as club_slug,
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
            { resultSet, _ -> resultSet.toClaimedNotificationDeliveryItem() },
            *orderedArgs,
        )
    }

    private fun latestFailures(clubId: UUID): List<HostNotificationFailure> =
        jdbcTemplate().query(
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
            { resultSet, _ -> resultSet.toHostNotificationFailure() },
            clubId.dbString(),
        )

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

    private fun ResultSet.toNotificationEventMessage(): NotificationEventMessage =
        NotificationEventMessage(
            eventId = uuid("id"),
            clubId = uuid("club_id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            aggregateType = getString("aggregate_type"),
            aggregateId = uuid("aggregate_id"),
            occurredAt = utcOffsetDateTime("created_at"),
            clubSlug = getString("club_slug"),
            payload = parsePayload(getString("payload_json")),
        )

    private fun ResultSet.toClaimedNotificationDeliveryItem(): ClaimedNotificationDeliveryItem {
        val eventType = NotificationEventType.valueOf(getString("event_type"))
        val copy = copyFor(
            eventType = eventType,
            aggregateId = uuid("aggregate_id"),
            payload = parsePayload(getString("payload_json")),
            clubSlug = getString("club_slug"),
            displayName = getString("display_name"),
        )
        return ClaimedNotificationDeliveryItem(
            id = uuid("id"),
            eventId = uuid("event_id"),
            eventType = eventType,
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

    private fun ResultSet.toHostNotificationDelivery(): HostNotificationDelivery =
        HostNotificationDelivery(
            id = uuid("id"),
            eventId = uuid("event_id"),
            channel = NotificationChannel.valueOf(getString("channel")),
            status = NotificationDeliveryStatus.valueOf(getString("status")),
            recipientEmail = getString("recipient_email"),
            attemptCount = getInt("attempt_count"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )

    private fun ResultSet.toHostNotificationFailure(): HostNotificationFailure =
        HostNotificationFailure(
            id = uuid("id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            recipientEmail = getString("recipient_email"),
            attemptCount = getInt("attempt_count"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )

    private fun ResultSet.toHostNotificationItem(): HostNotificationItem =
        HostNotificationItem(
            id = uuid("id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            status = NotificationDeliveryStatus.valueOf(getString("status")).toOutboxStatus(),
            recipientEmail = getString("recipient_email"),
            attemptCount = getInt("attempt_count"),
            nextAttemptAt = utcOffsetDateTime("next_attempt_at"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )

    private fun ResultSet.toHostNotificationDetail(): HostNotificationDetail {
        val eventType = NotificationEventType.valueOf(getString("event_type"))
        val payload = parsePayload(getString("payload_json"))
        val copy = copyFor(
            eventType = eventType,
            aggregateId = uuid("aggregate_id"),
            payload = payload,
            clubSlug = getString("club_slug"),
            displayName = getString("display_name"),
        )
        return HostNotificationDetail(
            id = uuid("id"),
            eventType = eventType,
            status = NotificationDeliveryStatus.valueOf(getString("status")).toOutboxStatus(),
            recipientEmail = getString("recipient_email"),
            subject = copy.emailSubject,
            deepLinkPath = copy.deepLinkPath,
            metadata = mapOf(
                "sessionNumber" to payload.sessionNumber,
                "bookTitle" to payload.bookTitle,
            ).filterValues { it != null },
            attemptCount = getInt("attempt_count"),
            lastError = getString("last_error"),
            createdAt = utcOffsetDateTime("created_at"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )
    }

    private fun copyFor(message: NotificationEventMessage, displayName: String?): DeliveryCopy =
        copyFor(
            eventType = message.eventType,
            aggregateId = message.aggregateId,
            payload = message.payload,
            clubSlug = requireNotNull(message.clubSlug) { "Notification event ${message.eventId} missing clubSlug" },
            displayName = displayName,
        )

    private fun copyFor(
        eventType: NotificationEventType,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        clubSlug: String,
        displayName: String?,
    ): DeliveryCopy =
        copyFor(
            eventType = eventType,
            sessionId = payload.sessionId ?: aggregateId,
            sessionNumber = payload.sessionNumber ?: 0,
            bookTitle = payload.bookTitle ?: "선정 도서",
            clubSlug = clubSlug,
            displayName = displayName,
        )

    private fun copyFor(
        eventType: NotificationEventType,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        clubSlug: String,
        displayName: String?,
    ): DeliveryCopy {
        val memberName = displayName ?: "멤버"
        return when (eventType) {
            NotificationEventType.NEXT_BOOK_PUBLISHED -> DeliveryCopy(
                title = "다음 책이 공개되었습니다",
                body = "${sessionNumber}회차 책은 $bookTitle 입니다.",
                deepLinkPath = clubScopedAppPath(clubSlug, "/sessions/$sessionId"),
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
                deepLinkPath = clubScopedAppPath(clubSlug, "/sessions/$sessionId"),
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
                deepLinkPath = clubScopedAppPath(clubSlug, "/archive?view=report"),
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
                deepLinkPath = clubScopedAppPath(clubSlug, "/notes?sessionId=$sessionId"),
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

    private fun parsePayload(rawPayload: String): NotificationEventPayload =
        objectMapper.readValue(rawPayload, payloadType)

    private fun NotificationDeliveryStatus.toOutboxStatus(): NotificationOutboxStatus =
        when (this) {
            NotificationDeliveryStatus.PENDING -> NotificationOutboxStatus.PENDING
            NotificationDeliveryStatus.SENDING -> NotificationOutboxStatus.SENDING
            NotificationDeliveryStatus.SENT -> NotificationOutboxStatus.SENT
            NotificationDeliveryStatus.FAILED -> NotificationOutboxStatus.FAILED
            NotificationDeliveryStatus.DEAD -> NotificationOutboxStatus.DEAD
            NotificationDeliveryStatus.SKIPPED -> NotificationOutboxStatus.SENT
        }

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("Notification delivery storage is unavailable")

    private data class MemberNotificationDeliveryRow(
        val id: UUID,
        val recipientMembershipId: UUID,
        val displayName: String?,
    )
}

class MissingNotificationEventOutboxException(
    message: String,
) : RuntimeException(message)
