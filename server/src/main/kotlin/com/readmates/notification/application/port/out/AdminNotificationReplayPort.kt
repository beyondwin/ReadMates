package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationReplaySnapshot
import com.readmates.notification.application.model.AdminNotificationReplayTarget
import java.time.OffsetDateTime
import java.util.UUID

interface AdminNotificationReplayPort {
    fun loadSnapshot(
        filter: AdminNotificationFilter,
        targetLimit: Int,
    ): AdminNotificationReplaySnapshot

    fun createPreview(input: AdminNotificationReplayPreviewInsert): UUID

    fun lockPreview(previewId: UUID): AdminNotificationReplayPreviewRecord?

    fun findConfirmation(previewId: UUID): AdminNotificationReplayConfirmation?

    fun replayPreviewTargets(
        previewId: UUID,
        replayedAt: OffsetDateTime,
    ): Int

    fun createConfirmation(input: AdminNotificationReplayConfirmationInsert): UUID

    fun consumePreview(
        previewId: UUID,
        confirmationId: UUID,
        consumedAt: OffsetDateTime,
    ): Boolean
}

interface AdminNotificationAuditPort {
    fun writeReplayConfirmed(
        actorUserId: UUID,
        actorPlatformRole: String,
        metadataJson: String,
        createdAt: OffsetDateTime,
    ): UUID
}

data class AdminNotificationReplayPreviewRecord(
    val previewId: UUID,
    val contractVersion: Int = 2,
    val actorUserId: UUID,
    val actorPlatformRole: String? = "OWNER",
    val clubId: UUID? = null,
    val filterJson: String,
    val selectionHash: String,
    val matchedCount: Int,
    val expiresAt: OffsetDateTime,
    val consumedAt: OffsetDateTime? = null,
)

data class AdminNotificationReplayPreviewInsert(
    val contractVersion: Int,
    val actorUserId: UUID,
    val actorPlatformRole: String,
    val clubId: UUID?,
    val filter: AdminNotificationFilter,
    val filterJson: String,
    val selectionHash: String,
    val targets: List<AdminNotificationReplayTarget>,
    val createdAt: OffsetDateTime,
    val expiresAt: OffsetDateTime,
)

data class AdminNotificationReplayConfirmation(
    val confirmationId: UUID,
    val previewId: UUID,
    val actorUserId: UUID,
    val actorPlatformRole: String,
    val clubId: UUID?,
    val selectionHash: String,
    val replayedCount: Int,
    val skippedCount: Int,
    val confirmedAt: OffsetDateTime,
)

data class AdminNotificationReplayConfirmationInsert(
    val previewId: UUID,
    val actorUserId: UUID,
    val actorPlatformRole: String,
    val clubId: UUID?,
    val selectionHash: String,
    val replayedCount: Int,
    val skippedCount: Int,
    val platformAuditEventId: UUID,
    val confirmedAt: OffsetDateTime,
)
