package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

class NotificationEventServiceTest {
    @Test
    fun `feedback document event uses session and version dedupe key`() {
        val outbox = RecordingEventOutbox()
        val service = NotificationEventService(outbox)
        val clubId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()

        service.recordFeedbackDocumentPublished(clubId, sessionId, documentVersion = 3)

        val event = outbox.recorded.single()
        assertThat(event.clubId).isEqualTo(clubId)
        assertThat(event.eventType).isEqualTo(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED)
        assertThat(event.aggregateType).isEqualTo("session")
        assertThat(event.aggregateId).isEqualTo(sessionId)
        assertThat(event.payload).isEqualTo(
            NotificationEventPayload(
                sessionId = sessionId,
                documentVersion = 3,
            ),
        )
        assertThat(event.dedupeKey).isEqualTo("feedback-document:$sessionId:3")
    }

    @Test
    fun `next book event stores public-safe session metadata`() {
        val outbox = RecordingEventOutbox()
        val service = NotificationEventService(outbox)
        val clubId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()

        service.recordNextBookPublished(
            clubId = clubId,
            sessionId = sessionId,
            sessionNumber = 7,
            bookTitle = "테스트 책",
        )

        val event = outbox.recorded.single()
        assertThat(event.clubId).isEqualTo(clubId)
        assertThat(event.eventType).isEqualTo(NotificationEventType.NEXT_BOOK_PUBLISHED)
        assertThat(event.aggregateType).isEqualTo("session")
        assertThat(event.aggregateId).isEqualTo(sessionId)
        assertThat(event.payload).isEqualTo(
            NotificationEventPayload(
                sessionId = sessionId,
                sessionNumber = 7,
                bookTitle = "테스트 책",
            ),
        )
        assertThat(event.dedupeKey).isEqualTo("next-book:$sessionId")
    }

    @Test
    fun `review event dedupes by session and author membership`() {
        val outbox = RecordingEventOutbox()
        val service = NotificationEventService(outbox)
        val clubId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val authorMembershipId = UUID.randomUUID()

        service.recordReviewPublished(clubId, sessionId, authorMembershipId)

        val event = outbox.recorded.single()
        assertThat(event.eventType).isEqualTo(NotificationEventType.REVIEW_PUBLISHED)
        assertThat(event.aggregateType).isEqualTo("session")
        assertThat(event.aggregateId).isEqualTo(sessionId)
        assertThat(event.payload).isEqualTo(
            NotificationEventPayload(
                sessionId = sessionId,
                authorMembershipId = authorMembershipId,
            ),
        )
        assertThat(event.dedupeKey).isEqualTo("review-published:$sessionId:$authorMembershipId")
    }

    @Test
    fun `session reminder delegates target date to event outbox`() {
        val outbox = RecordingEventOutbox()
        val service = NotificationEventService(outbox)
        val targetDate = LocalDate.parse("2026-05-20")

        service.recordSessionReminderDue(targetDate)

        assertThat(outbox.reminderDates).containsExactly(targetDate)
    }
}

private data class RecordedEvent(
    val clubId: UUID,
    val eventType: NotificationEventType,
    val aggregateType: String,
    val aggregateId: UUID,
    val payload: NotificationEventPayload,
    val dedupeKey: String,
)

private class RecordingEventOutbox : NotificationEventOutboxPort {
    val recorded = mutableListOf<RecordedEvent>()
    val reminderDates = mutableListOf<LocalDate>()

    override fun enqueueEvent(
        clubId: UUID,
        eventType: NotificationEventType,
        aggregateType: String,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        dedupeKey: String,
    ): Boolean {
        recorded += RecordedEvent(clubId, eventType, aggregateType, aggregateId, payload, dedupeKey)
        return true
    }

    override fun enqueueSessionReminderDue(targetDate: LocalDate): Int {
        reminderDates += targetDate
        return 1
    }

    override fun claimPublishable(limit: Int): List<NotificationEventOutboxItem> = error("unused")

    override fun markPublished(id: UUID, lockedAt: OffsetDateTime): Boolean = error("unused")

    override fun markPublishFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean = error("unused")

    override fun markPublishDead(id: UUID, lockedAt: OffsetDateTime, error: String): Boolean = error("unused")

    override fun loadMessage(eventId: UUID): NotificationEventMessage? = error("unused")
}
