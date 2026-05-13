package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class NotificationManualDispatchModelsTest {
    @Test
    fun `manual template defaults match host workflow decisions`() {
        assertThat(defaultManualAudience(NotificationEventType.NEXT_BOOK_PUBLISHED))
            .isEqualTo(ManualNotificationAudience.ALL_ACTIVE_MEMBERS)
        assertThat(defaultManualAudience(NotificationEventType.SESSION_REMINDER_DUE))
            .isEqualTo(ManualNotificationAudience.ALL_ACTIVE_MEMBERS)
        assertThat(defaultManualAudience(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED))
            .isEqualTo(ManualNotificationAudience.CONFIRMED_ATTENDEES)
    }

    @Test
    fun `manual dispatch payload exposes requested channels and target edits`() {
        val excluded = UUID.nameUUIDFromBytes("excluded".toByteArray())
        val payload = NotificationManualDispatchPayload(
            id = UUID.nameUUIDFromBytes("dispatch".toByteArray()),
            source = NotificationDispatchSource.MANUAL,
            requestedByMembershipId = UUID.nameUUIDFromBytes("host".toByteArray()),
            requestedChannels = ManualNotificationRequestedChannels.BOTH,
            audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
            excludedMembershipIds = listOf(excluded),
            includedMembershipIds = emptyList(),
            resend = true,
            sendMode = ManualNotificationSendMode.NOW,
        )

        assertThat(payload.excludedMembershipIds).containsExactly(excluded)
        assertThat(payload.includedMembershipIds).isEmpty()
        assertThat(payload.resend).isTrue()
    }
}
