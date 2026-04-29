package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationEventType
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.util.UUID

private const val SESSION_AGGREGATE_TYPE = "session"

@Service
class NotificationEventService(
    private val eventOutboxPort: NotificationEventOutboxPort,
) : RecordNotificationEventUseCase {
    override fun recordFeedbackDocumentPublished(
        clubId: UUID,
        sessionId: UUID,
        documentVersion: Int,
    ) {
        eventOutboxPort.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            aggregateType = SESSION_AGGREGATE_TYPE,
            aggregateId = sessionId,
            payload = NotificationEventPayload(
                sessionId = sessionId,
                documentVersion = documentVersion,
            ),
            dedupeKey = "feedback-document:$sessionId:$documentVersion",
        )
    }

    override fun recordNextBookPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
    ) {
        eventOutboxPort.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
            aggregateType = SESSION_AGGREGATE_TYPE,
            aggregateId = sessionId,
            payload = NotificationEventPayload(
                sessionId = sessionId,
                sessionNumber = sessionNumber,
                bookTitle = bookTitle,
            ),
            dedupeKey = "next-book:$sessionId",
        )
    }

    override fun recordReviewPublished(
        clubId: UUID,
        sessionId: UUID,
        authorMembershipId: UUID,
    ) {
        eventOutboxPort.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.REVIEW_PUBLISHED,
            aggregateType = SESSION_AGGREGATE_TYPE,
            aggregateId = sessionId,
            payload = NotificationEventPayload(
                sessionId = sessionId,
                authorMembershipId = authorMembershipId,
            ),
            dedupeKey = "review-published:$sessionId:$authorMembershipId",
        )
    }

    override fun recordSessionReminderDue(targetDate: LocalDate) {
        eventOutboxPort.enqueueSessionReminderDue(targetDate)
    }
}
