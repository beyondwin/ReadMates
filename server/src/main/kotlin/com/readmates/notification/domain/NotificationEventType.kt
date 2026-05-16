package com.readmates.notification.domain

enum class NotificationEventType {
    NEXT_BOOK_PUBLISHED,
    SESSION_REMINDER_DUE,
    FEEDBACK_DOCUMENT_PUBLISHED,
    REVIEW_PUBLISHED,

    /**
     * AI session generation completed for a host after exceeding the long-generation
     * threshold (default 60s — readmates.aigen.job.notification-latency-threshold).
     * Routed to in-app channel ONLY (v1 explicitly excludes email per task 6.3 spec).
     * Payload carries jobId / sessionId / hostUserId — never transcript text (PII invariant).
     */
    AI_GENERATION_READY,
}
