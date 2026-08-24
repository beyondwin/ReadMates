package com.readmates.club.application.port.out

import com.readmates.club.application.model.ClubDomainActualCheckResult
import com.readmates.club.application.model.ClubLifecycleState
import com.readmates.club.application.model.FirstHostOnboardingState
import com.readmates.club.application.model.NormalizedClubDomainHostname
import com.readmates.club.application.model.PlatformAdminClubCommandReceipt
import com.readmates.club.application.model.PlatformAdminClubDetail
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.PlatformAdminClubListItem
import com.readmates.club.application.model.PlatformAdminDomainStatus
import com.readmates.club.application.model.PublicVisibility
import com.readmates.club.domain.ClubDomainKind
import com.readmates.club.domain.ClubDomainStatus
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID

sealed interface CreateClubDomainResult {
    data class Created(
        val domain: PlatformAdminClubDomain,
    ) : CreateClubDomainResult

    data object ClubNotFound : CreateClubDomainResult

    data object DuplicateHostname : CreateClubDomainResult
}

interface LoadPlatformAdminSummaryPort {
    fun countActiveClubs(): Long

    fun countDomainsRequiringAction(): Long

    fun listDomains(limit: Int): List<PlatformAdminClubDomain>

    fun listDomainsRequiringAction(limit: Int): List<PlatformAdminClubDomain>
}

interface CreateClubDomainPort {
    fun createClubDomain(
        clubId: UUID,
        hostname: String,
        kind: ClubDomainKind,
        isPrimary: Boolean,
    ): CreateClubDomainResult
}

interface LoadClubDomainProvisioningPort {
    fun loadClubDomain(domainId: UUID): PlatformAdminClubDomain?
}

interface UpdateClubDomainProvisioningPort {
    fun updateClubDomainProvisioning(
        domainId: UUID,
        status: ClubDomainStatus,
        verifiedAt: OffsetDateTime?,
        lastCheckedAt: OffsetDateTime,
        errorCode: String?,
    ): PlatformAdminClubDomain?
}

interface CheckClubDomainActualStatePort {
    fun check(hostname: NormalizedClubDomainHostname): ClubDomainActualCheckResult
}

interface LoadClubDomainOperationalHostnamePort {
    fun loadOperationalHostname(domainId: UUID): NormalizedClubDomainHostname?
}

interface LoadPlatformAdminClubsPort {
    fun listClubs(query: PlatformAdminClubRegistryQuery): List<PlatformAdminClubRegistryRow>

    fun loadClub(clubId: UUID): PlatformAdminClubListItem?

    fun loadClubDetail(clubId: UUID): PlatformAdminClubDetail?

    fun activeHostCount(clubId: UUID): Int
}

data class PlatformAdminClubRegistryQuery(
    val search: String?,
    val lifecycle: ClubLifecycleState?,
    val visibility: PublicVisibility?,
    val domainStatus: PlatformAdminDomainStatus?,
    val onboardingState: FirstHostOnboardingState?,
    val afterNormalizedName: String?,
    val afterClubId: UUID?,
    val limit: Int,
)

data class PlatformAdminClubRegistryRow(
    val item: PlatformAdminClubListItem,
    val normalizedName: String,
)

interface UpdatePlatformAdminClubPort {
    fun updateClubMetadata(
        clubId: UUID,
        expectedAdminRevision: Long,
        patch: UpdatePlatformAdminClubPatch,
    ): UpdatePlatformAdminClubResult
}

data class StoredPlatformAdminClubCommandPreview(
    val previewId: UUID,
    val commandType: String,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val clubId: UUID,
    val canonicalSchemaVersion: String,
    val digestKeyVersion: Int,
    val requestHmac: ByteArray,
    val expectedAdminRevision: Long,
    val currentVisibility: ClubPublicVisibility,
    val targetVisibility: ClubPublicVisibility,
    val impactCodes: List<String>,
    val expiresAt: Instant,
    val consumedAt: Instant?,
    val consumedReceiptId: UUID?,
    val createdAt: Instant,
)

sealed interface LoadPlatformAdminClubCommandPreviewResult {
    data class Loaded(
        val preview: StoredPlatformAdminClubCommandPreview,
    ) : LoadPlatformAdminClubCommandPreviewResult

    data object Missing : LoadPlatformAdminClubCommandPreviewResult

    data object CommandMismatch : LoadPlatformAdminClubCommandPreviewResult
}

data class LockedPlatformAdminClubVisibilityState(
    val clubId: UUID,
    val name: String,
    val tagline: String,
    val about: String,
    val adminRevision: Long,
    val status: ClubStatus,
    val publicVisibility: ClubPublicVisibility,
    val hasActiveHost: Boolean,
)

interface PlatformAdminClubVisibilityLockPort {
    fun lockVisibilityState(
        clubId: UUID,
        requireActiveHost: Boolean,
    ): LockedPlatformAdminClubVisibilityState?
}

data class StorePlatformAdminClubVisibilityCommand(
    val preview: StoredPlatformAdminClubCommandPreview,
    val receiptId: UUID,
    val auditEventId: UUID,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val digest: AdminCommandDigest,
    val previousStatus: ClubStatus,
    val nextStatus: ClubStatus,
    val occurredAt: Instant,
)

data class StoredPlatformAdminDomainCommandPreview(
    val previewId: UUID,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val clubId: UUID,
    val canonicalSchemaVersion: String,
    val digestKeyVersion: Int,
    val requestHmac: ByteArray,
    val expectedAdminRevision: Long,
    val kind: ClubDomainKind,
    val isPrimary: Boolean,
    val impactCodes: List<String>,
    val expiresAt: Instant,
    val consumedAt: Instant?,
    val consumedReceiptId: UUID?,
    val createdAt: Instant,
)

data class CreatePlatformAdminClubDomainOrigin(
    val domainId: UUID,
    val clubId: UUID,
    val hostname: NormalizedClubDomainHostname,
    val kind: ClubDomainKind,
    val occurredAt: Instant,
)

data class StorePlatformAdminClubDomainEvidenceCommand(
    val preview: StoredPlatformAdminDomainCommandPreview,
    val receiptId: UUID,
    val convergenceId: UUID,
    val auditEventId: UUID,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val digest: AdminCommandDigest,
    val occurredAt: Instant,
)

sealed interface StorePlatformAdminClubDomainResult {
    data class Stored(
        val receipt: PlatformAdminClubCommandReceipt,
    ) : StorePlatformAdminClubDomainResult

    data object RevisionConflict : StorePlatformAdminClubDomainResult

    data object PreviewConsumed : StorePlatformAdminClubDomainResult

    data object DuplicateHostname : StorePlatformAdminClubDomainResult
}

data class StorePlatformAdminDomainRecheckCommand(
    val domainId: UUID,
    val clubId: UUID,
    val expectedStatus: ClubDomainStatus,
    val clubAdminRevision: Long,
    val receiptId: UUID,
    val convergenceId: UUID,
    val auditEventId: UUID,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val digest: AdminCommandDigest,
    val occurredAt: Instant,
)

sealed interface StorePlatformAdminDomainRecheckResult {
    data class Stored(
        val receipt: PlatformAdminClubCommandReceipt,
    ) : StorePlatformAdminDomainRecheckResult

    data object StateConflict : StorePlatformAdminDomainRecheckResult

    data object DomainNotFound : StorePlatformAdminDomainRecheckResult
}

data class PlatformAdminDomainConvergenceLease(
    val convergenceId: UUID,
    val receiptId: UUID,
    val domainId: UUID,
    val attemptNo: Int,
    val targetObservation: PlatformAdminDomainTargetObservation,
)

data class PlatformAdminDomainTargetObservation(
    val status: ClubDomainStatus,
    val updatedAt: Instant,
    val safeErrorCode: String?,
)

sealed interface PlatformAdminDomainConvergenceAcquisition {
    data class Acquired(
        val lease: PlatformAdminDomainConvergenceLease,
    ) : PlatformAdminDomainConvergenceAcquisition

    data object Unavailable : PlatformAdminDomainConvergenceAcquisition

    data object Terminalized : PlatformAdminDomainConvergenceAcquisition
}

sealed interface StorePlatformAdminClubVisibilityResult {
    data class Stored(
        val receipt: PlatformAdminClubCommandReceipt,
    ) : StorePlatformAdminClubVisibilityResult

    data object RevisionConflict : StorePlatformAdminClubVisibilityResult

    data object PreviewConsumed : StorePlatformAdminClubVisibilityResult
}

interface PlatformAdminClubCommandPort {
    fun savePreview(preview: StoredPlatformAdminClubCommandPreview)

    fun loadPreview(previewId: UUID): LoadPlatformAdminClubCommandPreviewResult

    fun loadReceipt(
        receiptId: UUID,
        actorAdminId: UUID,
        commandType: String,
        targetType: String,
        targetId: UUID,
    ): PlatformAdminClubCommandReceipt?

    fun storeVisibility(command: StorePlatformAdminClubVisibilityCommand): StorePlatformAdminClubVisibilityResult

    fun saveDomainPreview(preview: StoredPlatformAdminDomainCommandPreview)

    fun loadDomainPreview(previewId: UUID): StoredPlatformAdminDomainCommandPreview?

    fun storeDomainCreation(
        origin: CreatePlatformAdminClubDomainOrigin,
        evidence: StorePlatformAdminClubDomainEvidenceCommand,
    ): StorePlatformAdminClubDomainResult

    fun storeDomainRecheck(command: StorePlatformAdminDomainRecheckCommand): StorePlatformAdminDomainRecheckResult

    fun tryAcquireDomainConvergence(
        convergenceId: UUID,
        leaseOwner: String,
        now: Instant,
        leaseExpiresAt: Instant,
    ): PlatformAdminDomainConvergenceAcquisition

    fun finishDomainConvergence(
        lease: PlatformAdminDomainConvergenceLease,
        leaseOwner: String,
        result: ClubDomainActualCheckResult,
        safeErrorCode: String?,
        terminalFailure: Boolean,
        completedAt: Instant,
        retryAt: Instant?,
    ): Boolean
}

sealed interface UpdatePlatformAdminClubResult {
    data class Updated(
        val detail: PlatformAdminClubDetail,
    ) : UpdatePlatformAdminClubResult

    data object NotFound : UpdatePlatformAdminClubResult

    data object RevisionConflict : UpdatePlatformAdminClubResult
}

data class UpdatePlatformAdminClubPatch(
    val name: String?,
    val tagline: String?,
    val about: String?,
)

data class PlatformAdminExistingUser(
    val userId: UUID,
    val email: String,
    val name: String,
)

data class CreatePlatformAdminClubCommand(
    val clubId: UUID,
    val slug: String,
    val name: String,
    val tagline: String,
    val about: String,
)

data class CreatePlatformAdminHostInvitationCommand(
    val invitationId: UUID,
    val clubId: UUID,
    val invitedByPlatformAdminUserId: UUID,
    val email: String,
    val name: String,
    val tokenHash: String,
    val expiresAt: OffsetDateTime,
)

data class CreatePlatformAdminHostInvitationResult(
    val invitationId: UUID,
    val token: String,
)

interface PlatformAdminOnboardingPort {
    fun slugExists(slug: String): Boolean

    fun domainHostnameExists(hostname: String): Boolean

    fun findUserByEmail(email: String): PlatformAdminExistingUser?

    fun createClub(command: CreatePlatformAdminClubCommand): UUID

    fun upsertHostMembership(
        clubId: UUID,
        userId: UUID,
        displayName: String,
    ): UUID

    fun createHostInvitation(command: CreatePlatformAdminHostInvitationCommand)
}

class TransientPlatformAdminHostInvitationMail internal constructor(
    internal val to: String,
    internal val clubName: String,
    internal val acceptUrl: String,
) {
    override fun toString(): String = "[REDACTED]"
}

interface SendPlatformAdminHostInvitationEmailPort {
    fun send(command: TransientPlatformAdminHostInvitationMail)
}
