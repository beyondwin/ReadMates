package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.port.out.NotificationPreferencesPort
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.db.dbString
import com.readmates.shared.security.CurrentMember
import org.springframework.beans.factory.ObjectProvider
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet

@Repository
class JdbcNotificationPreferencesAdapter(
    private val jdbcTemplateProvider: ObjectProvider<JdbcTemplate>,
) : NotificationPreferencesPort {
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

    private fun jdbcTemplate(): JdbcTemplate =
        jdbcTemplateProvider.ifAvailable
            ?: throw IllegalStateException("Notification preference storage is unavailable")
}
