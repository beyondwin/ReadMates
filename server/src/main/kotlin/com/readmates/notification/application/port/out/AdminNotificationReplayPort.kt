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
        expiresAt: OffsetDateTime,
    ): UUID

    fun loadOpenPreview(previewId: UUID): AdminNotificationReplayPreviewRecord?

    fun markPreviewConsumed(previewId: UUID): Boolean

    fun replayDeadOrFailedDeliveries(filter: AdminNotificationFilter): Int
}

interface AdminNotificationAuditPort {
    fun writeReplayConfirmed(
        actorUserId: UUID,
        actorPlatformRole: String,
        metadataJson: String,
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
