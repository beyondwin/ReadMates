package com.readmates.notification.application.service

import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.`in`.RecordNotificationEventUseCase
import com.readmates.notification.application.port.out.NotificationEventOutboxPort
import com.readmates.notification.domain.NotificationEventType
import org.springframework.stereotype.Service
import java.time.LocalDate
import java.util.UUID

private const val SESSION_AGGREGATE_TYPE = "SESSION"
private const val AI_GENERATION_JOB_AGGREGATE_TYPE = "AI_GENERATION_JOB"

@Service
class NotificationEventService(
    private val eventOutboxPort: NotificationEventOutboxPort,
) : RecordNotificationEventUseCase {
    /**
     * Dedupe policy: feedback-document keys include the document version so each revision
     * triggers exactly one notification. See ADR-0015.
     */
    override fun recordFeedbackDocumentPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        documentVersion: Int,
    ) {
        eventOutboxPort.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED,
            aggregateType = SESSION_AGGREGATE_TYPE,
            aggregateId = sessionId,
            payload =
                NotificationEventPayload(
                    sessionId = sessionId,
                    sessionNumber = sessionNumber,
                    bookTitle = bookTitle,
                    documentVersion = documentVersion,
                ),
            dedupeKey = "feedback-document:$sessionId:$documentVersion",
        )
    }

    /**
     * Dedupe policy: one notification per session; the same book is not announced twice.
     * See ADR-0015.
     */
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
            payload =
                NotificationEventPayload(
                    sessionId = sessionId,
                    sessionNumber = sessionNumber,
                    bookTitle = bookTitle,
                ),
            dedupeKey = "next-book:$sessionId",
        )
    }

    /**
     * Dedupe policy: one notification per (session, author) pair. See ADR-0015.
     */
    override fun recordReviewPublished(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        authorMembershipId: UUID,
    ) {
        eventOutboxPort.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.REVIEW_PUBLISHED,
            aggregateType = SESSION_AGGREGATE_TYPE,
            aggregateId = sessionId,
            payload =
                NotificationEventPayload(
                    sessionId = sessionId,
                    sessionNumber = sessionNumber,
                    bookTitle = bookTitle,
                    authorMembershipId = authorMembershipId,
                ),
            dedupeKey = "review-published:$sessionId:$authorMembershipId",
        )
    }

    override fun recordSessionReminderDue(targetDate: LocalDate) {
        eventOutboxPort.enqueueSessionReminderDue(targetDate)
    }

    /**
     * AI session generation completed (task 6.3 / spec §10.x). Dedupe policy: one
     * notification per job — the same generation is never announced twice. Payload
     * carries jobId / sessionId / hostUserId only (PII invariant — no transcript text,
     * author names, or book title content).
     */
    override fun recordAiGenerationReady(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
    ) {
        eventOutboxPort.enqueueEvent(
            clubId = clubId,
            eventType = NotificationEventType.AI_GENERATION_READY,
            aggregateType = AI_GENERATION_JOB_AGGREGATE_TYPE,
            aggregateId = jobId,
            payload =
                NotificationEventPayload(
                    sessionId = sessionId,
                    jobId = jobId,
                    hostUserId = hostUserId,
                ),
            dedupeKey = "ai-generation-ready:$jobId",
        )
    }
}
