package com.readmates.notification.application.port.out

import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationReplayExecution
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

    fun findConfirmationById(confirmationId: UUID): AdminNotificationReplayConfirmation?

    fun replayPreviewTargets(
        previewId: UUID,
        replayedAt: OffsetDateTime,
    ): AdminNotificationReplayExecution

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
    val contractVersion: Int,
    val actorUserId: UUID,
    val actorPlatformRole: String?,
    val clubId: UUID?,
    val filterJson: String,
    val selectionHash: String,
    val matchedCount: Int,
    val expiresAt: OffsetDateTime,
    val consumedAt: OffsetDateTime?,
)

data class AdminNotificationReplayPreviewInsert(
    val contractVersion: Int,
    val actorUserId: UUID,
    val actorPlatformRole: String,
    val clubId: UUID?,
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
    val selectionHash: String?,
    val replayedCount: Int,
    val skippedCount: Int,
    val confirmedAt: OffsetDateTime,
    val actorCapabilities: List<String>? = null,
    val commandType: String = "notification.replay",
    val targetKind: String = "NOTIFICATION_REPLAY_TARGET_SET",
    val targetIdSnapshot: UUID = confirmationId,
    val identityMode: String = "LEGACY_SELECTION_SHA",
    val canonicalSchemaVersion: String? = null,
    val digestKeyVersion: Int? = null,
    val requestHmac: ByteArray? = null,
    val skippedReasonCounts: Map<String, Int> = emptyMap(),
    val originStatus: String = "SUCCEEDED",
    val convergenceId: UUID? = null,
    val effectStatus: String? = null,
)

data class AdminNotificationReplayConfirmationInsert(
    val confirmationId: UUID,
    val previewId: UUID,
    val actorUserId: UUID,
    val actorPlatformRole: String,
    val clubId: UUID?,
    val selectionHash: String?,
    val replayedCount: Int,
    val skippedCount: Int,
    val platformAuditEventId: UUID,
    val confirmedAt: OffsetDateTime,
    val actorCapabilitiesJson: String,
    val canonicalSchemaVersion: String,
    val digestKeyVersion: Int,
    val requestHmac: ByteArray,
    val skippedReasonCountsJson: String,
    val replayedTargetIds: List<UUID>,
    val convergenceId: UUID,
)
