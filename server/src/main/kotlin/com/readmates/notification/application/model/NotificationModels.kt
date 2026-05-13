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
    val manualDispatch: NotificationManualDispatchPayload? = null,
)

enum class NotificationDispatchSource {
    AUTOMATIC,
    MANUAL,
}

enum class ManualNotificationAudience {
    ALL_ACTIVE_MEMBERS,
    SESSION_PARTICIPANTS,
    CONFIRMED_ATTENDEES,
}

enum class ManualNotificationRequestedChannels {
    IN_APP,
    EMAIL,
    BOTH,
}

enum class ManualNotificationSendMode {
    NOW,
}

enum class ManualNotificationEligibility {
    ELIGIBLE,
    INELIGIBLE,
    EMAIL_DISABLED,
    EMAIL_MISSING,
}

data class NotificationManualDispatchPayload(
    val id: UUID,
    val source: NotificationDispatchSource = NotificationDispatchSource.MANUAL,
    val requestedByMembershipId: UUID,
    val requestedChannels: ManualNotificationRequestedChannels,
    val audience: ManualNotificationAudience,
    val excludedMembershipIds: List<UUID> = emptyList(),
    val includedMembershipIds: List<UUID> = emptyList(),
    val targetMembershipIds: List<UUID> = emptyList(),
    val inAppMembershipIds: List<UUID> = emptyList(),
    val emailMembershipIds: List<UUID> = emptyList(),
    val resend: Boolean = false,
    val sendMode: ManualNotificationSendMode = ManualNotificationSendMode.NOW,
)

fun defaultManualAudience(eventType: NotificationEventType): ManualNotificationAudience =
    when (eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED,
        NotificationEventType.SESSION_REMINDER_DUE,
        -> ManualNotificationAudience.ALL_ACTIVE_MEMBERS
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED -> ManualNotificationAudience.CONFIRMED_ATTENDEES
        NotificationEventType.REVIEW_PUBLISHED -> ManualNotificationAudience.SESSION_PARTICIPANTS
    }

fun allowedManualAudiences(eventType: NotificationEventType): Set<ManualNotificationAudience> =
    when (eventType) {
        NotificationEventType.NEXT_BOOK_PUBLISHED,
        NotificationEventType.SESSION_REMINDER_DUE,
        -> setOf(ManualNotificationAudience.ALL_ACTIVE_MEMBERS, ManualNotificationAudience.SESSION_PARTICIPANTS)
        NotificationEventType.FEEDBACK_DOCUMENT_PUBLISHED ->
            setOf(ManualNotificationAudience.CONFIRMED_ATTENDEES, ManualNotificationAudience.SESSION_PARTICIPANTS)
        NotificationEventType.REVIEW_PUBLISHED -> emptySet()
    }

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

fun clubScopedAppHomePath(clubSlug: String): String =
    "/clubs/$clubSlug/app"

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
    val source: NotificationDispatchSource = NotificationDispatchSource.AUTOMATIC,
    val manualDispatch: HostNotificationManualDispatchMetadata? = null,
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

data class ManualNotificationOptions(
    val session: ManualNotificationSessionSummary?,
    val templates: List<ManualNotificationTemplateOption>,
    val members: List<ManualNotificationMemberOption>,
    val nextCursor: String?,
    val recentDispatches: List<ManualNotificationDispatchListItem>,
)

data class ManualNotificationSessionSummary(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val date: LocalDate?,
    val state: String,
    val visibility: String,
    val feedbackDocumentUploaded: Boolean,
)

data class ManualNotificationDispatchListItem(
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
    val createdAt: OffsetDateTime,
)

data class ManualNotificationDispatchList(
    val items: List<ManualNotificationDispatchListItem>,
    val nextCursor: String?,
)

data class HostNotificationManualDispatchMetadata(
    val manualDispatchId: UUID,
    val requestedChannels: ManualNotificationRequestedChannels,
    val audience: ManualNotificationAudience,
    val resend: Boolean,
    val requestedBy: String,
    val targetCount: Int,
    val expectedInAppCount: Int,
    val expectedEmailCount: Int,
)

data class ManualNotificationTemplateOption(
    val eventType: NotificationEventType,
    val label: String,
    val enabled: Boolean,
    val disabledReason: String?,
    val defaultAudience: ManualNotificationAudience,
    val allowedAudiences: Set<ManualNotificationAudience>,
    val defaultChannels: ManualNotificationRequestedChannels = ManualNotificationRequestedChannels.BOTH,
)

data class ManualNotificationMemberOption(
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

data class ManualNotificationSelection(
    val sessionId: UUID,
    val eventType: NotificationEventType,
    val audience: ManualNotificationAudience,
    val requestedChannels: ManualNotificationRequestedChannels,
    val excludedMembershipIds: List<UUID>,
    val includedMembershipIds: List<UUID>,
    val sendMode: ManualNotificationSendMode,
)

data class ManualNotificationPreviewCommand(
    val selection: ManualNotificationSelection,
)

data class ManualNotificationConfirmCommand(
    val previewId: UUID,
    val selection: ManualNotificationSelection,
    val resendConfirmed: Boolean,
)

data class ManualNotificationPreview(
    val previewId: UUID,
    val expiresAt: OffsetDateTime,
    val template: ManualNotificationTemplatePreview,
    val audience: ManualNotificationAudiencePreview,
    val channels: ManualNotificationChannelPreview,
    val duplicates: ManualNotificationDuplicatePreview,
    val warnings: List<ManualNotificationWarning>,
)

data class ManualNotificationTemplatePreview(
    val eventType: NotificationEventType,
    val label: String,
    val subject: String,
    val bodyPreview: String,
)

data class ManualNotificationAudiencePreview(
    val baseGroup: ManualNotificationAudience,
    val baseCount: Int,
    val excludedCount: Int,
    val includedCount: Int,
    val finalTargetCount: Int,
)

data class ManualNotificationChannelPreview(
    val requested: ManualNotificationRequestedChannels,
    val inAppEligibleCount: Int,
    val emailEligibleCount: Int,
    val emailSkippedByPreferenceCount: Int,
    val emailMissingCount: Int,
)

data class ManualNotificationDuplicatePreview(
    val requiresResendConfirmation: Boolean,
    val recentDispatches: List<ManualNotificationRecentDispatch>,
)

data class ManualNotificationRecentDispatch(
    val manualDispatchId: UUID,
    val eventType: NotificationEventType,
    val requestedChannels: ManualNotificationRequestedChannels,
    val createdAt: OffsetDateTime,
    val requestedBy: String,
    val targetCount: Int,
)

data class ManualNotificationWarning(
    val code: String,
    val message: String,
)

data class ManualNotificationConfirmResult(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val status: NotificationEventOutboxStatus,
    val createdAt: OffsetDateTime,
    val summary: ManualNotificationConfirmSummary,
)

data class ManualNotificationConfirmSummary(
    val targetCount: Int,
    val requestedChannels: ManualNotificationRequestedChannels,
    val expectedInAppCount: Int,
    val expectedEmailCount: Int,
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
