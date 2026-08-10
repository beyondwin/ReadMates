package com.readmates.notification.application.service

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.config.AdminNotificationReplayProperties
import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplayConfirmResult
import com.readmates.notification.application.model.AdminNotificationReplayPreview
import com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest
import com.readmates.notification.application.model.adminNotificationReplaySelectionHash
import com.readmates.notification.application.port.`in`.ManageAdminNotificationOperationsUseCase
import com.readmates.notification.application.port.out.AdminNotificationAuditPort
import com.readmates.notification.application.port.out.AdminNotificationOperationsReadPort
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmation
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmationInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewInsert
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewRecord
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.nio.charset.StandardCharsets
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
class AdminNotificationOperationsService(
    private val readPort: AdminNotificationOperationsReadPort,
    private val replayPort: AdminNotificationReplayPort,
    private val auditPort: AdminNotificationAuditPort,
    private val jsonCodec: AdminNotificationJsonCodec,
    private val replayProperties: AdminNotificationReplayProperties,
    private val clock: Clock,
) : ManageAdminNotificationOperationsUseCase {
    override fun snapshot(admin: CurrentPlatformAdmin): AdminNotificationOperationsSnapshot = readPort.snapshot()

    override fun listEvents(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationOutboxEvent> =
        readPort.listEvents(
            filter = filter,
            pageRequest = pageRequest.adminLedgerPage(),
        )

    override fun listDeliveries(
        admin: CurrentPlatformAdmin,
        filter: AdminNotificationFilter,
        pageRequest: PageRequest,
    ): CursorPage<AdminNotificationDelivery> =
        readPort.listDeliveries(
            filter = filter,
            pageRequest = pageRequest.adminLedgerPage(),
        )

    @Transactional
    override fun previewReplay(
        admin: CurrentPlatformAdmin,
        request: AdminNotificationReplayPreviewRequest,
    ): AdminNotificationReplayPreview {
        requireReplayRole(admin)
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
                    contractVersion = ATOMIC_REPLAY_CONTRACT_VERSION,
                    actorUserId = admin.userId,
                    actorPlatformRole = admin.role.name,
                    clubId = request.filter.clubId,
                    filter = request.filter,
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

    @Transactional
    override fun confirmReplay(
        admin: CurrentPlatformAdmin,
        command: AdminNotificationReplayConfirmCommand,
    ): AdminNotificationReplayConfirmResult {
        requireReplayRole(admin)
        val reason = validateReplayReason(command.reason)
        val preview = lockReplayPreview(command.previewId)
        val confirmedAt = normalizedNow()
        validateReplayPreview(preview, admin, command.selectionHash)
        replayPort.findConfirmation(preview.previewId)?.let { receipt ->
            validateReplayReceipt(receipt, preview, admin, command.selectionHash)
            return receipt.toConfirmResult()
        }
        requireOpenReplayPreview(preview, confirmedAt)
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
            throw replayConfirmationConflict()
        }
        return AdminNotificationReplayConfirmResult(
            replayedCount = replayed,
            skippedCount = skipped,
            selectionHash = preview.selectionHash,
        )
    }

    private fun validateReplayReason(rawReason: String): String {
        val reason = rawReason.trim()
        if (reason.isBlank()) {
            throw NotificationApplicationException(
                NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REASON_REQUIRED,
                "Replay reason is required",
            )
        }
        if (
            reason.codePointCount(0, reason.length) > MAX_REPLAY_REASON_CODE_POINTS ||
            reason.toByteArray(StandardCharsets.UTF_8).size > MAX_REPLAY_REASON_UTF8_BYTES
        ) {
            throw NotificationApplicationException(
                NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REASON_TOO_LONG,
                "Replay reason exceeds the supported bounds",
            )
        }
        return reason
    }

    private fun requireReplayRole(admin: CurrentPlatformAdmin) {
        if (admin.role !in setOf(PlatformAdminRole.OWNER, PlatformAdminRole.OPERATOR)) {
            throw AccessDeniedException("Platform admin role cannot replay notifications")
        }
    }

    private fun normalizedNow(): OffsetDateTime =
        clock
            .instant()
            .truncatedTo(ChronoUnit.MICROS)
            .atOffset(ZoneOffset.UTC)
}

private fun validateReplayPreview(
    preview: AdminNotificationReplayPreviewRecord,
    admin: CurrentPlatformAdmin,
    selectionHash: String,
) {
    requireReplayActorAndHash(preview, admin, selectionHash)
    requireAtomicReplayContract(preview)
    requireReplayPreviewRole(preview, admin)
}

private fun requireReplayActorAndHash(
    preview: AdminNotificationReplayPreviewRecord,
    admin: CurrentPlatformAdmin,
    selectionHash: String,
) {
    if (preview.actorUserId != admin.userId) {
        throw AccessDeniedException("Replay preview belongs to another actor")
    }
    if (preview.selectionHash != selectionHash) {
        throw NotificationApplicationException(
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_SELECTION_MISMATCH,
            "Replay selection changed",
        )
    }
}

private fun requireAtomicReplayContract(preview: AdminNotificationReplayPreviewRecord) {
    if (preview.contractVersion != ATOMIC_REPLAY_CONTRACT_VERSION) {
        throw NotificationApplicationException(
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REPREVIEW_REQUIRED,
            "Legacy replay preview requires a new preview",
        )
    }
}

private fun requireReplayPreviewRole(
    preview: AdminNotificationReplayPreviewRecord,
    admin: CurrentPlatformAdmin,
) {
    if (preview.actorPlatformRole != admin.role.name) {
        throw AccessDeniedException("Replay preview role changed")
    }
}

private fun validateReplayReceipt(
    receipt: AdminNotificationReplayConfirmation,
    preview: AdminNotificationReplayPreviewRecord,
    admin: CurrentPlatformAdmin,
    selectionHash: String,
) {
    if (
        receipt.actorUserId != admin.userId ||
        receipt.actorPlatformRole != admin.role.name ||
        receipt.clubId != preview.clubId ||
        receipt.selectionHash != selectionHash
    ) {
        throw AccessDeniedException("Replay confirmation identity changed")
    }
}

private fun requireOpenReplayPreview(
    preview: AdminNotificationReplayPreviewRecord,
    confirmedAt: OffsetDateTime,
) {
    if (preview.consumedAt != null) throw replayConfirmationConflict()
    if (!preview.expiresAt.isAfter(confirmedAt)) {
        throw NotificationApplicationException(
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_EXPIRED,
            "Replay preview expired",
        )
    }
}

private fun AdminNotificationReplayConfirmation.toConfirmResult(): AdminNotificationReplayConfirmResult =
    AdminNotificationReplayConfirmResult(
        replayedCount = replayedCount,
        skippedCount = skippedCount,
        selectionHash = selectionHash,
    )

private fun replayConfirmationConflict(): NotificationApplicationException =
    NotificationApplicationException(
        NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_CONFIRMATION_CONFLICT,
        "Replay confirmation state is incomplete",
    )

private fun PageRequest.adminLedgerPage(): PageRequest = copy(limit = limit.coerceIn(1, MAX_ADMIN_LEDGER_LIMIT))

private const val MAX_ADMIN_LEDGER_LIMIT = 100
private const val MAX_REPLAY_REASON_CODE_POINTS = 500
private const val MAX_REPLAY_REASON_UTF8_BYTES = 1_000
private const val ATOMIC_REPLAY_CONTRACT_VERSION = 2

interface AdminNotificationJsonCodec {
    fun filterJson(filter: AdminNotificationFilter): String

    fun parseFilter(filterJson: String): AdminNotificationFilter = AdminNotificationFilter()

    fun metadataJson(
        previewId: UUID,
        clubId: UUID?,
        selectionHash: String,
        reason: String,
        replayedCount: Int,
        skippedCount: Int,
    ): String
}

@Service
class JacksonAdminNotificationJsonCodec(
    private val objectMapper: ObjectMapper,
) : AdminNotificationJsonCodec {
    override fun filterJson(filter: AdminNotificationFilter): String = objectMapper.writeValueAsString(filter)

    override fun parseFilter(filterJson: String): AdminNotificationFilter =
        objectMapper.readValue(filterJson, AdminNotificationFilter::class.java)

    override fun metadataJson(
        previewId: UUID,
        clubId: UUID?,
        selectionHash: String,
        reason: String,
        replayedCount: Int,
        skippedCount: Int,
    ): String =
        objectMapper.writeValueAsString(
            mapOf(
                "previewId" to previewId.toString(),
                "clubId" to clubId?.toString(),
                "selectionHash" to selectionHash,
                "reason" to reason,
                "replayedCount" to replayedCount,
                "skippedCount" to skippedCount,
            ),
        )
}
