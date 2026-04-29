package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.HostNotificationFailure
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItem
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationItemQuery
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationOutboxBacklog
import com.readmates.notification.application.model.NotificationOutboxItem
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.port.out.NotificationOutboxPort
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.sql.ResultSet
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.math.max

private const val AGGREGATE_TYPE_SESSION = "SESSION"
private const val MAX_LAST_ERROR_LENGTH = 500
private const val MAX_METADATA_JSON_LENGTH = 4_000
private const val MAX_METADATA_ENTRIES = 25
private const val MAX_METADATA_LIST_ITEMS = 20
private const val MAX_METADATA_STRING_LENGTH = 200
private val EMAIL_LIKE_PATTERN = Regex("""[^\s@]+@[^\s@]+\.[^\s@]+""")

private data class SessionNotificationRecipient(
    val membershipId: UUID,
    val email: String,
    val displayName: String?,
    val sessionNumber: Int,
    val bookTitle: String,
)

private data class ReminderNotificationRecipient(
    val clubId: UUID,
    val sessionId: UUID,
    val membershipId: UUID,
    val email: String,
    val displayName: String?,
    val sessionNumber: Int,
    val bookTitle: String,
)

@Repository
class JdbcNotificationOutboxAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
    private val objectMapper: ObjectMapper,
) : NotificationOutboxPort {
    private val metadataType = objectMapper.typeFactory.constructMapType(Map::class.java, String::class.java, Any::class.java)

    @Transactional
    override fun enqueueFeedbackDocumentPublished(clubId: UUID, sessionId: UUID): Int {
        val recipients = jdbcTemplate().query(
            """
            select
              memberships.id as recipient_membership_id,
              users.email,
              coalesce(memberships.short_name, users.name) as display_name,
              sessions.number as session_number,
              sessions.book_title
            from session_participants
            join memberships on memberships.id = session_participants.membership_id
              and memberships.club_id = session_participants.club_id
            join users on users.id = memberships.user_id
            join sessions on sessions.id = session_participants.session_id
              and sessions.club_id = session_participants.club_id
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where session_participants.club_id = ?
              and session_participants.session_id = ?
              and session_participants.participation_status = 'ACTIVE'
              and session_participants.attendance_status = 'ATTENDED'
              and memberships.status = 'ACTIVE'
              and sessions.state in ('CLOSED', 'PUBLISHED')
              and coalesce(notification_preferences.email_enabled, true)
              and coalesce(notification_preferences.feedback_document_published_enabled, true)
            """.trimIndent(),
            { resultSet, _ -> resultSet.toSessionNotificationRecipient() },
            clubId.dbString(),
            sessionId.dbString(),
        )

        return recipients.sumOf { recipient ->
            insertOutbox(
                clubId = clubId,
                eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
                aggregateId = sessionId,
                recipientMembershipId = recipient.membershipId,
                recipientEmail = recipient.email,
                recipientDisplayName = recipient.displayName,
                subject = "피드백 문서가 올라왔습니다",
                bodyText = """
                    ${recipient.displayName ?: "멤버"}님,

                    ${recipient.sessionNumber}회차 ${recipient.bookTitle} 피드백 문서가 올라왔습니다.
                    ReadMates에서 확인해 주세요.
                """.trimIndent(),
                deepLinkPath = "/feedback-documents",
                metadata = mapOf(
                    "sessionNumber" to recipient.sessionNumber,
                    "bookTitle" to recipient.bookTitle,
                ),
            )
        }
    }

    @Transactional
    override fun enqueueNextBookPublished(clubId: UUID, sessionId: UUID): Int {
        val recipients = jdbcTemplate().query(
            """
            select
              memberships.id as recipient_membership_id,
              users.email,
              coalesce(memberships.short_name, users.name) as display_name,
              sessions.number as session_number,
              sessions.book_title
            from memberships
            join users on users.id = memberships.user_id
            join sessions on sessions.club_id = memberships.club_id
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where memberships.club_id = ?
              and sessions.id = ?
              and memberships.status = 'ACTIVE'
              and sessions.state = 'DRAFT'
              and sessions.visibility in ('MEMBER', 'PUBLIC')
              and coalesce(notification_preferences.email_enabled, true)
              and coalesce(notification_preferences.next_book_published_enabled, true)
            """.trimIndent(),
            { resultSet, _ -> resultSet.toSessionNotificationRecipient() },
            clubId.dbString(),
            sessionId.dbString(),
        )

        return recipients.sumOf { recipient ->
            insertOutbox(
                clubId = clubId,
                eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
                aggregateId = sessionId,
                recipientMembershipId = recipient.membershipId,
                recipientEmail = recipient.email,
                recipientDisplayName = recipient.displayName,
                subject = "다음 책이 공개되었습니다",
                bodyText = """
                    ${recipient.displayName ?: "멤버"}님,

                    ${recipient.sessionNumber}회차 책은 ${recipient.bookTitle}입니다.
                    ReadMates에서 모임 정보를 확인해 주세요.
                """.trimIndent(),
                deepLinkPath = "/sessions/$sessionId",
                metadata = mapOf(
                    "sessionNumber" to recipient.sessionNumber,
                    "bookTitle" to recipient.bookTitle,
                ),
            )
        }
    }

    @Transactional
    override fun enqueueSessionReminderDue(targetDate: LocalDate): Int {
        val recipients = jdbcTemplate().query(
            """
            select
              sessions.club_id,
              sessions.id as session_id,
              memberships.id as recipient_membership_id,
              users.email,
              coalesce(memberships.short_name, users.name) as display_name,
              sessions.number as session_number,
              sessions.book_title
            from sessions
            join memberships on memberships.club_id = sessions.club_id
            join users on users.id = memberships.user_id
            left join notification_preferences on notification_preferences.membership_id = memberships.id
              and notification_preferences.club_id = memberships.club_id
            where sessions.session_date = ?
              and sessions.state in ('DRAFT', 'OPEN')
              and sessions.visibility in ('MEMBER', 'PUBLIC')
              and memberships.status = 'ACTIVE'
              and coalesce(notification_preferences.email_enabled, true)
              and coalesce(notification_preferences.session_reminder_due_enabled, true)
            """.trimIndent(),
            { resultSet, _ -> resultSet.toReminderNotificationRecipient() },
            targetDate,
        )

        return recipients.sumOf { recipient ->
            insertOutbox(
                clubId = recipient.clubId,
                eventType = NotificationEventType.SESSION_REMINDER_DUE,
                aggregateId = recipient.sessionId,
                recipientMembershipId = recipient.membershipId,
                recipientEmail = recipient.email,
                recipientDisplayName = recipient.displayName,
                subject = "내일 독서모임이 있습니다",
                bodyText = """
                    ${recipient.displayName ?: "멤버"}님,

                    내일 ${recipient.sessionNumber}회차 ${recipient.bookTitle} 모임이 있습니다.
                    ReadMates에서 준비 내용을 확인해 주세요.
                """.trimIndent(),
                deepLinkPath = "/sessions/${recipient.sessionId}",
                metadata = mapOf(
                    "sessionNumber" to recipient.sessionNumber,
                    "bookTitle" to recipient.bookTitle,
                ),
            )
        }
    }

    @Transactional
    override fun claimPending(limit: Int): List<NotificationOutboxItem> {
        return claimPendingRows(limit, clubId = null)
    }

    @Transactional
    override fun claimPendingForClub(clubId: UUID, limit: Int): List<NotificationOutboxItem> {
        return claimPendingRows(limit, clubId)
    }

    private fun claimPendingRows(limit: Int, clubId: UUID?): List<NotificationOutboxItem> {
        if (limit <= 0) {
            return emptyList()
        }

        val jdbcTemplate = jdbcTemplate()
        resetStaleSendingRows(jdbcTemplate, clubId)
        val clubPredicate = if (clubId == null) "" else "and club_id = ?"
        val selectArgs = if (clubId == null) {
            arrayOf(limit as Any)
        } else {
            arrayOf(clubId.dbString() as Any, limit as Any)
        }
        val ids = jdbcTemplate.query(
            """
            select id
            from notification_outbox
            where status in ('PENDING', 'FAILED')
              and next_attempt_at <= utc_timestamp(6)
              $clubPredicate
            order by next_attempt_at, created_at
            limit ?
            for update skip locked
            """.trimIndent(),
            { resultSet, _ -> resultSet.uuid("id") },
            *selectArgs,
        )
        if (ids.isEmpty()) {
            return emptyList()
        }

        val placeholders = ids.joinToString(",") { "?" }
        val idArgs = ids.map { it.dbString() as Any }.toTypedArray()
        jdbcTemplate.update(
            """
            update notification_outbox
            set status = 'SENDING',
                locked_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where id in ($placeholders)
              and status in ('PENDING', 'FAILED')
            """.trimIndent(),
            *idArgs,
        )

        val orderedArgs = (ids.map { it.dbString() as Any } + ids.map { it.dbString() as Any }).toTypedArray()
        return jdbcTemplate.query(
            """
            select id, club_id, event_type, recipient_email, subject, body_text,
                   deep_link_path, status, attempt_count, locked_at
            from notification_outbox
            where id in ($placeholders)
            order by field(id, $placeholders)
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNotificationOutboxItem() },
            *orderedArgs,
        )
    }

    override fun markSent(id: UUID, lockedAt: OffsetDateTime): Boolean =
        jdbcTemplate().update(
            """
            update notification_outbox
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

    override fun markFailed(id: UUID, lockedAt: OffsetDateTime, error: String, nextAttemptDelayMinutes: Long): Boolean =
        jdbcTemplate().update(
            """
            update notification_outbox
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
            error.truncateForStorage(),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) > 0

    override fun markDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean =
        jdbcTemplate().update(
            """
            update notification_outbox
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
            error.truncateForStorage(),
            id.dbString(),
            lockedAt.toUtcLocalDateTime(),
        ) > 0

    override fun hostSummary(clubId: UUID): HostNotificationSummary =
        HostNotificationSummary(
            pending = countByStatus(clubId, NotificationOutboxStatus.PENDING),
            failed = countByStatus(clubId, NotificationOutboxStatus.FAILED),
            dead = countByStatus(clubId, NotificationOutboxStatus.DEAD),
            sentLast24h = jdbcTemplate().queryForObject(
                """
                select count(*)
                from notification_outbox
                where club_id = ?
                  and status = 'SENT'
                  and sent_at >= timestampadd(HOUR, -24, utc_timestamp(6))
                """.trimIndent(),
                Int::class.java,
                clubId.dbString(),
            ) ?: 0,
            latestFailures = latestFailures(clubId),
        )

    override fun listHostItems(clubId: UUID, query: HostNotificationItemQuery): HostNotificationItemList {
        val predicates = mutableListOf("club_id = ?")
        val args = mutableListOf<Any>(clubId.dbString())
        query.status?.let {
            predicates += "status = ?"
            args += it.name
        }
        query.eventType?.let {
            predicates += "event_type = ?"
            args += it.name
        }
        args += query.limit.coerceIn(1, 100)

        val items = jdbcTemplate().query(
            """
            select id, event_type, status, recipient_email, attempt_count, next_attempt_at, updated_at
            from notification_outbox
            where ${predicates.joinToString(" and ")}
            order by updated_at desc, created_at desc
            limit ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostNotificationItem() },
            *args.toTypedArray(),
        )

        return HostNotificationItemList(items)
    }

    override fun hostItemDetail(clubId: UUID, id: UUID): HostNotificationDetail? =
        jdbcTemplate().query(
            """
            select id, event_type, status, recipient_email, subject, deep_link_path, metadata,
                   attempt_count, last_error, created_at, updated_at
            from notification_outbox
            where club_id = ?
              and id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostNotificationDetail() },
            clubId.dbString(),
            id.dbString(),
        ).firstOrNull()

    override fun retryableHostItemDetail(clubId: UUID, id: UUID): HostNotificationDetail? =
        jdbcTemplate().query(
            """
            select id, event_type, status, recipient_email, subject, deep_link_path, metadata,
                   attempt_count, last_error, created_at, updated_at
            from notification_outbox
            where club_id = ?
              and id = ?
              and status in ('PENDING', 'FAILED')
              and next_attempt_at <= utc_timestamp(6)
            """.trimIndent(),
            { resultSet, _ -> resultSet.toHostNotificationDetail() },
            clubId.dbString(),
            id.dbString(),
        ).firstOrNull()

    @Transactional
    override fun claimOneForClub(clubId: UUID, id: UUID): NotificationOutboxItem? {
        val jdbcTemplate = jdbcTemplate()
        resetStaleSendingRows(jdbcTemplate, clubId)

        val claimedId = jdbcTemplate.query(
            """
            select id
            from notification_outbox
            where club_id = ?
              and id = ?
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
            update notification_outbox
            set status = 'SENDING',
                locked_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where club_id = ?
              and id = ?
              and status in ('PENDING', 'FAILED')
            """.trimIndent(),
            clubId.dbString(),
            claimedId.dbString(),
        )
        if (updated == 0) {
            return null
        }

        return jdbcTemplate.query(
            """
            select id, club_id, event_type, recipient_email, subject, body_text,
                   deep_link_path, status, attempt_count, locked_at
            from notification_outbox
            where club_id = ?
              and id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNotificationOutboxItem() },
            clubId.dbString(),
            claimedId.dbString(),
        ).firstOrNull()
    }

    override fun restoreDeadForClub(clubId: UUID, id: UUID): Boolean =
        jdbcTemplate().update(
            """
            update notification_outbox
            set status = 'PENDING',
                next_attempt_at = utc_timestamp(6),
                locked_at = null,
                updated_at = utc_timestamp(6)
            where club_id = ?
              and id = ?
              and status = 'DEAD'
            """.trimIndent(),
            clubId.dbString(),
            id.dbString(),
        ) > 0

    override fun outboxBacklog(): NotificationOutboxBacklog {
        val counts = jdbcTemplate().query(
            """
            select status, count(*) as status_count
            from notification_outbox
            where status in ('PENDING', 'FAILED', 'DEAD', 'SENDING')
            group by status
            """.trimIndent(),
            { resultSet, _ ->
                NotificationOutboxStatus.valueOf(resultSet.getString("status")) to resultSet.getInt("status_count")
            },
        ).toMap()

        return NotificationOutboxBacklog(
            pending = counts[NotificationOutboxStatus.PENDING] ?: 0,
            failed = counts[NotificationOutboxStatus.FAILED] ?: 0,
            dead = counts[NotificationOutboxStatus.DEAD] ?: 0,
            sending = counts[NotificationOutboxStatus.SENDING] ?: 0,
        )
    }

    override fun getPreferences(member: CurrentMember): NotificationPreferences =
        jdbcTemplate().query(
            """
            select
              email_enabled,
              next_book_published_enabled,
              session_reminder_due_enabled,
              feedback_document_published_enabled,
              review_published_enabled
            from notification_preferences
            where membership_id = ?
              and club_id = ?
            """.trimIndent(),
            { resultSet, _ -> resultSet.toNotificationPreferences() },
            member.membershipId.dbString(),
            member.clubId.dbString(),
        ).firstOrNull() ?: NotificationPreferences.defaults()

    override fun savePreferences(
        member: CurrentMember,
        preferences: NotificationPreferences,
    ): NotificationPreferences {
        jdbcTemplate().update(
            """
            insert into notification_preferences (
              membership_id,
              club_id,
              email_enabled,
              next_book_published_enabled,
              session_reminder_due_enabled,
              feedback_document_published_enabled,
              review_published_enabled
            )
            values (?, ?, ?, ?, ?, ?, ?)
            on duplicate key update
              email_enabled = values(email_enabled),
              next_book_published_enabled = values(next_book_published_enabled),
              session_reminder_due_enabled = values(session_reminder_due_enabled),
              feedback_document_published_enabled = values(feedback_document_published_enabled),
              review_published_enabled = values(review_published_enabled),
              updated_at = utc_timestamp(6)
            """.trimIndent(),
            member.membershipId.dbString(),
            member.clubId.dbString(),
            preferences.emailEnabled,
            preferences.eventPreference(NotificationEventType.NEXT_BOOK_PUBLISHED),
            preferences.eventPreference(NotificationEventType.SESSION_REMINDER_DUE),
            preferences.eventPreference(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED),
            preferences.eventPreference(NotificationEventType.REVIEW_PUBLISHED),
        )

        return getPreferences(member)
    }

    private fun insertOutbox(
        clubId: UUID,
        eventType: NotificationEventType,
        aggregateId: UUID,
        recipientMembershipId: UUID,
        recipientEmail: String,
        recipientDisplayName: String?,
        subject: String,
        bodyText: String,
        deepLinkPath: String,
        metadata: Map<String, Any?>,
    ): Int =
        jdbcTemplate().update(
            """
            insert ignore into notification_outbox (
              id,
              club_id,
              event_type,
              aggregate_type,
              aggregate_id,
              recipient_membership_id,
              recipient_email,
              recipient_display_name,
              subject,
              body_text,
              deep_link_path,
              metadata,
              status,
              dedupe_key
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
            """.trimIndent(),
            UUID.randomUUID().dbString(),
            clubId.dbString(),
            eventType.name,
            AGGREGATE_TYPE_SESSION,
            aggregateId.dbString(),
            recipientMembershipId.dbString(),
            recipientEmail.trim(),
            recipientDisplayName,
            subject,
            bodyText,
            deepLinkPath,
            metadataJson(metadata),
            dedupeKey(eventType, aggregateId, recipientMembershipId),
        )

    private fun countByStatus(clubId: UUID, status: NotificationOutboxStatus): Int =
        jdbcTemplate().queryForObject(
            """
            select count(*)
            from notification_outbox
            where club_id = ?
              and status = ?
            """.trimIndent(),
            Int::class.java,
            clubId.dbString(),
            status.name,
        ) ?: 0

    private fun latestFailures(clubId: UUID): List<HostNotificationFailure> =
        jdbcTemplate().query(
            """
            select id, event_type, recipient_email, attempt_count, updated_at
            from notification_outbox
            where club_id = ?
              and status in ('FAILED', 'DEAD')
            order by updated_at desc, created_at desc
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
            update notification_outbox
            set status = 'PENDING',
                locked_at = null,
                next_attempt_at = utc_timestamp(6),
                updated_at = utc_timestamp(6)
            where status = 'SENDING'
              and locked_at < timestampadd(MINUTE, -15, utc_timestamp(6))
              $clubPredicate
            """.trimIndent(),
            *args,
        )
    }

    private fun dedupeKey(
        eventType: NotificationEventType,
        aggregateId: UUID,
        recipientMembershipId: UUID,
    ): String = "${eventType.name}:$aggregateId:$recipientMembershipId"

    private fun ResultSet.toSessionNotificationRecipient(): SessionNotificationRecipient =
        SessionNotificationRecipient(
            membershipId = uuid("recipient_membership_id"),
            email = getString("email"),
            displayName = getString("display_name"),
            sessionNumber = getInt("session_number"),
            bookTitle = getString("book_title"),
        )

    private fun ResultSet.toReminderNotificationRecipient(): ReminderNotificationRecipient =
        ReminderNotificationRecipient(
            clubId = uuid("club_id"),
            sessionId = uuid("session_id"),
            membershipId = uuid("recipient_membership_id"),
            email = getString("email"),
            displayName = getString("display_name"),
            sessionNumber = getInt("session_number"),
            bookTitle = getString("book_title"),
        )

    private fun ResultSet.toNotificationOutboxItem(): NotificationOutboxItem =
        NotificationOutboxItem(
            id = uuid("id"),
            clubId = uuid("club_id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            recipientEmail = getString("recipient_email"),
            subject = getString("subject"),
            bodyText = getString("body_text"),
            deepLinkPath = getString("deep_link_path"),
            status = NotificationOutboxStatus.valueOf(getString("status")),
            attemptCount = getInt("attempt_count"),
            lockedAt = utcOffsetDateTime("locked_at"),
        )

    private fun ResultSet.toNotificationPreferences(): NotificationPreferences =
        NotificationPreferences(
            emailEnabled = getBoolean("email_enabled"),
            events = mapOf(
                NotificationEventType.NEXT_BOOK_PUBLISHED to getBoolean("next_book_published_enabled"),
                NotificationEventType.SESSION_REMINDER_DUE to getBoolean("session_reminder_due_enabled"),
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED to getBoolean("feedback_document_published_enabled"),
                NotificationEventType.REVIEW_PUBLISHED to getBoolean("review_published_enabled"),
            ),
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
            status = NotificationOutboxStatus.valueOf(getString("status")),
            recipientEmail = getString("recipient_email"),
            attemptCount = getInt("attempt_count"),
            nextAttemptAt = utcOffsetDateTime("next_attempt_at"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )

    private fun ResultSet.toHostNotificationDetail(): HostNotificationDetail =
        HostNotificationDetail(
            id = uuid("id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            status = NotificationOutboxStatus.valueOf(getString("status")),
            recipientEmail = getString("recipient_email"),
            subject = getString("subject"),
            deepLinkPath = getString("deep_link_path"),
            metadata = parseMetadata(getString("metadata")),
            attemptCount = getInt("attempt_count"),
            lastError = getString("last_error"),
            createdAt = utcOffsetDateTime("created_at"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )

    private fun metadataJson(metadata: Map<String, Any?>): String =
        objectMapper.writeValueAsString(sanitizeMetadata(metadata))

    private fun parseMetadata(rawMetadata: String?): Map<String, Any?> {
        val raw = rawMetadata
            ?.trim()
            ?.takeIf { it.isNotEmpty() && it.length <= MAX_METADATA_JSON_LENGTH }
            ?: return emptyMap()

        val decoded = runCatching {
            objectMapper.readValue<Map<String, Any?>>(raw, metadataType)
        }.getOrNull() ?: return emptyMap()

        return sanitizeMetadata(decoded)
    }

    private fun sanitizeMetadata(metadata: Map<String, Any?>, depth: Int = 0): Map<String, Any?> {
        val safe = linkedMapOf<String, Any?>()
        metadata.entries
            .asSequence()
            .filterNot { it.key.isSensitiveMetadataKey() }
            .take(MAX_METADATA_ENTRIES)
            .forEach { (key, value) ->
                val sanitized = sanitizeMetadataValue(value, depth)
                if (sanitized !== UnsafeMetadataValue) {
                    safe[key] = sanitized
                }
            }
        return safe
    }

    private fun sanitizeMetadataValue(value: Any?, depth: Int): Any? =
        when (value) {
            null -> null
            is String -> value
                .take(MAX_METADATA_STRING_LENGTH)
                .takeUnless { EMAIL_LIKE_PATTERN.containsMatchIn(it) }
                ?: UnsafeMetadataValue
            is Number, is Boolean -> value
            is Map<*, *> -> {
                if (depth >= 2) {
                    emptyMap<String, Any?>()
                } else {
                    sanitizeMetadata(
                        value.entries
                            .mapNotNull { (key, nestedValue) -> (key as? String)?.let { it to nestedValue } }
                            .toMap(),
                        depth = depth + 1,
                    )
                }
            }
            is Iterable<*> -> value
                .asSequence()
                .take(MAX_METADATA_LIST_ITEMS)
                .map { sanitizeMetadataValue(it, depth + 1) }
                .filterNot { it === UnsafeMetadataValue }
                .toList()
            else -> value.toString().take(MAX_METADATA_STRING_LENGTH)
        }

    private fun String.isSensitiveMetadataKey(): Boolean {
        val normalized = lowercase()
        return normalized.contains("email") ||
            normalized.contains("recipient") ||
            normalized.contains("body") ||
            normalized.endsWith("text")
    }

    private fun String.truncateForStorage(): String =
        take(MAX_LAST_ERROR_LENGTH)

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("Notification outbox storage is unavailable")
}

private object UnsafeMetadataValue
