package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationItem
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import java.util.UUID

private const val MAX_HOST_LAST_ERROR_LENGTH = 200
private val EMAIL_LIKE_PATTERN = Regex("""[^\s@]+@[^\s@]+\.[^\s@]+""")

data class HostNotificationItemListResponse(
    val items: List<HostNotificationItemResponse>,
)

data class HostNotificationItemResponse(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationOutboxStatus,
    val recipientEmail: String,
    val attemptCount: Int,
    val nextAttemptAt: String,
    val updatedAt: String,
)

data class HostNotificationDetailResponse(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationOutboxStatus,
    val recipientEmail: String,
    val subject: String,
    val deepLinkPath: String,
    val metadata: Map<String, Any?>,
    val attemptCount: Int,
    val lastError: String?,
    val createdAt: String,
    val updatedAt: String,
)

data class NotificationPreferencesRequest(
    val emailEnabled: Boolean,
    val events: Map<NotificationEventType, Boolean>,
) {
    fun toModel(): NotificationPreferences =
        NotificationPreferences(
            emailEnabled = emailEnabled,
            events = NotificationEventType.entries.associateWith { eventType ->
                events[eventType] ?: NotificationPreferences.defaultEventEnabled(eventType)
            },
        )
}

data class NotificationPreferencesResponse(
    val emailEnabled: Boolean,
    val events: Map<NotificationEventType, Boolean>,
)

fun NotificationPreferences.toResponse(): NotificationPreferencesResponse =
    NotificationPreferencesResponse(
        emailEnabled = emailEnabled,
        events = NotificationEventType.entries.associateWith(::eventPreference),
    )

fun HostNotificationItemList.toResponse(): HostNotificationItemListResponse =
    HostNotificationItemListResponse(
        items = items.map { it.toResponse() },
    )

fun HostNotificationItem.toResponse(): HostNotificationItemResponse =
    HostNotificationItemResponse(
        id = id,
        eventType = eventType,
        status = status,
        recipientEmail = maskEmail(recipientEmail),
        attemptCount = attemptCount,
        nextAttemptAt = nextAttemptAt.toString(),
        updatedAt = updatedAt.toString(),
    )

fun HostNotificationDetail.toResponse(): HostNotificationDetailResponse =
    HostNotificationDetailResponse(
        id = id,
        eventType = eventType,
        status = status,
        recipientEmail = maskEmail(recipientEmail),
        subject = subject,
        deepLinkPath = deepLinkPath,
        metadata = metadata,
        attemptCount = attemptCount,
        lastError = lastError.toHostSafeLastError(),
        createdAt = createdAt.toString(),
        updatedAt = updatedAt.toString(),
    )

private fun maskEmail(email: String): String {
    val trimmed = email.trim()
    val atIndex = trimmed.indexOf('@')
    if (atIndex <= 0 || atIndex == trimmed.lastIndex) {
        return "숨김"
    }

    val local = trimmed.substring(0, atIndex)
    val domain = trimmed.substring(atIndex + 1)
    if (local.isBlank() || domain.isBlank()) {
        return "숨김"
    }

    return "${local.first()}***@$domain"
}

private fun String?.toHostSafeLastError(): String? =
    this
        ?.trim()
        ?.takeIf { it.isNotEmpty() }
        ?.replace(EMAIL_LIKE_PATTERN, "[redacted-email]")
        ?.take(MAX_HOST_LAST_ERROR_LENGTH)
