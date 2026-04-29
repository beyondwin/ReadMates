package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDeliveryList
import com.readmates.notification.application.model.HostNotificationEvent
import com.readmates.notification.application.model.HostNotificationEventList
import com.readmates.notification.application.model.HostNotificationFailure
import com.readmates.notification.application.model.HostNotificationItem
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.MemberNotificationItem
import com.readmates.notification.application.model.MemberNotificationList
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.model.NotificationTestMailAuditItem
import com.readmates.notification.application.model.NotificationTestMailStatus
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import java.util.UUID

private const val MAX_HOST_LAST_ERROR_LENGTH = 200
private const val MAX_HOST_METADATA_ENTRIES = 25
private const val MAX_HOST_METADATA_STRING_LENGTH = 200
private val EMAIL_LIKE_PATTERN = Regex("""[^\s@]+@[^\s@]+\.[^\s@]+""")
private val SENSITIVE_VALUE_PATTERN = Regex("""(?i)(token|secret|password|passcode|api[-_ ]?key|bearer\s+)""")
private val HOST_METADATA_KEY_ALLOWLIST = setOf("sessionNumber", "bookTitle")

data class HostNotificationSummaryResponse(
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val sentLast24h: Int,
    val latestFailures: List<HostNotificationFailureResponse>,
)

data class HostNotificationFailureResponse(
    val id: UUID,
    val eventType: NotificationEventType,
    val recipientEmail: String,
    val attemptCount: Int,
    val updatedAt: String,
)

data class HostNotificationItemListResponse(
    val items: List<HostNotificationItemResponse>,
)

data class HostNotificationEventListResponse(
    val items: List<HostNotificationEventResponse>,
)

data class HostNotificationEventResponse(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationEventOutboxStatus,
    val attemptCount: Int,
    val createdAt: String,
    val updatedAt: String,
)

data class HostNotificationDeliveryListResponse(
    val items: List<HostNotificationDeliveryResponse>,
)

data class HostNotificationDeliveryResponse(
    val id: UUID,
    val eventId: UUID,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val recipientEmail: String?,
    val attemptCount: Int,
    val updatedAt: String,
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

data class SendNotificationTestMailRequest(
    val recipientEmail: String,
)

data class NotificationTestMailAuditResponse(
    val id: UUID,
    val recipientEmail: String,
    val status: NotificationTestMailStatus,
    val lastError: String?,
    val createdAt: String,
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

data class MemberNotificationListResponse(
    val items: List<MemberNotificationResponse>,
    val unreadCount: Int,
)

data class MemberNotificationResponse(
    val id: UUID,
    val eventType: NotificationEventType,
    val title: String,
    val body: String,
    val deepLinkPath: String,
    val readAt: String?,
    val createdAt: String,
)

fun NotificationPreferences.toResponse(): NotificationPreferencesResponse =
    NotificationPreferencesResponse(
        emailEnabled = emailEnabled,
        events = NotificationEventType.entries.associateWith(::eventPreference),
    )

fun MemberNotificationList.toResponse(): MemberNotificationListResponse =
    MemberNotificationListResponse(
        items = items.map { it.toResponse() },
        unreadCount = unreadCount,
    )

fun MemberNotificationItem.toResponse(): MemberNotificationResponse =
    MemberNotificationResponse(
        id = id,
        eventType = eventType,
        title = title,
        body = body,
        deepLinkPath = deepLinkPath,
        readAt = readAt?.toString(),
        createdAt = createdAt.toString(),
    )

fun HostNotificationSummary.toResponse(): HostNotificationSummaryResponse =
    HostNotificationSummaryResponse(
        pending = pending,
        failed = failed,
        dead = dead,
        sentLast24h = sentLast24h,
        latestFailures = latestFailures.map { it.toResponse() },
    )

private fun HostNotificationFailure.toResponse(): HostNotificationFailureResponse =
    HostNotificationFailureResponse(
        id = id,
        eventType = eventType,
        recipientEmail = maskEmail(recipientEmail),
        attemptCount = attemptCount,
        updatedAt = updatedAt.toString(),
    )

fun HostNotificationItemList.toResponse(): HostNotificationItemListResponse =
    HostNotificationItemListResponse(
        items = items.map { it.toResponse() },
    )

fun HostNotificationEventList.toResponse(): HostNotificationEventListResponse =
    HostNotificationEventListResponse(
        items = items.map { it.toResponse() },
    )

private fun HostNotificationEvent.toResponse(): HostNotificationEventResponse =
    HostNotificationEventResponse(
        id = id,
        eventType = eventType,
        status = status,
        attemptCount = attemptCount,
        createdAt = createdAt.toString(),
        updatedAt = updatedAt.toString(),
    )

fun HostNotificationDeliveryList.toResponse(): HostNotificationDeliveryListResponse =
    HostNotificationDeliveryListResponse(
        items = items.map { it.toResponse() },
    )

private fun HostNotificationDelivery.toResponse(): HostNotificationDeliveryResponse =
    HostNotificationDeliveryResponse(
        id = id,
        eventId = eventId,
        channel = channel,
        status = status,
        recipientEmail = recipientEmail?.let(::maskEmail),
        attemptCount = attemptCount,
        updatedAt = updatedAt.toString(),
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
        metadata = metadata.toHostSafeMetadata(),
        attemptCount = attemptCount,
        lastError = lastError.toHostSafeLastError(),
        createdAt = createdAt.toString(),
        updatedAt = updatedAt.toString(),
    )

fun NotificationTestMailAuditItem.toResponse(): NotificationTestMailAuditResponse =
    NotificationTestMailAuditResponse(
        id = id,
        recipientEmail = recipientEmail,
        status = status,
        lastError = lastError.toHostSafeLastError(),
        createdAt = createdAt.toString(),
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
    sanitizeNotificationError(this, MAX_HOST_LAST_ERROR_LENGTH)

private fun Map<String, Any?>.toHostSafeMetadata(depth: Int = 0): Map<String, Any?> {
    val safe = linkedMapOf<String, Any?>()
    entries
        .asSequence()
        .filter { it.key in HOST_METADATA_KEY_ALLOWLIST }
        .take(MAX_HOST_METADATA_ENTRIES)
        .forEach { (key, value) ->
            val sanitized = value.toHostSafeMetadataValue(key, depth)
            if (sanitized !== UnsafeHostMetadataValue) {
                safe[key] = sanitized
            }
        }
    return safe
}

private fun Any?.toHostSafeMetadataValue(key: String, depth: Int): Any? {
    if (depth > 0) {
        return UnsafeHostMetadataValue
    }

    return when (key) {
        "sessionNumber" -> when (this) {
            is Number -> this.toInt()
            else -> UnsafeHostMetadataValue
        }
        "bookTitle" -> when (this) {
            is String -> trim()
                .take(MAX_HOST_METADATA_STRING_LENGTH)
                .takeIf { it.isNotEmpty() }
                ?.takeUnless {
                    EMAIL_LIKE_PATTERN.containsMatchIn(it) ||
                        SENSITIVE_VALUE_PATTERN.containsMatchIn(it)
                } ?: UnsafeHostMetadataValue
            else -> UnsafeHostMetadataValue
        }
        else -> UnsafeHostMetadataValue
    }
}

private object UnsafeHostMetadataValue
