package com.readmates.club.application.port.out

import com.readmates.club.application.model.FirstHostPreviewKind
import com.readmates.club.application.model.PlatformAdminOnboardingCommand
import com.readmates.club.application.model.PlatformAdminOnboardingResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import java.time.Instant
import java.util.UUID

data class StoredPlatformAdminOnboardingPreview(
    val previewId: UUID,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val newClubSlotId: UUID,
    val canonicalSchemaVersion: String,
    val digestKeyVersion: Int,
    val requestHmac: ByteArray,
    val clubSlug: String,
    val firstHostKind: FirstHostPreviewKind,
    val requiredConfirmation: String?,
    val impactCodes: List<String>,
    val prerequisiteCodes: List<String>,
    val expiresAt: Instant,
    val consumedAt: Instant?,
    val consumedReceiptId: UUID?,
    val createdAt: Instant,
)

sealed interface LoadPlatformAdminOnboardingPreviewResult {
    data class Loaded(
        val preview: StoredPlatformAdminOnboardingPreview,
    ) : LoadPlatformAdminOnboardingPreviewResult

    data object Missing : LoadPlatformAdminOnboardingPreviewResult

    data object CommandMismatch : LoadPlatformAdminOnboardingPreviewResult
}

data class LockedPlatformAdminOnboardingSource(
    val slugExists: Boolean,
    val domainExists: Boolean,
    val existingUser: PlatformAdminExistingUser?,
)

data class StorePlatformAdminOnboardingOriginCommand(
    val preview: StoredPlatformAdminOnboardingPreview,
    val command: PlatformAdminOnboardingCommand,
    val clubId: UUID,
    val membershipId: UUID?,
    val invitationId: UUID?,
    val domainId: UUID?,
    val receiptId: UUID,
    val platformAuditEventId: UUID,
    val clubAuditEventIds: List<UUID>,
    val hostConvergenceId: UUID?,
    val domainConvergenceId: UUID?,
    val existingUser: PlatformAdminExistingUser?,
    val invitationTokenHash: String?,
    val invitationExpiresAt: Instant?,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val digest: AdminCommandDigest,
    val occurredAt: Instant,
)

sealed interface StorePlatformAdminOnboardingOriginResult {
    data class Stored(
        val result: PlatformAdminOnboardingResult,
    ) : StorePlatformAdminOnboardingOriginResult

    data object PreviewConsumed : StorePlatformAdminOnboardingOriginResult

    data object SlugConflict : StorePlatformAdminOnboardingOriginResult

    data object DomainConflict : StorePlatformAdminOnboardingOriginResult
}

typealias OriginStoreResult = StorePlatformAdminOnboardingOriginResult

data class PlatformAdminHostInvitationConvergenceLease(
    val convergenceId: UUID,
    val receiptId: UUID,
    val invitationId: UUID,
    val digestKeyVersion: Int,
    val attemptNo: Int,
)

sealed interface PlatformAdminHostInvitationConvergenceAcquisition {
    data class Acquired(
        val lease: PlatformAdminHostInvitationConvergenceLease,
    ) : PlatformAdminHostInvitationConvergenceAcquisition

    data object Unavailable : PlatformAdminHostInvitationConvergenceAcquisition

    data object Terminalized : PlatformAdminHostInvitationConvergenceAcquisition
}

class PlatformAdminHostInvitationDeliveryTarget internal constructor(
    internal val invitationId: UUID,
    internal val clubId: UUID,
    internal val email: String,
    internal val clubName: String,
    internal val clubSlug: String,
    internal val tokenHash: String,
) {
    override fun toString(): String = "[REDACTED]"
}

interface PlatformAdminOnboardingCommandPort {
    fun saveOnboardingPreview(preview: StoredPlatformAdminOnboardingPreview)

    fun loadOnboardingPreview(previewId: UUID): LoadPlatformAdminOnboardingPreviewResult

    fun lockOnboardingSource(command: PlatformAdminOnboardingCommand): LockedPlatformAdminOnboardingSource

    fun storeOnboardingOrigin(command: StorePlatformAdminOnboardingOriginCommand): OriginStoreResult

    fun loadOnboardingReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
    ): PlatformAdminOnboardingResult?

    fun loadOnboardingDomainConvergenceId(receiptId: UUID): UUID?

    fun tryAcquireHostInvitationConvergence(
        leaseOwner: String,
        startedAt: Instant,
        leaseExpiresAt: Instant,
        maxAttempts: Int,
    ): PlatformAdminHostInvitationConvergenceAcquisition

    fun loadHostInvitationDeliveryTarget(
        lease: PlatformAdminHostInvitationConvergenceLease,
        at: Instant,
    ): PlatformAdminHostInvitationDeliveryTarget?

    fun finishHostInvitationConvergence(
        lease: PlatformAdminHostInvitationConvergenceLease,
        leaseOwner: String,
        succeeded: Boolean,
        safeErrorCode: String?,
        terminalFailure: Boolean,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean
}
