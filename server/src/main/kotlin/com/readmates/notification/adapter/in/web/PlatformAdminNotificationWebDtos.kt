@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.adapter.`in`.web

import com.readmates.notification.application.model.AdminNotificationClubHealth
import com.readmates.notification.application.model.AdminNotificationClubRef
import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFailureCluster
import com.readmates.notification.application.model.AdminNotificationManualDispatchMetadata
import com.readmates.notification.application.model.AdminNotificationManualDispatchSummary
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationReplayConfirmResult
import com.readmates.notification.application.model.AdminNotificationReplayPreview
import com.readmates.notification.application.model.AdminNotificationStatusSummary
import com.readmates.notification.domain.NotificationChannel
import com.readmates.notification.domain.NotificationDeliveryStatus

data class AdminNotificationOperationsSnapshotResponse(
    val generatedAt: String,
    val outboxSummary: AdminNotificationStatusSummary,
    val deliverySummary: AdminNotificationStatusSummary,
    val relaySummary: AdminNotificationRelaySummaryResponse,
    val failureClusters: List<AdminNotificationFailureClusterResponse>,
    val clubHealth: List<AdminNotificationClubHealthResponse>,
    val recentManualDispatches: List<AdminNotificationManualDispatchSummaryResponse>,
)

data class AdminNotificationRelaySummaryResponse(
    val publishing: Int,
    val sending: Int,
    val stalePublishing: Int,
    val staleSending: Int,
)

data class AdminNotificationFailureClusterResponse(
    val safeErrorCode: String,
    val status: String,
    val count: Int,
    val latestAt: String?,
)

data class AdminNotificationClubHealthResponse(
    val clubId: String,
    val slug: String,
    val name: String,
    val pending: Int,
    val failed: Int,
    val dead: Int,
    val lastSuccessAt: String?,
)

data class AdminNotificationManualDispatchSummaryResponse(
    val manualDispatchId: String,
    val eventId: String,
    val clubId: String,
    val clubName: String,
    val eventType: String,
    val eventStatus: String,
    val targetCount: Int,
    val createdAt: String,
)

data class AdminNotificationOutboxEventResponse(
    val eventId: String,
    val club: AdminNotificationClubRefResponse,
    val eventType: String,
    val source: String,
    val status: String,
    val attemptCount: Int,
    val nextAttemptAt: String?,
    val createdAt: String,
    val updatedAt: String,
    val safeErrorCode: String?,
    val manualDispatch: AdminNotificationManualDispatchMetadataResponse?,
)

data class AdminNotificationDeliveryResponse(
    val deliveryId: String,
    val eventId: String,
    val club: AdminNotificationClubRefResponse,
    val channel: String,
    val status: String,
    val maskedRecipient: String?,
    val attemptCount: Int,
    val createdAt: String,
    val updatedAt: String,
    val safeErrorCode: String?,
)

data class AdminNotificationClubRefResponse(
    val clubId: String,
    val slug: String,
    val name: String,
)

data class AdminNotificationManualDispatchMetadataResponse(
    val manualDispatchId: String,
    val requestedBy: String,
    val targetCount: Int,
)

data class AdminNotificationReplayPreviewRequestBody(
    val clubId: String? = null,
    val filter: AdminNotificationReplayFilterRequestBody? = null,
)

data class AdminNotificationReplayFilterRequestBody(
    val clubId: String? = null,
    val deliveryStatus: NotificationDeliveryStatus? = null,
    val channel: NotificationChannel? = null,
)

data class AdminNotificationReplayConfirmRequestBody(
    val previewId: String,
    val selectionHash: String,
    val reason: String,
)

data class AdminNotificationReplayPreviewResponse(
    val previewId: String,
    val selectionHash: String,
    val matchedCount: Int,
    val excludedCount: Int,
    val estimatedByStatus: Map<String, Int>,
    val warnings: List<String>,
    val expiresAt: String,
)

data class AdminNotificationReplayConfirmResponse(
    val replayedCount: Int,
    val skippedCount: Int,
    val selectionHash: String,
)

fun AdminNotificationOperationsSnapshot.toResponse(): AdminNotificationOperationsSnapshotResponse =
    AdminNotificationOperationsSnapshotResponse(
        generatedAt = generatedAt.toString(),
        outboxSummary = outboxSummary,
        deliverySummary = deliverySummary,
        relaySummary =
            AdminNotificationRelaySummaryResponse(
                relaySummary.publishing,
                relaySummary.sending,
                relaySummary.stalePublishing,
                relaySummary.staleSending,
            ),
        failureClusters = failureClusters.map(AdminNotificationFailureCluster::toResponse),
        clubHealth = clubHealth.map(AdminNotificationClubHealth::toResponse),
        recentManualDispatches =
            recentManualDispatches.map(AdminNotificationManualDispatchSummary::toResponse),
    )

fun AdminNotificationOutboxEvent.toResponse(): AdminNotificationOutboxEventResponse =
    AdminNotificationOutboxEventResponse(
        eventId = eventId.toString(),
        club = club.toResponse(),
        eventType = eventType.name,
        source = source.name,
        status = status.name,
        attemptCount = attemptCount,
        nextAttemptAt = nextAttemptAt?.toString(),
        createdAt = createdAt.toString(),
        updatedAt = updatedAt.toString(),
        safeErrorCode = safeErrorCode,
        manualDispatch = manualDispatch?.toResponse(),
    )

fun AdminNotificationDelivery.toResponse(): AdminNotificationDeliveryResponse =
    AdminNotificationDeliveryResponse(
        deliveryId = deliveryId.toString(),
        eventId = eventId.toString(),
        club = club.toResponse(),
        channel = channel.name,
        status = status.name,
        maskedRecipient = maskedRecipient,
        attemptCount = attemptCount,
        createdAt = createdAt.toString(),
        updatedAt = updatedAt.toString(),
        safeErrorCode = safeErrorCode,
    )

fun AdminNotificationReplayPreview.toResponse(): AdminNotificationReplayPreviewResponse =
    AdminNotificationReplayPreviewResponse(
        previewId = previewId.toString(),
        selectionHash = selectionHash,
        matchedCount = matchedCount,
        excludedCount = excludedCount,
        estimatedByStatus = estimatedByStatus,
        warnings = warnings,
        expiresAt = expiresAt.toString(),
    )

fun AdminNotificationReplayConfirmResult.toResponse(): AdminNotificationReplayConfirmResponse =
    AdminNotificationReplayConfirmResponse(replayedCount, skippedCount, selectionHash)

private fun AdminNotificationFailureCluster.toResponse(): AdminNotificationFailureClusterResponse =
    AdminNotificationFailureClusterResponse(safeErrorCode, status, count, latestAt?.toString())

private fun AdminNotificationClubHealth.toResponse(): AdminNotificationClubHealthResponse =
    AdminNotificationClubHealthResponse(
        clubId.toString(),
        slug,
        name,
        pending,
        failed,
        dead,
        lastSuccessAt?.toString(),
    )

private fun AdminNotificationManualDispatchSummary.toResponse(): AdminNotificationManualDispatchSummaryResponse =
    AdminNotificationManualDispatchSummaryResponse(
        manualDispatchId.toString(),
        eventId.toString(),
        clubId.toString(),
        clubName,
        eventType.name,
        eventStatus.name,
        targetCount,
        createdAt.toString(),
    )

private fun AdminNotificationClubRef.toResponse(): AdminNotificationClubRefResponse =
    AdminNotificationClubRefResponse(clubId.toString(), slug, name)

private fun AdminNotificationManualDispatchMetadata.toResponse(): AdminNotificationManualDispatchMetadataResponse =
    AdminNotificationManualDispatchMetadataResponse(manualDispatchId.toString(), requestedBy, targetCount)
