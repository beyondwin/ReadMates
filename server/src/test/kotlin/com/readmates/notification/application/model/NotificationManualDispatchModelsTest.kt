package com.readmates.notification.application.model

import com.readmates.notification.application.port.out.ManualNotificationConfirmInsertStatus
import com.readmates.notification.application.port.out.ManualNotificationConfirmedDispatch
import com.readmates.notification.application.port.out.ManualNotificationTargetSnapshot
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
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
        assertThat(defaultManualAudience(NotificationEventType.SESSION_RECORD_UPDATED))
            .isEqualTo(ManualNotificationAudience.CONFIRMED_ATTENDEES)
        assertThat(allowedManualAudiences(NotificationEventType.SESSION_RECORD_UPDATED)).isEmpty()
    }

    @Test
    fun `manual dispatch payload exposes requested channels and target edits`() {
        val excluded = UUID.nameUUIDFromBytes("excluded".toByteArray())
        val payload =
            NotificationManualDispatchPayload(
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

    @Test
    fun `manual dispatch payload carries frozen recipient snapshots`() {
        val target = UUID.nameUUIDFromBytes("target".toByteArray())
        val email = UUID.nameUUIDFromBytes("email".toByteArray())
        val payload =
            NotificationManualDispatchPayload(
                id = UUID.nameUUIDFromBytes("dispatch".toByteArray()),
                requestedByMembershipId = UUID.nameUUIDFromBytes("host".toByteArray()),
                requestedChannels = ManualNotificationRequestedChannels.BOTH,
                audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                targetMembershipIds = listOf(target),
                inAppMembershipIds = listOf(target),
                emailMembershipIds = listOf(email),
                resend = false,
                sendMode = ManualNotificationSendMode.NOW,
            )

        assertThat(payload.targetMembershipIds).containsExactly(target)
        assertThat(payload.inAppMembershipIds).containsExactly(target)
        assertThat(payload.emailMembershipIds).containsExactly(email)
    }

    @Test
    fun `manual target snapshot carries counts and frozen channel recipients`() {
        val target = UUID.nameUUIDFromBytes("target".toByteArray())
        val email = UUID.nameUUIDFromBytes("email".toByteArray())
        val snapshot =
            ManualNotificationTargetSnapshot(
                baseCount = 2,
                excludedCount = 1,
                includedCount = 0,
                finalTargetCount = 1,
                inAppEligibleCount = 1,
                emailEligibleCount = 1,
                emailSkippedByPreferenceCount = 0,
                emailMissingCount = 0,
                targetMembershipIds = listOf(target),
                inAppMembershipIds = listOf(target),
                emailMembershipIds = listOf(email),
            )

        assertThat(snapshot.finalTargetCount).isEqualTo(snapshot.targetMembershipIds.size)
        assertThat(snapshot.inAppEligibleCount).isEqualTo(snapshot.inAppMembershipIds.size)
        assertThat(snapshot.emailEligibleCount).isEqualTo(snapshot.emailMembershipIds.size)
    }

    @Test
    fun `manual confirm result distinguishes created and consumed previews`() {
        val confirmed =
            ManualNotificationConfirmedDispatch(
                manualDispatchId = UUID.nameUUIDFromBytes("dispatch".toByteArray()),
                eventId = UUID.nameUUIDFromBytes("event".toByteArray()),
                createdAt = OffsetDateTime.parse("2026-05-13T10:10:00Z"),
                status = ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED,
            )

        assertThat(confirmed.status).isEqualTo(ManualNotificationConfirmInsertStatus.ALREADY_CONSUMED)
    }

    @Test
    fun `manual dispatch list item carries host audit metadata`() {
        val item =
            ManualNotificationDispatchListItem(
                manualDispatchId = UUID.nameUUIDFromBytes("dispatch".toByteArray()),
                eventId = UUID.nameUUIDFromBytes("event".toByteArray()),
                source = NotificationDispatchSource.MANUAL,
                eventType = NotificationEventType.SESSION_REMINDER_DUE,
                sessionId = UUID.nameUUIDFromBytes("session".toByteArray()),
                sessionNumber = 8,
                bookTitle = "Example Book",
                requestedChannels = ManualNotificationRequestedChannels.BOTH,
                audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                resend = true,
                requestedBy = "h***@example.com",
                targetCount = 17,
                expectedInAppCount = 17,
                expectedEmailCount = 14,
                eventStatus = NotificationEventOutboxStatus.PENDING,
                createdAt = OffsetDateTime.parse("2026-05-13T10:10:00Z"),
            )

        assertThat(item.source).isEqualTo(NotificationDispatchSource.MANUAL)
        assertThat(item.resend).isTrue()
        assertThat(item.requestedBy).doesNotContain("host@example.com")
    }
}
