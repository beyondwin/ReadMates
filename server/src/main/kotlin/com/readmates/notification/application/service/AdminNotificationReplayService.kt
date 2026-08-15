package com.readmates.notification.application.service

import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.config.AdminNotificationReplayProperties
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplayConfirmResult
import com.readmates.notification.application.model.AdminNotificationReplayPreview
import com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest
import com.readmates.notification.application.model.adminNotificationReplaySelectionHash
import com.readmates.notification.application.port.out.AdminNotificationAuditPort
import com.readmates.notification.application.port.out.AdminNotificationJsonCodec
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmation
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmationInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewRecord
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class AdminNotificationReplayService(
    private val replayPort: AdminNotificationReplayPort,
    private val auditPort: AdminNotificationAuditPort,
    private val jsonCodec: AdminNotificationJsonCodec,
    private val replayProperties: AdminNotificationReplayProperties,
    private val clock: Clock,
) {
    @Transactional(rollbackFor = [Exception::class])
    fun preview(
        admin: CurrentPlatformAdmin,
        request: AdminNotificationReplayPreviewRequest,
    ): AdminNotificationReplayPreview {
        AdminNotificationReplayPolicy.requireReplayRole(admin)
        val createdAt = normalizedNow()
        val filterJson = jsonCodec.filterJson(request.filter)
        val snapshot = replayPort.loadSnapshot(request.filter, replayProperties.maxTargets + 1)
        if (snapshot.targets.size > replayProperties.maxTargets) {
            throw NotificationApplicationException(
                NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_TOO_MANY_TARGETS,
                "Replay target count exceeds the configured maximum",
            )
        }
        val selectionHash = adminNotificationReplaySelectionHash(request.filter, snapshot.targets)
        val expiresAt = createdAt.plus(replayProperties.previewTtl)
        val previewId =
            replayPort.createPreview(
                AdminNotificationReplayPreviewInsert(
                    contractVersion = AdminNotificationReplayPolicy.ATOMIC_REPLAY_CONTRACT_VERSION,
                    actorUserId = admin.userId,
                    actorPlatformRole = admin.role.name,
                    clubId = request.filter.clubId,
                    filterJson = filterJson,
                    selectionHash = selectionHash,
                    targets = snapshot.targets,
                    createdAt = createdAt,
                    expiresAt = expiresAt,
                ),
            )
        val estimatedByStatus =
            snapshot.targets
                .groupingBy { it.status }
                .eachCount()
                .toSortedMap()
        return AdminNotificationReplayPreview(
            previewId = previewId,
            selectionHash = selectionHash,
            matchedCount = snapshot.targets.size,
            excludedCount = snapshot.excludedCount,
            estimatedByStatus = estimatedByStatus,
            warnings = snapshot.warnings,
            expiresAt = expiresAt,
        )
    }

    @Transactional(rollbackFor = [Exception::class])
    fun confirm(
        admin: CurrentPlatformAdmin,
        command: AdminNotificationReplayConfirmCommand,
    ): AdminNotificationReplayConfirmResult {
        AdminNotificationReplayPolicy.requireReplayRole(admin)
        val reason = AdminNotificationReplayPolicy.normalizeReason(command.reason)
        val preview = lockReplayPreview(command.previewId)
        val confirmedAt = normalizedNow()
        AdminNotificationReplayPolicy.validatePreview(preview, admin, command.selectionHash)
        replayPort.findConfirmation(preview.previewId)?.let { receipt ->
            AdminNotificationReplayPolicy.validateReceipt(receipt, preview, admin, command.selectionHash)
            return receipt.toConfirmResult()
        }
        AdminNotificationReplayPolicy.requireOpenPreview(preview, confirmedAt)
        return persistReplayConfirmation(admin, preview, reason, confirmedAt)
    }

    private fun lockReplayPreview(previewId: UUID): AdminNotificationReplayPreviewRecord =
        replayPort.lockPreview(previewId)
            ?: throw NotificationApplicationException(
                NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_NOT_FOUND,
                "Replay preview not found",
            )

    private fun persistReplayConfirmation(
        admin: CurrentPlatformAdmin,
        preview: AdminNotificationReplayPreviewRecord,
        reason: String,
        confirmedAt: OffsetDateTime,
    ): AdminNotificationReplayConfirmResult {
        val replayed = replayPort.replayPreviewTargets(preview.previewId, confirmedAt)
        val skipped = (preview.matchedCount - replayed).coerceAtLeast(0)
        val auditEventId =
            auditPort.writeReplayConfirmed(
                actorUserId = admin.userId,
                actorPlatformRole = admin.role.name,
                metadataJson =
                    jsonCodec.metadataJson(
                        previewId = preview.previewId,
                        clubId = preview.clubId,
                        selectionHash = preview.selectionHash,
                        reason = reason,
                        replayedCount = replayed,
                        skippedCount = skipped,
                    ),
                createdAt = confirmedAt,
            )
        val confirmationId =
            replayPort.createConfirmation(
                AdminNotificationReplayConfirmationInsert(
                    previewId = preview.previewId,
                    actorUserId = admin.userId,
                    actorPlatformRole = admin.role.name,
                    clubId = preview.clubId,
                    selectionHash = preview.selectionHash,
                    replayedCount = replayed,
                    skippedCount = skipped,
                    platformAuditEventId = auditEventId,
                    confirmedAt = confirmedAt,
                ),
            )
        if (!replayPort.consumePreview(preview.previewId, confirmationId, confirmedAt)) {
            throw AdminNotificationReplayPolicy.replayConfirmationConflict()
        }
        return AdminNotificationReplayConfirmResult(
            replayedCount = replayed,
            skippedCount = skipped,
            selectionHash = preview.selectionHash,
        )
    }

    private fun normalizedNow(): OffsetDateTime =
        clock
            .instant()
            .truncatedTo(ChronoUnit.MICROS)
            .atOffset(ZoneOffset.UTC)
}

private fun AdminNotificationReplayConfirmation.toConfirmResult(): AdminNotificationReplayConfirmResult =
    AdminNotificationReplayConfirmResult(
        replayedCount = replayedCount,
        skippedCount = skippedCount,
        selectionHash = selectionHash,
    )
