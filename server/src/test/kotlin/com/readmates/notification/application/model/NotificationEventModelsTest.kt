package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class NotificationEventModelsTest {
    @Test
    fun `delivery dedupe key includes event recipient and channel`() {
        val eventId = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val recipientId = UUID.fromString("00000000-0000-0000-0000-000000000002")

        assertThat(notificationDeliveryDedupeKey(eventId, recipientId, NotificationChannel.EMAIL))
            .isEqualTo("00000000-0000-0000-0000-000000000001:00000000-0000-0000-0000-000000000002:EMAIL")
    }

    @Test
    fun `event and delivery statuses expose kafka pipeline states`() {
        assertThat(NotificationEventOutboxStatus.entries.map { it.name }).contains(
            "PENDING", "PUBLISHING", "PUBLISHED", "FAILED", "DEAD",
        )
        assertThat(NotificationDeliveryStatus.entries.map { it.name }).contains(
            "PENDING", "SENDING", "SENT", "FAILED", "DEAD", "SKIPPED",
        )
    }

    @Test
    fun `member notification model keeps read state nullable`() {
        val item = MemberNotificationItem(
            id = UUID.randomUUID(),
            eventId = UUID.randomUUID(),
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            title = "다음 책이 공개되었습니다",
            body = "12회차 책을 확인해 주세요.",
            deepLinkPath = "/sessions/00000000-0000-0000-0000-000000000001",
            readAt = null,
            createdAt = OffsetDateTime.parse("2026-04-29T00:00:00Z"),
        )

        assertThat(item.isUnread).isTrue()
    }

    @Test
    fun `claimed delivery model carries a non-null lock token`() {
        val lockedAt = OffsetDateTime.parse("2026-04-29T00:01:00Z")
        val item = ClaimedNotificationDeliveryItem(
            id = UUID.randomUUID(),
            eventId = UUID.randomUUID(),
            clubId = UUID.randomUUID(),
            recipientMembershipId = UUID.randomUUID(),
            channel = NotificationChannel.EMAIL,
            status = NotificationDeliveryStatus.SENDING,
            attemptCount = 1,
            lockedAt = lockedAt,
            recipientEmail = "member@example.test",
            subject = "Notification subject",
            bodyText = "Notification body",
        )

        assertThat(item.lockedAt).isEqualTo(lockedAt)
    }
}
