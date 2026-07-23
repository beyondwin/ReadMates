package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.HostNotificationPolicy
import com.readmates.notification.application.port.out.NotificationPolicyPort
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTime
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.util.UUID

@Repository
class JdbcNotificationPolicyAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : NotificationPolicyPort {
    override fun get(clubId: UUID): HostNotificationPolicy =
        jdbcTemplate
            .query(
                """
                select session_reminder_enabled, updated_at
                from club_notification_policies
                where club_id = ?
                """.trimIndent(),
                { resultSet, _ ->
                    HostNotificationPolicy(
                        sessionReminderEnabled = resultSet.getBoolean("session_reminder_enabled"),
                        updatedAt = resultSet.utcOffsetDateTime("updated_at"),
                    )
                },
                clubId.dbString(),
            ).singleOrNull()
            ?: HostNotificationPolicy(sessionReminderEnabled = false, updatedAt = null)

    @Transactional
    override fun save(
        clubId: UUID,
        hostMembershipId: UUID,
        sessionReminderEnabled: Boolean,
    ): HostNotificationPolicy {
        jdbcTemplate.update(
            """
            insert into club_notification_policies (
              club_id,
              session_reminder_enabled,
              updated_by_membership_id
            ) values (?, ?, ?)
            on duplicate key update
              session_reminder_enabled = values(session_reminder_enabled),
              updated_by_membership_id = values(updated_by_membership_id)
            """.trimIndent(),
            clubId.dbString(),
            sessionReminderEnabled,
            hostMembershipId.dbString(),
        )
        return get(clubId)
    }
}
