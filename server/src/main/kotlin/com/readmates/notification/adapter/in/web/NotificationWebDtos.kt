package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.model.HostNotificationDelivery
import com.readmates.notification.application.model.HostNotificationDeliveryList
import com.readmates.notification.application.model.HostNotificationDetail
import com.readmates.notification.application.model.HostNotificationEvent
import com.readmates.notification.application.model.HostNotificationEventList
import com.readmates.notification.application.model.HostNotificationFailure
import com.readmates.notification.application.model.HostNotificationItem
import com.readmates.notification.application.model.HostNotificationItemList
import com.readmates.notification.application.model.HostNotificationManualDispatchMetadata
import com.readmates.notification.application.model.HostNotificationSummary
import com.readmates.notification.application.model.ManualNotificationAudience
import com.readmates.notification.application.model.ManualNotificationAudiencePreview
import com.readmates.notification.application.model.ManualNotificationChannelPreview
import com.readmates.notification.application.model.ManualNotificationConfirmCommand
import com.readmates.notification.application.model.ManualNotificationConfirmResult
import com.readmates.notification.application.model.ManualNotificationConfirmSummary
import com.readmates.notification.application.model.ManualNotificationDispatchList
import com.readmates.notification.application.model.ManualNotificationDispatchListItem
import com.readmates.notification.application.model.ManualNotificationDuplicatePreview
import com.readmates.notification.application.model.ManualNotificationEligibility
import com.readmates.notification.application.model.ManualNotificationMemberOption
import com.readmates.notification.application.model.ManualNotificationOptions
import com.readmates.notification.application.model.ManualNotificationPreview
import com.readmates.notification.application.model.ManualNotificationPreviewCommand
import com.readmates.notification.application.model.ManualNotificationRequestedChannels
import com.readmates.notification.application.model.ManualNotificationSelection
import com.readmates.notification.application.model.ManualNotificationSendMode
import com.readmates.notification.application.model.ManualNotificationSessionSummary
import com.readmates.notification.application.model.ManualNotificationTemplatePreview
import com.readmates.notification.application.model.ManualNotificationWarning
import com.readmates.notification.application.model.MemberNotificationItem
import com.readmates.notification.application.model.MemberNotificationList
import com.readmates.notification.application.model.NotificationDispatchSource
import com.readmates.notification.application.model.NotificationPreferences
import com.readmates.notification.application.model.NotificationTestMailAuditItem
import com.readmates.notification.application.model.NotificationTestMailStatus
import com.readmates.notification.application.model.sanitizeNotificationError
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import com.readmates.notification.domain.NotificationOutboxStatus
import com.readmates.shared.paging.CursorPage
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
    val nextCursor: String?,
)

data class HostNotificationEventListResponse(
    val items: List<HostNotificationEventResponse>,
    val nextCursor: String?,
)

data class HostNotificationEventResponse(
    val id: UUID,
    val eventType: NotificationEventType,
    val status: NotificationEventOutboxStatus,
    val attemptCount: Int,
    val source: NotificationDispatchSource,
    val manualDispatch: HostNotificationManualDispatchMetadataResponse?,
    val createdAt: String,
    val updatedAt: String,
)

data class HostNotificationManualDispatchMetadataResponse(
    val manualDispatchId: UUID,
    val requestedChannels: ManualNotificationRequestedChannels,
    val audience: ManualNotificationAudience,
    val resend: Boolean,
    val requestedBy: String,
    val targetCount: Int,
    val expectedInAppCount: Int,
    val expectedEmailCount: Int,
)

data class HostNotificationDeliveryListResponse(
    val items: List<HostNotificationDeliveryResponse>,
    val nextCursor: String?,
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

data class ManualNotificationSelectionRequest(
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val contentRevision: String,
    val audience: ManualNotificationAudience,
    val requestedChannels: ManualNotificationRequestedChannels,
    val selectedMembershipIds: List<UUID>? = null,
    val excludedMembershipIds: List<UUID>? = null,
    val includedMembershipIds: List<UUID>? = null,
    val sendMode: ManualNotificationSendMode? = null,
) {
    fun toSelection(): ManualNotificationSelection =
        ManualNotificationSelection(
            sessionId = sessionId,
            eventType = eventType,
            contentRevision = contentRevision,
            audience = audience,
            requestedChannels = requestedChannels,
            selectedMembershipIds = selectedMembershipIds.orEmpty(),
            excludedMembershipIds = excludedMembershipIds.orEmpty(),
            includedMembershipIds = includedMembershipIds.orEmpty(),
            sendMode = sendMode ?: ManualNotificationSendMode.NOW,
        )
}

data class ManualNotificationPreviewRequest(
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val contentRevision: String,
    val audience: ManualNotificationAudience,
    val requestedChannels: ManualNotificationRequestedChannels,
    val selectedMembershipIds: List<UUID>? = null,
    val excludedMembershipIds: List<UUID>? = null,
    val includedMembershipIds: List<UUID>? = null,
    val sendMode: ManualNotificationSendMode? = null,
) {
    fun toCommand(): ManualNotificationPreviewCommand =
        ManualNotificationPreviewCommand(
            ManualNotificationSelectionRequest(
                sessionId = sessionId,
                eventType = eventType,
                contentRevision = contentRevision,
                audience = audience,
                requestedChannels = requestedChannels,
                selectedMembershipIds = selectedMembershipIds,
                excludedMembershipIds = excludedMembershipIds,
                includedMembershipIds = includedMembershipIds,
                sendMode = sendMode,
            ).toSelection(),
        )
}

data class ManualNotificationConfirmRequest(
    val previewId: UUID,
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val contentRevision: String,
    val audience: ManualNotificationAudience,
    val requestedChannels: ManualNotificationRequestedChannels,
    val selectedMembershipIds: List<UUID>? = null,
    val excludedMembershipIds: List<UUID>? = null,
    val includedMembershipIds: List<UUID>? = null,
    val sendMode: ManualNotificationSendMode? = null,
    val resendConfirmed: Boolean? = null,
) {
    fun toCommand(): ManualNotificationConfirmCommand =
        ManualNotificationConfirmCommand(
            previewId = previewId,
            selection =
                ManualNotificationSelectionRequest(
                    sessionId = sessionId,
                    eventType = eventType,
                    contentRevision = contentRevision,
                    audience = audience,
                    requestedChannels = requestedChannels,
                    selectedMembershipIds = selectedMembershipIds,
                    excludedMembershipIds = excludedMembershipIds,
                    includedMembershipIds = includedMembershipIds,
                    sendMode = sendMode,
                ).toSelection(),
            resendConfirmed = resendConfirmed ?: false,
        )
}

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
            events =
                NotificationEventType.entries.associateWith { eventType ->
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
    val nextCursor: String?,
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

data class ManualNotificationOptionsResponse(
    val session: ManualNotificationSessionSummaryResponse?,
    val templates: List<ManualNotificationTemplateOptionResponse>,
    val members: CursorPageResponse<ManualNotificationMemberOptionResponse>,
    val recentDispatches: List<ManualNotificationDispatchListItemResponse>,
)

data class ManualNotificationSessionSummaryResponse(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: String?,
    val state: String,
    val visibility: String,
    val feedbackDocumentUploaded: Boolean,
)

data class ManualNotificationTemplateOptionResponse(
    val eventType: NotificationEventType,
    val label: String,
    val contentRevision: String,
    val enabled: Boolean,
    val disabledReason: String?,
    val defaultAudience: ManualNotificationAudience,
    val allowedAudiences: List<ManualNotificationAudience>,
    val defaultChannels: ManualNotificationRequestedChannels,
)

data class ManualNotificationMemberOptionResponse(
    val membershipId: UUID,
    val displayName: String,
    val maskedEmail: String,
    val role: String,
    val membershipStatus: String,
    val sessionParticipationStatus: String?,
    val attendanceStatus: String?,
    val emailEligibility: ManualNotificationEligibility,
    val inAppEligibility: ManualNotificationEligibility,
)

data class ManualNotificationDispatchListResponse(
    val items: List<ManualNotificationDispatchListItemResponse>,
    val nextCursor: String?,
)

data class ManualNotificationDispatchListItemResponse(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val source: NotificationDispatchSource,
    val eventType: NotificationEventType,
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val requestedChannels: ManualNotificationRequestedChannels,
    val audience: ManualNotificationAudience,
    val resend: Boolean,
    val requestedBy: String,
    val targetCount: Int,
    val expectedInAppCount: Int,
    val expectedEmailCount: Int,
    val eventStatus: NotificationEventOutboxStatus,
    val createdAt: String,
)

data class ManualNotificationPreviewResponse(
    val previewId: UUID,
    val expiresAt: String,
    val template: ManualNotificationTemplatePreview,
    val audience: ManualNotificationAudiencePreview,
    val channels: ManualNotificationChannelPreview,
    val duplicates: ManualNotificationDuplicatePreview,
    val warnings: List<ManualNotificationWarning>,
)

data class ManualNotificationConfirmResponse(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val status: NotificationEventOutboxStatus,
    val createdAt: String,
    val summary: ManualNotificationConfirmSummary,
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
        nextCursor = nextCursor,
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
        nextCursor = nextCursor,
    )

fun HostNotificationEventList.toResponse(): HostNotificationEventListResponse =
    HostNotificationEventListResponse(
        items = items.map { it.toResponse() },
        nextCursor = nextCursor,
    )

private fun HostNotificationEvent.toResponse(): HostNotificationEventResponse =
    HostNotificationEventResponse(
        id = id,
        eventType = eventType,
        status = status,
        attemptCount = attemptCount,
        source = source,
        manualDispatch = manualDispatch?.toResponse(),
        createdAt = createdAt.toString(),
        updatedAt = updatedAt.toString(),
    )

private fun HostNotificationManualDispatchMetadata.toResponse(): HostNotificationManualDispatchMetadataResponse =
    HostNotificationManualDispatchMetadataResponse(
        manualDispatchId = manualDispatchId,
        requestedChannels = requestedChannels,
        audience = audience,
        resend = resend,
        requestedBy = requestedBy,
        targetCount = targetCount,
        expectedInAppCount = expectedInAppCount,
        expectedEmailCount = expectedEmailCount,
    )

fun HostNotificationDeliveryList.toResponse(): HostNotificationDeliveryListResponse =
    HostNotificationDeliveryListResponse(
        items = items.map { it.toResponse() },
        nextCursor = nextCursor,
    )

fun ManualNotificationOptions.toResponse(): ManualNotificationOptionsResponse =
    ManualNotificationOptionsResponse(
        session = session?.toResponse(),
        templates =
            templates.map {
                ManualNotificationTemplateOptionResponse(
                    eventType = it.eventType,
                    label = it.label,
                    contentRevision = it.contentRevision,
                    enabled = it.enabled,
                    disabledReason = it.disabledReason,
                    defaultAudience = it.defaultAudience,
                    allowedAudiences = it.allowedAudiences.toList(),
                    defaultChannels = it.defaultChannels,
                )
            },
        members = CursorPageResponse(members.map { it.toResponse() }, nextCursor),
        recentDispatches = recentDispatches.map { it.toResponse() },
    )

private fun ManualNotificationSessionSummary.toResponse(): ManualNotificationSessionSummaryResponse =
    ManualNotificationSessionSummaryResponse(
        sessionId = sessionId,
        sessionNumber = sessionNumber,
        bookTitle = bookTitle,
        date = date?.toString(),
        state = state,
        visibility = visibility,
        feedbackDocumentUploaded = feedbackDocumentUploaded,
    )

private fun ManualNotificationMemberOption.toResponse(): ManualNotificationMemberOptionResponse =
    ManualNotificationMemberOptionResponse(
        membershipId = membershipId,
        displayName = displayName,
        maskedEmail = maskedEmail,
        role = role,
        membershipStatus = membershipStatus,
        sessionParticipationStatus = sessionParticipationStatus,
        attendanceStatus = attendanceStatus,
        emailEligibility = emailEligibility,
        inAppEligibility = inAppEligibility,
    )

fun ManualNotificationDispatchList.toResponse(): ManualNotificationDispatchListResponse =
    ManualNotificationDispatchListResponse(
        items = items.map { it.toResponse() },
        nextCursor = nextCursor,
    )

private fun ManualNotificationDispatchListItem.toResponse(): ManualNotificationDispatchListItemResponse =
    ManualNotificationDispatchListItemResponse(
        manualDispatchId = manualDispatchId,
        eventId = eventId,
        source = source,
        eventType = eventType,
        sessionId = sessionId,
        sessionNumber = sessionNumber,
        bookTitle = bookTitle,
        requestedChannels = requestedChannels,
        audience = audience,
        resend = resend,
        requestedBy = requestedBy,
        targetCount = targetCount,
        expectedInAppCount = expectedInAppCount,
        expectedEmailCount = expectedEmailCount,
        eventStatus = eventStatus,
        createdAt = createdAt.toString(),
    )

fun ManualNotificationPreview.toResponse(): ManualNotificationPreviewResponse =
    ManualNotificationPreviewResponse(
        previewId = previewId,
        expiresAt = expiresAt.toString(),
        template = template,
        audience = audience,
        channels = channels,
        duplicates = duplicates,
        warnings = warnings,
    )

fun ManualNotificationConfirmResult.toResponse(): ManualNotificationConfirmResponse =
    ManualNotificationConfirmResponse(
        manualDispatchId = manualDispatchId,
        eventId = eventId,
        status = status,
        createdAt = createdAt.toString(),
        summary = summary,
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

data class CursorPageResponse<T>(
    val items: List<T>,
    val nextCursor: String?,
)

fun <T, R> CursorPage<T>.mapItems(mapper: (T) -> R): CursorPageResponse<R> =
    CursorPageResponse(items = items.map(mapper), nextCursor = nextCursor)

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

private fun String?.toHostSafeLastError(): String? = sanitizeNotificationError(this, MAX_HOST_LAST_ERROR_LENGTH)

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

private fun Any?.toHostSafeMetadataValue(
    key: String,
    depth: Int,
): Any? {
    if (depth > 0) {
        return UnsafeHostMetadataValue
    }

    return when (key) {
        "sessionNumber" ->
            when (this) {
                is Number -> this.toInt()
                else -> UnsafeHostMetadataValue
            }
        "bookTitle" ->
            when (this) {
                is String ->
                    trim()
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
