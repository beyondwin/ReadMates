package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationReplayEstimate
import java.time.OffsetDateTime
import java.util.UUID

interface AdminNotificationReplayPort {
    fun estimateReplayableDeliveries(filter: AdminNotificationFilter): AdminNotificationReplayEstimate

    fun createPreview(
        actorUserId: UUID,
        filterJson: String,
        selectionHash: String,
        matchedCount: Int,
        createdAt: OffsetDateTime,
        expiresAt: OffsetDateTime,
    ): UUID

    fun loadOpenPreview(previewId: UUID): AdminNotificationReplayPreviewRecord?

    fun markPreviewConsumed(
        previewId: UUID,
        consumedAt: OffsetDateTime,
    ): Boolean

    fun replayDeadOrFailedDeliveries(
        filter: AdminNotificationFilter,
        replayedAt: OffsetDateTime,
    ): Int
}

interface AdminNotificationAuditPort {
    fun writeReplayConfirmed(
        actorUserId: UUID,
        actorPlatformRole: String,
        metadataJson: String,
        createdAt: OffsetDateTime,
    )
}

data class AdminNotificationReplayPreviewRecord(
    val previewId: UUID,
    val actorUserId: UUID,
    val filterJson: String,
    val selectionHash: String,
    val matchedCount: Int,
    val expiresAt: OffsetDateTime,
)
