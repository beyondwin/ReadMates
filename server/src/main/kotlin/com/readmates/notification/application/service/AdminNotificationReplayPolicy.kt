package com.readmates.notification.application.service

import com.readmates.club.domain.PlatformAdminRole
import com.readmates.notification.application.NotificationApplicationError
import com.readmates.notification.application.NotificationApplicationException
import com.readmates.notification.application.port.out.AdminNotificationReplayConfirmation
import com.readmates.notification.application.port.out.AdminNotificationReplayPreviewRecord
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import java.nio.charset.StandardCharsets
import java.time.OffsetDateTime

internal object AdminNotificationReplayPolicy {
    fun requireReplayRole(admin: CurrentPlatformAdmin) {
        if (admin.role !in setOf(PlatformAdminRole.OWNER, PlatformAdminRole.OPERATOR)) {
            throw AccessDeniedException("Platform admin role cannot replay notifications")
        }
    }

    fun normalizeReason(rawReason: String): String {
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

    fun validatePreview(
        preview: AdminNotificationReplayPreviewRecord,
        admin: CurrentPlatformAdmin,
        selectionHash: String,
    ) {
        requireReplayActorAndHash(preview, admin, selectionHash)
        requireAtomicReplayContract(preview)
        requireReplayPreviewRole(preview, admin)
    }

    fun validateReceipt(
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

    fun requireOpenPreview(
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

    fun replayConfirmationConflict(): NotificationApplicationException =
        NotificationApplicationException(
            NotificationApplicationError.ADMIN_NOTIFICATION_REPLAY_CONFIRMATION_CONFLICT,
            "Replay confirmation state is incomplete",
        )

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

    const val ATOMIC_REPLAY_CONTRACT_VERSION = 2
}

private const val MAX_REPLAY_REASON_CODE_POINTS = 500
private const val MAX_REPLAY_REASON_UTF8_BYTES = 1_000
