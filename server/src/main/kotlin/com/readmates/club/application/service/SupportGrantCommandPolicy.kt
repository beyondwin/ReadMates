package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.model.StoredSupportGrantCommandPreview
import com.readmates.club.application.model.SupportGrantCommandType
import com.readmates.club.application.model.normalizeSupportGrantNote
import com.readmates.club.application.port.out.SupportGrantCommandPort
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.RequestIdentityHmac
import java.time.Clock
import java.time.OffsetDateTime
import java.util.UUID

internal class SupportGrantCommandPolicy(
    private val commandPort: SupportGrantCommandPort?,
    private val identityService: AdminCommandIdentityService?,
    private val clock: Clock,
) {
    fun requireManageSupport(admin: PlatformActor) {
        if (!admin.can(PlatformCapability.MANAGE_SUPPORT_ACCESS)) denySupportGrantManagement()
    }

    fun validateCreate(
        expiresAt: OffsetDateTime,
        note: String?,
    ): String? {
        val now = OffsetDateTime.now(clock)
        if (expiresAt <= now) {
            rejectGrant(PlatformAdminError.GRANT_EXPIRY_IN_PAST, "Grant expiry must be in the future")
        }
        if (expiresAt > now.plusHours(MAX_GRANT_EXPIRY_HOURS)) {
            rejectGrant(PlatformAdminError.GRANT_EXPIRY_TOO_LONG, "Grant expiry must be within 24 hours")
        }
        return validateNote(note)
    }

    fun validateNote(note: String?): String? {
        val normalized = normalizeSupportGrantNote(note)
        if (normalized != null && normalized.codePointCount(0, normalized.length) > MAX_SUPPORT_NOTE_CODE_POINTS) {
            rejectGrant(PlatformAdminError.GRANT_REASON_REQUIRED, "Support note is too long")
        }
        return normalized
    }

    fun requireConfirmation(
        confirmed: Boolean,
        idempotencyKey: String,
    ) {
        if (!confirmed) {
            rejectGrant(PlatformAdminError.CONFIRMATION_REQUIRED, "Explicit confirmation is required")
        }
        if (!IDEMPOTENCY_KEY.matches(idempotencyKey)) {
            rejectGrant(PlatformAdminError.INVALID_IDEMPOTENCY_KEY, "Idempotency key is invalid")
        }
    }

    fun requirePreview(
        admin: PlatformActor,
        type: SupportGrantCommandType,
        previewId: UUID,
        idempotencyKey: String,
        targetId: UUID,
        request: CanonicalAdminCommandRequest,
    ): StoredSupportGrantCommandPreview {
        val preview =
            requiredCommandPort().loadPreview(previewId)
                ?: rejectGrant(PlatformAdminError.PREVIEW_NOT_FOUND, "Support command preview not found")
        if (!preview.matchesActor(admin) || !preview.matchesTarget(type, targetId)) {
            rejectGrant(PlatformAdminError.PREVIEW_MISMATCH, "Support command preview does not match")
        }
        if (preview.consumedAt != null || preview.consumedReceiptId != null) {
            rejectGrant(PlatformAdminError.PREVIEW_CONSUMED, "Support command preview was consumed")
        }
        if (!preview.expiresAt.isAfter(clock.instant())) {
            rejectGrant(PlatformAdminError.PREVIEW_EXPIRED, "Support command preview expired")
        }
        val identity = identity(admin, type, preview, targetId, idempotencyKey)
        val candidate =
            requiredIdentityService()
                .resolve(identity, request)
                .digests
                .lookupCandidates
                .firstOrNull { it.digestKeyVersion == preview.digestKeyVersion }
                ?: rejectGrant(
                    PlatformAdminError.PREVIEW_MISMATCH,
                    "Support command preview digest key is unavailable",
                )
        if (preview.canonicalSchemaVersion != candidate.schemaVersion ||
            !RequestIdentityHmac.equal(preview.requestHmac, candidate.requestHmac)
        ) {
            rejectGrant(PlatformAdminError.PREVIEW_MISMATCH, "Support command preview digest does not match")
        }
        return preview
    }

    fun createIdentity(
        admin: PlatformActor,
        clubId: UUID,
        idempotencyKey: String,
    ) = PlatformAdminCommandIdentity(
        admin.adminId,
        SUPPORT_CREATE_COMMAND,
        SUPPORT_CLUB_TARGET,
        clubId.toString(),
        idempotencyKey,
    )

    fun revokeIdentity(
        admin: PlatformActor,
        grantId: UUID,
        idempotencyKey: String,
    ) = PlatformAdminCommandIdentity(
        admin.adminId,
        SUPPORT_REVOKE_COMMAND,
        SUPPORT_GRANT_TARGET,
        grantId.toString(),
        idempotencyKey,
    )

    private fun identity(
        admin: PlatformActor,
        type: SupportGrantCommandType,
        preview: StoredSupportGrantCommandPreview,
        targetId: UUID,
        idempotencyKey: String,
    ): PlatformAdminCommandIdentity =
        when (type) {
            SupportGrantCommandType.CREATE -> createIdentity(admin, preview.clubId, idempotencyKey)
            SupportGrantCommandType.REVOKE -> revokeIdentity(admin, targetId, idempotencyKey)
        }

    private fun requiredCommandPort(): SupportGrantCommandPort =
        requireNotNull(commandPort) { "Support command persistence is unavailable" }

    private fun requiredIdentityService(): AdminCommandIdentityService =
        requireNotNull(identityService) { "Support command identity is unavailable" }
}

private fun StoredSupportGrantCommandPreview.matchesActor(admin: PlatformActor): Boolean =
    actorAdminId == admin.adminId &&
        actorRoleSnapshot == admin.role.name &&
        actorCapabilities == admin.capabilitySnapshots()

private fun StoredSupportGrantCommandPreview.matchesTarget(
    type: SupportGrantCommandType,
    targetId: UUID,
): Boolean =
    commandType == type &&
        when (type) {
            SupportGrantCommandType.CREATE -> clubId == targetId
            SupportGrantCommandType.REVOKE -> grantId == targetId
        }
