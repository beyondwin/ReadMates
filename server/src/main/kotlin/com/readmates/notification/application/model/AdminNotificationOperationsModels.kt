package com.readmates.notification.application.model

import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.notification.domain.NotificationEventOutboxStatus
import com.readmates.notification.domain.NotificationEventType
import java.time.OffsetDateTime
import java.util.UUID

data class AdminNotificationOperationsSnapshot(
    val generatedAt: OffsetDateTime,
    val outboxSummary: AdminNotificationStatusSummary,
    val deliverySummary: AdminNotificationStatusSummary,
    val relaySummary: AdminNotificationRelaySummary,
    val failureClusters: List<AdminNotificationFailureCluster>,
    val clubHealth: List<AdminNotificationClubHealth>,
    val recentManualDispatches: List<AdminNotificationManualDispatchSummary>,
)

data class AdminNotificationStatusSummary(
    val pending: Int,
    val active: Int,
    val failed: Int,
    val dead: Int,
    val sentOrPublishedLast24h: Int,
)

data class AdminNotificationRelaySummary(
    val publishing: Int,
    val sending: Int,
    val stalePublishing: Int,
    val staleSending: Int,
)

data class AdminNotificationFailureCluster(
    val safeErrorCode: String,
    val status: String,
    val count: Int,
    val latestAt: OffsetDateTime?,
)

data class AdminNotificationClubHealth(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val lastSuccessAt: OffsetDateTime?,
)

data class AdminNotificationManualDispatchSummary(
    val manualDispatchId: UUID,
    val eventId: UUID,
    val clubId: UUID,
    val clubName: String,
    val eventType: NotificationEventType,
    val eventStatus: NotificationEventOutboxStatus,
    val targetCount: Int,
    val createdAt: OffsetDateTime,
)

data class AdminNotificationOutboxEvent(
    val eventId: UUID,
    val club: AdminNotificationClubRef,
    val eventType: NotificationEventType,
    val source: NotificationDispatchSource,
    val status: NotificationEventOutboxStatus,
    val attemptCount: Int,
    val nextAttemptAt: OffsetDateTime?,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
    val safeErrorCode: String?,
    val manualDispatch: AdminNotificationManualDispatchMetadata?,
)

data class AdminNotificationDelivery(
    val deliveryId: UUID,
    val eventId: UUID,
    val club: AdminNotificationClubRef,
    val channel: NotificationChannel,
    val status: NotificationDeliveryStatus,
    val maskedRecipient: String?,
    val attemptCount: Int,
    val createdAt: OffsetDateTime,
    val updatedAt: OffsetDateTime,
    val safeErrorCode: String?,
)

data class AdminNotificationClubRef(
    val clubId: UUID,
    val slug: String,
    val name: String,
)

data class AdminNotificationManualDispatchMetadata(
    val manualDispatchId: UUID,
    val requestedBy: String,
    val targetCount: Int,
)

data class AdminNotificationFilter(
    val clubId: UUID? = null,
    val eventStatus: NotificationEventOutboxStatus? = null,
    val deliveryStatus: NotificationDeliveryStatus? = null,
    val channel: NotificationChannel? = null,
)

data class AdminNotificationReplayPreviewRequest(
    val filter: AdminNotificationFilter,
)

data class AdminNotificationReplayPreview(
    val previewId: UUID,
    val selectionHash: String,
    val matchedCount: Int,
    val excludedCount: Int,
    val estimatedByStatus: Map<String, Int>,
    val warnings: List<String>,
    val expiresAt: OffsetDateTime,
)

data class AdminNotificationReplayConfirmCommand(
    val previewId: UUID,
    val selectionHash: String,
    val reason: String,
)

data class AdminNotificationReplayConfirmResult(
    val replayedCount: Int,
    val skippedCount: Int,
    val selectionHash: String,
)

data class AdminNotificationReplayEstimate(
    val matchedCount: Int,
    val estimatedByStatus: Map<String, Int>,
)
