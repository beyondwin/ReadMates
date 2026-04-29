package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.HostNotificationFailure
import com.readmates.notification.application.model.NotificationOutboxBacklog
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.NotificationOutboxItem
import com.readmates.notification.application.port.out.NotificationOutboxPort
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import com.readmates.shared.db.dbString
import com.readmates.shared.db.toUtcLocalDateTime
import com.readmates.shared.db.utcOffsetDateTime
import com.readmates.shared.db.uuid
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.BatchPreparedStatementSetter
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.sql.PreparedStatement
import java.sql.ResultSet
import java.sql.Statement
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID
import kotlin.math.max

private const val AGGREGATE_TYPE_SESSION = "SESSION"
private const val MAX_LAST_ERROR_LENGTH = 500

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

private data class OutboxInsertCommand(
    val clubId: UUID,
    val eventType: NotificationEventType,
    val aggregateId: UUID,
    val recipientMembershipId: UUID,
    val recipientEmail: String,
    val recipientDisplayName: String?,
    val subject: String,
    val bodyText: String,
    val deepLinkPath: String,
)

private data class OutboxInsertBatchEntry(
    val id: UUID,
    val command: OutboxInsertCommand,
)

@Repository
class JdbcNotificationOutboxAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : NotificationOutboxPort {
    @Transactional
    override fun enqueueFeedbackDocumentPublished(clubId: UUID, sessionId: UUID): Int {
        val jdbcTemplate = jdbcTemplate()
        val recipients = jdbcTemplate.query(
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
            where session_participants.club_id = ?
              and session_participants.session_id = ?
              and session_participants.participation_status = 'ACTIVE'
              and session_participants.attendance_status = 'ATTENDED'
              and memberships.status = 'ACTIVE'
              and sessions.state in ('CLOSED', 'PUBLISHED')
            """.trimIndent(),
            { resultSet, _ -> resultSet.toSessionNotificationRecipient() },
            clubId.dbString(),
            sessionId.dbString(),
        )

        return batchInsertOutbox(
            jdbcTemplate,
            recipients.map { recipient ->
                OutboxInsertCommand(
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
                )
            },
        )
    }

    @Transactional
    override fun enqueueNextBookPublished(clubId: UUID, sessionId: UUID): Int {
        val jdbcTemplate = jdbcTemplate()
        val recipients = jdbcTemplate.query(
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
            where memberships.club_id = ?
              and sessions.id = ?
              and memberships.status = 'ACTIVE'
              and sessions.state = 'DRAFT'
              and sessions.visibility in ('MEMBER', 'PUBLIC')
            """.trimIndent(),
            { resultSet, _ -> resultSet.toSessionNotificationRecipient() },
            clubId.dbString(),
            sessionId.dbString(),
        )

        return batchInsertOutbox(
            jdbcTemplate,
            recipients.map { recipient ->
                OutboxInsertCommand(
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
                )
            },
        )
    }

    @Transactional
    override fun enqueueSessionReminderDue(targetDate: LocalDate): Int {
        val jdbcTemplate = jdbcTemplate()
        val recipients = jdbcTemplate.query(
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
            where sessions.session_date = ?
              and sessions.state in ('DRAFT', 'OPEN')
              and sessions.visibility in ('MEMBER', 'PUBLIC')
              and memberships.status = 'ACTIVE'
            """.trimIndent(),
            { resultSet, _ -> resultSet.toReminderNotificationRecipient() },
            targetDate,
        )

        return batchInsertOutbox(
            jdbcTemplate,
            recipients.map { recipient ->
                OutboxInsertCommand(
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
                )
            },
        )
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

    private fun batchInsertOutbox(jdbcTemplate: JdbcTemplate, commands: List<OutboxInsertCommand>): Int {
        if (commands.isEmpty()) {
            return 0
        }

        val entries = commands.map { command ->
            OutboxInsertBatchEntry(
                id = UUID.randomUUID(),
                command = command,
            )
        }
        val inserted = jdbcTemplate.batchUpdate(
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
              status,
              dedupe_key
            )
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)
            """.trimIndent(),
            object : BatchPreparedStatementSetter {
                override fun setValues(ps: PreparedStatement, i: Int) {
                    val entry = entries[i]
                    val command = entry.command
                    ps.setString(1, entry.id.dbString())
                    ps.setString(2, command.clubId.dbString())
                    ps.setString(3, command.eventType.name)
                    ps.setString(4, AGGREGATE_TYPE_SESSION)
                    ps.setString(5, command.aggregateId.dbString())
                    ps.setString(6, command.recipientMembershipId.dbString())
                    ps.setString(7, command.recipientEmail.trim())
                    ps.setString(8, command.recipientDisplayName)
                    ps.setString(9, command.subject)
                    ps.setString(10, command.bodyText)
                    ps.setString(11, command.deepLinkPath)
                    ps.setString(12, dedupeKey(command.eventType, command.aggregateId, command.recipientMembershipId))
                }

                override fun getBatchSize(): Int = entries.size
            },
        )

        if (inserted.any { it == Statement.SUCCESS_NO_INFO }) {
            return countInsertedOutboxRows(jdbcTemplate, entries.map { it.id })
        }

        return inserted.sumOf { rows -> max(0, rows) }
    }

    private fun countInsertedOutboxRows(jdbcTemplate: JdbcTemplate, ids: List<UUID>): Int {
        val placeholders = ids.joinToString(",") { "?" }
        val args = ids.map { it.dbString() as Any }.toTypedArray()
        return jdbcTemplate.queryForObject(
            """
            select count(*)
            from notification_outbox
            where id in ($placeholders)
            """.trimIndent(),
            Int::class.java,
            *args,
        ) ?: 0
    }

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

    private fun ResultSet.toHostNotificationFailure(): HostNotificationFailure =
        HostNotificationFailure(
            id = uuid("id"),
            eventType = NotificationEventType.valueOf(getString("event_type")),
            recipientEmail = getString("recipient_email"),
            attemptCount = getInt("attempt_count"),
            updatedAt = utcOffsetDateTime("updated_at"),
        )

    private fun String.truncateForStorage(): String =
        take(MAX_LAST_ERROR_LENGTH)

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("Notification outbox storage is unavailable")
}
