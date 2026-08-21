package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationSessionNotFoundException
import com.readmates.shared.db.dbString
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.time.LocalDate
import java.util.UUID

data class SessionReminderCandidate(
    val clubId: UUID,
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
)

@Repository
class SessionScopedNotificationGuard(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun lockExisting(
        clubId: UUID,
        sessionId: UUID,
    ) {
        check(TransactionSynchronizationManager.isActualTransactionActive())
        val found =
            jdbcTemplate
                .query(
                    "select id from sessions where club_id = ? and id = ? for update",
                    { rs, _ -> rs.getString("id") },
                    clubId.dbString(),
                    sessionId.dbString(),
                ).firstOrNull()
        if (found == null) throw NotificationSessionNotFoundException()
    }

    fun lockReminderCandidates(targetDate: LocalDate): List<SessionReminderCandidate> {
        check(TransactionSynchronizationManager.isActualTransactionActive())
        return jdbcTemplate.query(
            """
            select sessions.club_id, sessions.id, sessions.number, sessions.book_title
            from sessions
            where sessions.session_date = ?
              and sessions.state in ('DRAFT', 'OPEN')
              and sessions.visibility in ('MEMBER', 'PUBLIC')
              and exists (
                select 1
                from club_notification_policies
                where club_notification_policies.club_id = sessions.club_id
                  and club_notification_policies.session_reminder_enabled = true
              )
            order by sessions.id
            for update
            """.trimIndent(),
            { rs, _ ->
                SessionReminderCandidate(
                    clubId = rs.uuid("club_id"),
                    sessionId = rs.uuid("id"),
                    sessionNumber = rs.getInt("number"),
                    bookTitle = rs.getString("book_title"),
                )
            },
            targetDate,
        )
    }
}
