package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import java.time.OffsetDateTime
import java.util.UUID

data class NotificationOutboxItem(
    val id: UUID,
    val clubId: UUID,
    val eventType: NotificationEventType,
    val recipientEmail: String,
    val subject: String,
    val bodyText: String,
    val deepLinkPath: String,
    val status: NotificationOutboxStatus,
    val attemptCount: Int,
    val lockedAt: OffsetDateTime,
)

data class HostNotificationSummary(
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val sentLast24h: Int,
    val latestFailures: List<HostNotificationFailure>,
)

data class HostNotificationItemQuery(
    val status: NotificationOutboxStatus?,
    val eventType: NotificationEventType?,
    val limit: Int,
)

data class HostNotificationItem(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationOutboxStatus,
    val recipientEmail: String,
    val attemptCount: Int,
    val nextAttemptAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)

data class HostNotificationItemList(
    val items: List<HostNotificationItem>,
)

enum class NotificationTestMailStatus {
    SENT,
    FAILED,
}

data class SendNotificationTestMailCommand(
    val recipientEmail: String,
)

data class NotificationTestMailAuditItem(
    val id: UUID,
    val recipientEmail: String,
    val status: NotificationTestMailStatus,
    val lastError: String?,
    val createdAt: OffsetDateTime,
)

data class HostNotificationDetail(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationOutboxStatus,
    val recipientEmail: String,
    val subject: String,
    val deepLinkPath: String,
    val metadata: Map<String, Any?>,
    val attemptCount: Int,
    val lastError: String?,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)

data class NotificationOutboxBacklog(
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val sending: Int,
)

data class NotificationPreferences(
    val emailEnabled: Boolean,
    val events: Map<NotificationEventType, Boolean>,
) {
    fun enabled(eventType: NotificationEventType): Boolean =
        emailEnabled && eventPreference(eventType)

    fun eventPreference(eventType: NotificationEventType): Boolean =
        events[eventType] ?: defaultEventEnabled(eventType)

    companion object {
        fun defaults(): NotificationPreferences =
            NotificationPreferences(
                emailEnabled = true,
                events = NotificationEventType.entries.associateWith(::defaultEventEnabled),
            )

        fun defaultEventEnabled(eventType: NotificationEventType): Boolean =
            when (eventType) {
                NotificationEventType.NEXT_BOOK_PUBLISHED -> true
                NotificationEventType.SESSION_REMINDER_DUE -> true
                NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> true
                NotificationEventType.REVIEW_PUBLISHED -> false
            }
    }
}

data class HostNotificationFailure(
    val id: UUID,
    val eventType: NotificationEventType,
    val recipientEmail: String,
    val attemptCount: Int,
    val updatedAt: OffsetDateTime,
)
