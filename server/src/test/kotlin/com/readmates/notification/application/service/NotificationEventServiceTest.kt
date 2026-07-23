package com.readmates.notification.application.service

import com.readmates.notification.application.model.HostActionNotificationError
import com.readmates.notification.application.model.HostActionNotificationException
import com.readmates.notification.application.model.HostNotificationEvent
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventOutboxItem
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

class NotificationEventServiceTest {
    @Test
    fun `host confirmed session record update uses caller event id and revision dedupe key`() {
        val outbox = RecordingEventOutbox()
        val service = NotificationEventService(outbox)
        val clubId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()

        val eventId =
            service.recordSessionRecordUpdated(
                clubId = clubId,
                sessionId = sessionId,
                sessionNumber = 8,
                bookTitle = "기록 테스트",
                revision = 4,
            )

        val event = outbox.recorded.single()
        assertThat(event.eventId).isEqualTo(eventId)
        assertThat(event.eventType).isEqualTo(NotificationEventType.SESSION_RECORD_UPDATED)
        assertThat(event.dedupeKey).isEqualTo("session-record-updated:$sessionId:4")
    }

    @Test
    fun `host confirmed next book and feedback events preserve caller ids`() {
        val outbox = RecordingEventOutbox()
        val service = NotificationEventService(outbox)
        val clubId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()

        val nextBookEventId =
            service.recordConfirmedNextBookPublished(clubId, sessionId, 9, "다음 책")
        val feedbackEventId =
            service.recordConfirmedFeedbackDocumentPublished(clubId, sessionId, 9, "다음 책", 2)

        assertThat(outbox.recorded.map { it.eventId })
            .containsExactly(nextBookEventId, feedbackEventId)
        assertThat(outbox.recorded.map { it.dedupeKey })
            .containsExactly("next-book:$sessionId", "feedback-document:$sessionId:2")
    }

    @Test
    fun `host confirmed duplicate dedupe key is a typed conflict`() {
        val service = NotificationEventService(RecordingEventOutbox(enqueueResult = false))

        assertThatThrownBy {
            service.recordSessionRecordUpdated(
                clubId = UUID.randomUUID(),
                sessionId = UUID.randomUUID(),
                sessionNumber = 8,
                bookTitle = "기록 테스트",
                revision = 4,
            )
        }.isInstanceOf(HostActionNotificationException::class.java)
            .extracting("error")
            .isEqualTo(HostActionNotificationError.DUPLICATE_EVENT)
    }

    @Test
    fun `feedback document event uses session and version dedupe key`() {
        val outbox = RecordingEventOutbox()
        val service = NotificationEventService(outbox)
        val clubId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()

        service.recordFeedbackDocumentPublished(
            clubId = clubId,
            sessionId = sessionId,
            sessionNumber = 6,
            bookTitle = "가난한 찰리의 연감",
            documentVersion = 3,
        )

        val event = outbox.recorded.single()
        assertThat(event.clubId).isEqualTo(clubId)
        assertThat(event.eventType).isEqualTo(NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED)
        assertThat(event.aggregateType).isEqualTo("SESSION")
        assertThat(event.aggregateId).isEqualTo(sessionId)
        assertThat(event.payload).isEqualTo(
            NotificationEventPayload(
                sessionId = sessionId,
                sessionNumber = 6,
                bookTitle = "가난한 찰리의 연감",
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
        assertThat(event.aggregateType).isEqualTo("SESSION")
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

        service.recordReviewPublished(
            clubId = clubId,
            sessionId = sessionId,
            sessionNumber = 6,
            bookTitle = "가난한 찰리의 연감",
            authorMembershipId = authorMembershipId,
        )

        val event = outbox.recorded.single()
        assertThat(event.eventType).isEqualTo(NotificationEventType.REVIEW_PUBLISHED)
        assertThat(event.aggregateType).isEqualTo("SESSION")
        assertThat(event.aggregateId).isEqualTo(sessionId)
        assertThat(event.payload).isEqualTo(
            NotificationEventPayload(
                sessionId = sessionId,
                sessionNumber = 6,
                bookTitle = "가난한 찰리의 연감",
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

    @Test
    fun `ai generation ready event records job aggregate with PII-free payload`() {
        val outbox = RecordingEventOutbox()
        val service = NotificationEventService(outbox)
        val clubId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val jobId = UUID.randomUUID()
        val hostUserId = UUID.randomUUID()

        service.recordAiGenerationReady(
            jobId = jobId,
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = hostUserId,
        )

        val event = outbox.recorded.single()
        assertThat(event.clubId).isEqualTo(clubId)
        assertThat(event.eventType).isEqualTo(NotificationEventType.AI_GENERATION_READY)
        assertThat(event.aggregateType).isEqualTo("AI_GENERATION_JOB")
        assertThat(event.aggregateId).isEqualTo(jobId)
        // Payload MUST carry only the three identifiers — never transcript / authorNames / book title (PII invariant).
        assertThat(event.payload).isEqualTo(
            NotificationEventPayload(
                sessionId = sessionId,
                jobId = jobId,
                hostUserId = hostUserId,
            ),
        )
        assertThat(event.payload.bookTitle).isNull()
        assertThat(event.payload.sessionNumber).isNull()
        assertThat(event.payload.documentVersion).isNull()
        assertThat(event.payload.authorMembershipId).isNull()
        assertThat(event.dedupeKey).isEqualTo("ai-generation-ready:$jobId")
    }
}

private data class RecordedEvent(
    val eventId: UUID,
    val clubId: UUID,
    val eventType: NotificationEventType,
    val aggregateType: String,
    val aggregateId: UUID,
    val payload: NotificationEventPayload,
    val dedupeKey: String,
)

private class RecordingEventOutbox(
    private val enqueueResult: Boolean = true,
) : NotificationEventOutboxPort {
    val recorded = mutableListOf<RecordedEvent>()
    val reminderDates = mutableListOf<LocalDate>()

    override fun enqueueEvent(
        clubId: UUID,
        eventType: NotificationEventType,
        aggregateType: String,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        dedupeKey: String,
    ): Boolean = enqueueEvent(UUID.randomUUID(), clubId, eventType, aggregateType, aggregateId, payload, dedupeKey)

    override fun enqueueEvent(
        eventId: UUID,
        clubId: UUID,
        eventType: NotificationEventType,
        aggregateType: String,
        aggregateId: UUID,
        payload: NotificationEventPayload,
        dedupeKey: String,
    ): Boolean {
        if (!enqueueResult) return false
        recorded += RecordedEvent(eventId, clubId, eventType, aggregateType, aggregateId, payload, dedupeKey)
        return true
    }

    override fun enqueueSessionReminderDue(targetDate: LocalDate): Int {
        reminderDates += targetDate
        return 1
    }

    override fun claimPublishable(limit: Int): List<NotificationEventOutboxItem> = error("unused")

    override fun markPublished(
        id: UUID,
        lockedAt: OffsetDateTime,
    ): Boolean = error("unused")

    override fun markPublishFailed(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
        nextAttemptDelayMinutes: Long,
    ): Boolean = error("unused")

    override fun markPublishDead(
        id: UUID,
        lockedAt: OffsetDateTime,
        error: String,
    ): Boolean = error("unused")

    override fun loadMessage(eventId: UUID): NotificationEventMessage? = error("unused")

    override fun listHostEvents(
        clubId: UUID,
        status: NotificationEventOutboxStatus?,
        pageRequest: PageRequest,
    ): CursorPage<HostNotificationEvent> = error("unused")
}
