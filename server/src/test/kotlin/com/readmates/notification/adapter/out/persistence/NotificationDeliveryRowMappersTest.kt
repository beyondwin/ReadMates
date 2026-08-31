package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationCopy
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.model.NotificationManualDispatchPayload
import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class NotificationDeliveryRowMappersTest {
    @Test
    fun `manual custom copy is exact for in-app and text email while html stays escaped`() {
        val subject = "호스트 <운영> 제목"
        val body = "첫 줄 & 확인\n<script>금지</script>"
        val message =
            NotificationEventMessage(
                eventId = UUID.randomUUID(),
                clubId = UUID.randomUUID(),
                eventType = NotificationEventType.SESSION_REMINDER_DUE,
                aggregateType = "SESSION",
                aggregateId = UUID.randomUUID(),
                occurredAt = OffsetDateTime.of(2026, 8, 30, 0, 0, 0, 0, ZoneOffset.UTC),
                clubSlug = "public-contract-club",
                clubName = "Public Contract Club",
                payload =
                    NotificationEventPayload(
                        sessionId = UUID.randomUUID(),
                        sessionNumber = 1,
                        bookTitle = "Public Contract Book",
                        manualDispatch =
                            NotificationManualDispatchPayload(
                                id = UUID.randomUUID(),
                                source = NotificationDispatchSource.MANUAL,
                                requestedByMembershipId = UUID.randomUUID(),
                                requestedChannels = ManualNotificationRequestedChannels.BOTH,
                                audience = ManualNotificationAudience.ALL_ACTIVE_MEMBERS,
                                contentRevision = "a".repeat(64),
                                customCopy = ManualNotificationCopy(subject, body, "b".repeat(64)),
                            ),
                    ),
            )

        val copy = NotificationDeliveryRowMappers(ObjectMapper(), "https://app.example.test").copyFor(message, "멤버")

        assertThat(copy.title).isEqualTo(subject)
        assertThat(copy.body).isEqualTo(body)
        assertThat(copy.emailSubject).isEqualTo(subject)
        assertThat(copy.emailBodyText).isEqualTo(body)
        assertThat(copy.emailBodyHtml).isEqualTo(
            "<p>첫 줄 &amp; 확인<br>&lt;script&gt;금지&lt;/script&gt;</p>",
        )
        assertThat(copy.deepLinkPath).isNotBlank()
    }
}
