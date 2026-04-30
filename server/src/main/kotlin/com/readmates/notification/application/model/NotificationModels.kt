package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import java.time.LocalDate
import java.time.OffsetDateTime
import java.util.UUID

data class NotificationEventPayload(
    val sessionId: UUID? = null,
    val sessionNumber: Int? = null,
    val bookTitle: String? = null,
    val documentVersion: Int? = null,
    val authorMembershipId: UUID? = null,
    val targetDate: LocalDate? = null,
)

data class NotificationEventOutboxItem(
    val id: UUID,
    val clubId: UUID,
    val eventType: NotificationEventType,
    val aggregateType: String,
    val aggregateId: UUID,
    val payload: NotificationEventPayload,
    val status: NotificationEventOutboxStatus,
    val kafkaTopic: String,
    val kafkaKey: String,
    val attemptCount: Int,
    val lockedAt: OffsetDateTime,
)

data class NotificationEventMessage(
    val schemaVersion: Int = 1,
    val eventId: UUID,
    val clubId: UUID,
    val clubSlug: String? = null,
    val clubName: String? = null,
    val eventType: NotificationEventType,
    val aggregateType: String,
    val aggregateId: UUID,
    val occurredAt: OffsetDateTime,
    val payload: NotificationEventPayload,
)

fun clubScopedAppPath(clubSlug: String, path: String): String =
    "/clubs/$clubSlug/app/${path.trimStart('/')}"

data class NotificationDeliveryItem(
    val id: UUID,
    val eventId: UUID,
    val clubId: UUID,
    val recipientMembershipId: UUID,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val attemptCount: Int,
    val lockedAt: OffsetDateTime?,
    val recipientEmail: String?,
    val subject: String?,
    val bodyText: String?,
    val bodyHtml: String?,
)

data class ClaimedNotificationDeliveryItem(
    val id: UUID,
    val eventId: UUID,
    val eventType: NotificationEventType,
    val clubId: UUID,
    val recipientMembershipId: UUID,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val attemptCount: Int,
    val lockedAt: OffsetDateTime,
    val recipientEmail: String?,
    val subject: String?,
    val bodyText: String?,
    val bodyHtml: String?,
)

data class MemberNotificationItem(
    val id: UUID,
    val eventId: UUID,
    val eventType: NotificationEventType,
    val title: String,
    val body: String,
    val deepLinkPath: String,
    val readAt: OffsetDateTime?,
    val createdAt: OffsetDateTime,
) {
    val isUnread: Boolean = readAt == null
}

data class MemberNotificationList(
    val items: List<MemberNotificationItem>,
    val unreadCount: Int,
    val nextCursor: String? = null,
)

fun notificationDeliveryDedupeKey(
    eventId: UUID,
    recipientMembershipId: UUID,
    channel: NotificationChannel,
): String = "$eventId:$recipientMembershipId:${channel.name}"

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
)

data class HostNotificationItem(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationOutboxStatus,
    val recipientEmail: String,
    val attemptCount: Int,
    val nextAttemptAt: OffsetDateTime,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)

data class HostNotificationItemList(
    val items: List<HostNotificationItem>,
    val nextCursor: String? = null,
)

data class HostNotificationEvent(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationEventOutboxStatus,
    val attemptCount: Int,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)

data class HostNotificationEventList(
    val items: List<HostNotificationEvent>,
    val nextCursor: String? = null,
)

data class HostNotificationDelivery(
    val id: UUID,
    val eventId: UUID,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val recipientEmail: String?,
    val attemptCount: Int,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
)

data class HostNotificationDeliveryList(
    val items: List<HostNotificationDelivery>,
    val nextCursor: String? = null,
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

data class NotificationDeliveryBacklog(
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
