package com.readmates.notification.application.service

import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.config.AdminNotificationReplayProperties
import com.readmates.notification.application.config.NotificationRuntimeProperties
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
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.toPlatformActor
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
    private val notificationProperties: NotificationRuntimeProperties,
    private val idempotencyService: AdminCommandIdempotencyService,
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
            fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_TOO_MANY_TARGETS)
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
        return AdminNotificationReplayPreview(
            previewId = previewId,
            selectionHash = selectionHash,
            matchedCount = snapshot.targets.size,
            excludedCount = snapshot.excludedCount,
            estimatedByStatus =
                snapshot.targets
                    .groupingBy { it.status }
                    .eachCount()
                    .toSortedMap(),
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
        requireIdempotencyKey(command.idempotencyKey)
        val claim =
            idempotencyService.claim(
                PlatformAdminCommandIdentity(
                    platformAdminUserId = admin.userId,
                    commandType = COMMAND_TYPE,
                    targetType = TARGET_TYPE,
                    targetId = command.previewId.toString(),
                    idempotencyKey = command.idempotencyKey,
                ),
                ReplayCanonicalRequest(command.previewId, command.selectionHash, reason),
            )
        return when (claim) {
            is AdminCommandClaimResult.Claimed -> confirmClaimed(admin, command, reason, claim)
            is AdminCommandClaimResult.Completed -> replayCompleted(admin, claim)
            AdminCommandClaimResult.InProgress -> fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_IN_PROGRESS)
            AdminCommandClaimResult.Conflict -> fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_IDEMPOTENCY_CONFLICT)
        }
    }

    private fun confirmClaimed(
        admin: CurrentPlatformAdmin,
        command: AdminNotificationReplayConfirmCommand,
        reason: String,
        claim: AdminCommandClaimResult.Claimed,
    ): AdminNotificationReplayConfirmResult {
        val preview = lockReplayPreview(command.previewId)
        val confirmedAt = normalizedNow()
        AdminNotificationReplayPolicy.validatePreview(preview, admin, command.selectionHash)
        AdminNotificationReplayPolicy.requireOpenPreview(preview, confirmedAt)
        val execution = replayPort.replayPreviewTargets(preview.previewId, confirmedAt)
        val replayed = execution.replayedTargetIds.size
        val skipped = execution.skippedReasonCounts.values.sum()
        check(replayed + skipped == preview.matchedCount) { "Replay target accounting changed" }
        val auditEventId = writeAudit(admin, preview, reason, replayed, skipped, confirmedAt)
        val receiptId = UUID.randomUUID()
        val convergenceId = UUID.randomUUID()
        replayPort.createConfirmation(
            AdminNotificationReplayConfirmationInsert(
                confirmationId = receiptId,
                previewId = preview.previewId,
                actorUserId = admin.userId,
                actorPlatformRole = admin.role.name,
                clubId = preview.clubId,
                selectionHash = null,
                replayedCount = replayed,
                skippedCount = skipped,
                platformAuditEventId = auditEventId,
                confirmedAt = confirmedAt,
                actorCapabilitiesJson =
                    jsonCodec.stringListJson(
                        admin
                            .toPlatformActor()
                            .capabilities
                            .map { it.name }
                            .sorted(),
                    ),
                canonicalSchemaVersion = claim.currentDigest.schemaVersion,
                digestKeyVersion = claim.currentDigest.digestKeyVersion,
                requestHmac = claim.currentDigest.requestHmac,
                skippedReasonCountsJson = jsonCodec.countMapJson(execution.skippedReasonCounts),
                replayedTargetIds = execution.replayedTargetIds,
                convergenceId = convergenceId,
            ),
        )
        if (!replayPort.consumePreview(preview.previewId, receiptId, confirmedAt)) {
            throw AdminNotificationReplayPolicy.replayConfirmationConflict()
        }
        if (!idempotencyService.complete(claim.claimId, claim.claimToken, RECEIPT_TYPE, receiptId.toString())) {
            fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_IN_PROGRESS)
        }
        return receiptResult(
            receiptId,
            replayed,
            skipped,
            execution.skippedReasonCounts,
            convergenceId,
            EFFECT_PENDING,
        )
    }

    private fun replayCompleted(
        admin: CurrentPlatformAdmin,
        claim: AdminCommandClaimResult.Completed,
    ): AdminNotificationReplayConfirmResult {
        if (claim.receiptType != RECEIPT_TYPE) fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_RECEIPT_INVALID)
        val receiptId =
            runCatching { UUID.fromString(claim.receiptId) }.getOrNull()
                ?: fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_RECEIPT_INVALID)
        val receipt =
            replayPort.findConfirmationById(receiptId)
                ?: fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_RECEIPT_INVALID)
        validateCompletedReceipt(receipt, admin)
        return receiptResult(
            receipt.confirmationId,
            receipt.replayedCount,
            receipt.skippedCount,
            receipt.skippedReasonCounts,
            receipt.convergenceId ?: fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_RECEIPT_INVALID),
            receipt.effectStatus ?: fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_RECEIPT_INVALID),
        )
    }

    private fun validateCompletedReceipt(
        receipt: AdminNotificationReplayConfirmation,
        admin: CurrentPlatformAdmin,
    ) {
        val valid =
            receipt.actorUserId == admin.userId &&
                receipt.commandType == COMMAND_TYPE &&
                receipt.targetKind == RECEIPT_TARGET_KIND &&
                receipt.targetIdSnapshot == receipt.confirmationId &&
                receipt.identityMode == HMAC_IDENTITY &&
                receipt.canonicalSchemaVersion != null &&
                receipt.digestKeyVersion != null &&
                receipt.requestHmac?.size == HMAC_SIZE &&
                receipt.originStatus == ORIGIN_SUCCEEDED
        if (!valid) fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_RECEIPT_INVALID)
    }

    private fun writeAudit(
        admin: CurrentPlatformAdmin,
        preview: AdminNotificationReplayPreviewRecord,
        reason: String,
        replayed: Int,
        skipped: Int,
        confirmedAt: OffsetDateTime,
    ): UUID =
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

    private fun receiptResult(
        receiptId: UUID,
        replayedCount: Int,
        skippedCount: Int,
        skippedReasonCounts: Map<String, Int>,
        convergenceId: UUID,
        effectStatus: String,
    ) = AdminNotificationReplayConfirmResult(
        receiptId = receiptId,
        replayedCount = replayedCount,
        skippedCount = skippedCount,
        skippedReasonCounts = skippedReasonCounts,
        originStatus = ORIGIN_SUCCEEDED,
        effectStatus = effectStatus,
        effectAvailability = if (effectAvailable()) "AVAILABLE" else "DISABLED",
        convergenceId = convergenceId,
    )

    private fun lockReplayPreview(previewId: UUID): AdminNotificationReplayPreviewRecord =
        replayPort.lockPreview(previewId)
            ?: fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_NOT_FOUND)

    private fun requireIdempotencyKey(value: String) {
        if (!IDEMPOTENCY_KEY.matches(value)) {
            fail(NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_INVALID_IDEMPOTENCY_KEY)
        }
    }

    private fun effectAvailable(): Boolean = notificationProperties.enabled && notificationProperties.worker.enabled

    private fun normalizedNow(): OffsetDateTime = clock.instant().truncatedTo(ChronoUnit.MICROS).atOffset(ZoneOffset.UTC)

    private fun fail(error: NotificationApplicationError): Nothing = throw NotificationApplicationException(error, error.name)

    private data class ReplayCanonicalRequest(
        val previewId: UUID,
        val selectionHash: String,
        val reason: String,
    ) : CanonicalAdminCommandRequest {
        override val schemaVersion: String = CANONICAL_SCHEMA_VERSION

        override fun canonicalFields(): List<Pair<String, String>> =
            listOf(
                "previewId" to previewId.toString(),
                "selectionHash" to selectionHash,
                "reason" to reason,
            )
    }

    private companion object {
        const val COMMAND_TYPE = "notification.replay"
        const val TARGET_TYPE = "notification-replay-preview"
        const val RECEIPT_TYPE = "admin_notification_replay_confirmation"
        const val RECEIPT_TARGET_KIND = "NOTIFICATION_REPLAY_TARGET_SET"
        const val CANONICAL_SCHEMA_VERSION = "notification-replay:v1"
        const val HMAC_IDENTITY = "HMAC"
        const val ORIGIN_SUCCEEDED = "SUCCEEDED"
        const val EFFECT_PENDING = "PENDING"
        const val HMAC_SIZE = 32
        val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9._-]{8,128}$")
    }
}
