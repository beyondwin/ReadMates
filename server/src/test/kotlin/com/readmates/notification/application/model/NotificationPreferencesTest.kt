package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class NotificationPreferencesTest {
    @Test
    fun `defaults keep existing events enabled and review published disabled`() {
        val preferences = NotificationPreferences.defaults()

        assertThat(preferences.enabled(NotificationEventType.NEXT_BOOK_PUBLISHED)).isTrue()
        assertThat(preferences.enabled(NotificationEventType.SESSION_REMINDER_DUE)).isTrue()
        assertThat(preferences.enabled(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED)).isTrue()
        assertThat(preferences.enabled(NotificationEventType.REVIEW_PUBLISHED)).isFalse()
    }

    @Test
    fun `global email disabled makes every event effectively disabled`() {
        val preferences = NotificationPreferences(
            emailEnabled = false,
            events = mapOf(
                NotificationEventType.NEXT_BOOK_PUBLISHED to true,
                NotificationEventType.REVIEW_PUBLISHED to true,
            ),
        )

        assertThat(preferences.enabled(NotificationEventType.NEXT_BOOK_PUBLISHED)).isFalse()
        assertThat(preferences.enabled(NotificationEventType.REVIEW_PUBLISHED)).isFalse()
    }
}
