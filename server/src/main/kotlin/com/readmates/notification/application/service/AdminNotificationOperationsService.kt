package com.readmates.notification.application.service

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.model.AdminNotificationDelivery
import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.application.model.AdminNotificationOperationsSnapshot
import com.readmates.notification.application.model.AdminNotificationOutboxEvent
import com.readmates.notification.application.model.AdminNotificationReplayConfirmCommand
import com.readmates.notification.application.model.AdminNotificationReplayConfirmResult
import com.readmates.notification.application.model.AdminNotificationReplayPreview
import com.readmates.notification.application.model.AdminNotificationReplayPreviewRequest
import com.readmates.notification.application.port.`in`.ManageAdminNotificationOperationsUseCase
import com.readmates.notification.application.port.out.AdminNotificationAuditPort
import com.readmates.notification.application.port.out.AdminNotificationOperationsReadPort
import com.readmates.notification.application.port.out.AdminNotificationReplayPort
import com.readmates.shared.paging.CursorPage
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.Sha256
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Service
class AdminNotificationOperationsService(
    private val readPort: AdminNotificationOperationsReadPort,
    private val replayPort: AdminNotificationReplayPort,
    private val auditPort: AdminNotificationAuditPort,
    private val jsonCodec: AdminNotificationJsonCodec,
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

    override fun previewReplay(
        admin: CurrentPlatformAdmin,
        request: AdminNotificationReplayPreviewRequest,
    ): AdminNotificationReplayPreview {
        requireReplayRole(admin)
        val filterJson = jsonCodec.filterJson(request.filter)
        val estimate = replayPort.estimateReplayableDeliveries(request.filter)
        val selectionHash = selectionHash(filterJson, estimate.matchedCount, estimate.estimatedByStatus)
        val expiresAt = OffsetDateTime.now(ZoneOffset.UTC).plusMinutes(REPLAY_PREVIEW_TTL_MINUTES)
        val previewId =
            replayPort.createPreview(
                actorUserId = admin.userId,
                filterJson = filterJson,
                selectionHash = selectionHash,
                matchedCount = estimate.matchedCount,
                expiresAt = expiresAt,
            )
        return AdminNotificationReplayPreview(
            previewId = previewId,
            selectionHash = selectionHash,
            matchedCount = estimate.matchedCount,
            excludedCount = 0,
            estimatedByStatus = estimate.estimatedByStatus,
            warnings = emptyList(),
            expiresAt = expiresAt,
        )
    }

    override fun confirmReplay(
        admin: CurrentPlatformAdmin,
        command: AdminNotificationReplayConfirmCommand,
    ): AdminNotificationReplayConfirmResult {
        requireReplayRole(admin)
        val reason = command.reason.trim()
        if (reason.isBlank()) {
            throw NotificationApplicationException(
                NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_REASON_REQUIRED,
                "Replay reason is required",
            )
        }
        val preview =
            replayPort.loadOpenPreview(command.previewId)
                ?: throw NotificationApplicationException(
                    NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_NOT_FOUND,
                    "Replay preview not found",
                )
        if (preview.actorUserId != admin.userId) {
            throw AccessDeniedException("Replay preview belongs to another actor")
        }
        if (preview.expiresAt < OffsetDateTime.now(ZoneOffset.UTC)) {
            throw NotificationApplicationException(
                NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_PREVIEW_EXPIRED,
                "Replay preview expired",
            )
        }
        if (preview.selectionHash != command.selectionHash) {
            throw NotificationApplicationException(
                NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_SELECTION_MISMATCH,
                "Replay selection changed",
            )
        }
        replayPort.markPreviewConsumed(preview.previewId)
        val filter = jsonCodec.parseFilter(preview.filterJson)
        val replayed = replayPort.replayDeadOrFailedDeliveries(filter)
        val skipped = (preview.matchedCount - replayed).coerceAtLeast(0)
        auditPort.writeReplayConfirmed(
            actorUserId = admin.userId,
            actorPlatformRole = admin.role.name,
            metadataJson =
                jsonCodec.metadataJson(
                    previewId = preview.previewId,
                    selectionHash = preview.selectionHash,
                    reason = reason,
                    replayedCount = replayed,
                    skippedCount = skipped,
                ),
        )
        return AdminNotificationReplayConfirmResult(
            replayedCount = replayed,
            skippedCount = skipped,
            selectionHash = preview.selectionHash,
        )
    }

    private fun requireReplayRole(admin: CurrentPlatformAdmin) {
        if (admin.role !in setOf(PlatformAdminRole.OWNER, PlatformAdminRole.OPERATOR)) {
            throw AccessDeniedException("Platform admin role cannot replay notifications")
        }
    }

    private fun selectionHash(
        filterJson: String,
        matchedCount: Int,
        estimatedByStatus: Map<String, Int>,
    ): String {
        val basis = "$filterJson|$matchedCount|${estimatedByStatus.toSortedMap()}"
        return Sha256.hex(basis)
    }
}

private fun PageRequest.adminLedgerPage(): PageRequest = copy(limit = limit.coerceIn(1, MAX_ADMIN_LEDGER_LIMIT))

private const val MAX_ADMIN_LEDGER_LIMIT = 100
private const val REPLAY_PREVIEW_TTL_MINUTES = 10L

interface AdminNotificationJsonCodec {
    fun filterJson(filter: AdminNotificationFilter): String

    fun parseFilter(filterJson: String): AdminNotificationFilter = AdminNotificationFilter()

    fun metadataJson(
        previewId: UUID,
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
        selectionHash: String,
        reason: String,
        replayedCount: Int,
        skippedCount: Int,
    ): String =
        objectMapper.writeValueAsString(
            mapOf(
                "previewId" to previewId.toString(),
                "selectionHash" to selectionHash,
                "reason" to reason,
                "replayedCount" to replayedCount,
                "skippedCount" to skippedCount,
            ),
        )
}
