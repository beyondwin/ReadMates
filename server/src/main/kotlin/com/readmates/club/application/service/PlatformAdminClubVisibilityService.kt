package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.CLUB_VISIBILITY_COMMAND_TYPE
import com.readmates.club.application.model.CLUB_VISIBILITY_SCHEMA_VERSION
import com.readmates.club.application.model.ConfirmPlatformAdminClubVisibilityCommand
import com.readmates.club.application.model.PlatformAdminClubCommandPreview
import com.readmates.club.application.model.PlatformAdminClubCommandReceipt
import com.readmates.club.application.model.PlatformAdminClubDetail
import com.readmates.club.application.model.PreviewPlatformAdminClubVisibilityCommand
import com.readmates.club.application.port.`in`.ConfirmPlatformAdminClubVisibilityUseCase
import com.readmates.club.application.port.`in`.PreviewPlatformAdminClubVisibilityUseCase
import com.readmates.club.application.port.out.LoadPlatformAdminClubCommandPreviewResult
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.LockedPlatformAdminClubVisibilityState
import com.readmates.club.application.port.out.PlatformAdminClubCommandPort
import com.readmates.club.application.port.out.PlatformAdminClubVisibilityLockPort
import com.readmates.club.application.port.out.StorePlatformAdminClubVisibilityCommand
import com.readmates.club.application.port.out.StorePlatformAdminClubVisibilityResult
import com.readmates.club.application.port.out.StoredPlatformAdminClubCommandPreview
import com.readmates.club.domain.ClubPublicVisibility
import com.readmates.club.domain.ClubStatus
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Clock
import java.util.UUID

@Service
class PlatformAdminClubVisibilityService(
    private val loadClubsPort: LoadPlatformAdminClubsPort,
    private val commandPort: PlatformAdminClubCommandPort,
    private val visibilityLockPort: PlatformAdminClubVisibilityLockPort,
    private val identityService: AdminCommandIdentityService,
    private val idempotencyService: AdminCommandIdempotencyService,
    private val properties: AdminCommandIdempotencyProperties,
    private val clock: Clock,
) : PreviewPlatformAdminClubVisibilityUseCase,
    ConfirmPlatformAdminClubVisibilityUseCase {
    override fun previewVisibility(
        admin: PlatformActor,
        clubId: UUID,
        command: PreviewPlatformAdminClubVisibilityCommand,
    ): PlatformAdminClubCommandPreview {
        requireManage(admin)
        val current = requireClub(clubId)
        requireRevision(current, command.expectedAdminRevision)
        VisibilityPolicy.validateTarget(current, command.targetVisibility) {
            loadClubsPort.activeHostCount(clubId)
        }
        val previewId = UUID.randomUUID()
        val request =
            VisibilityPolicy.request(
                previewId,
                clubId,
                command.expectedAdminRevision,
                command.targetVisibility,
            )
        val digest =
            identityService
                .resolve(VisibilityPolicy.identity(admin, clubId, previewId.toString()), request)
                .digests.current
        val now = clock.instant()
        val stored =
            StoredPlatformAdminClubCommandPreview(
                previewId = previewId,
                commandType = CLUB_VISIBILITY_COMMAND_TYPE,
                actorAdminId = admin.adminId,
                actorRoleSnapshot = admin.role.name,
                actorCapabilities = admin.capabilitySnapshots(),
                clubId = clubId,
                canonicalSchemaVersion = digest.schemaVersion,
                digestKeyVersion = digest.digestKeyVersion,
                requestHmac = digest.requestHmac,
                expectedAdminRevision = command.expectedAdminRevision,
                currentVisibility = current.publicVisibility,
                targetVisibility = command.targetVisibility,
                impactCodes = VisibilityPolicy.impacts(current, command.targetVisibility),
                expiresAt = now.plus(properties.previewTtl),
                consumedAt = null,
                consumedReceiptId = null,
                createdAt = now,
            )
        commandPort.savePreview(stored)
        return VisibilityPolicy.toResponse(stored)
    }

    @Transactional
    override fun confirmVisibility(
        admin: PlatformActor,
        clubId: UUID,
        command: ConfirmPlatformAdminClubVisibilityCommand,
    ): PlatformAdminClubCommandReceipt {
        requireManage(admin)
        if (!command.confirmed) fail(PlatformAdminError.CONFIRMATION_REQUIRED)
        PlatformAdminCommandInputPolicy.requireIdempotencyKey(command.idempotencyKey)
        val request =
            VisibilityPolicy.request(
                command.previewId,
                clubId,
                command.expectedAdminRevision,
                command.targetVisibility,
            )
        val identity = VisibilityPolicy.identity(admin, clubId, command.idempotencyKey)
        return when (val claim = idempotencyService.claim(identity, request)) {
            is AdminCommandClaimResult.Completed -> replay(claim, admin, clubId)
            AdminCommandClaimResult.Conflict -> fail(PlatformAdminError.IDEMPOTENCY_CONFLICT)
            AdminCommandClaimResult.InProgress -> fail(PlatformAdminError.COMMAND_IN_PROGRESS)
            is AdminCommandClaimResult.Claimed -> execute(admin, clubId, command, identity, request, claim)
        }
    }

    private fun execute(
        admin: PlatformActor,
        clubId: UUID,
        command: ConfirmPlatformAdminClubVisibilityCommand,
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
        claim: AdminCommandClaimResult.Claimed,
    ): PlatformAdminClubCommandReceipt {
        val preview =
            when (val loaded = commandPort.loadPreview(command.previewId)) {
                is LoadPlatformAdminClubCommandPreviewResult.Loaded -> loaded.preview
                LoadPlatformAdminClubCommandPreviewResult.Missing -> fail(PlatformAdminError.PREVIEW_NOT_FOUND)
                LoadPlatformAdminClubCommandPreviewResult.CommandMismatch -> fail(PlatformAdminError.PREVIEW_MISMATCH)
            }
        validatePreview(preview, admin, clubId, command, identity, request)
        val current =
            visibilityLockPort.lockVisibilityState(
                clubId,
                requireActiveHost = preview.targetVisibility == ClubPublicVisibility.PUBLIC,
            ) ?: fail(PlatformAdminError.CLUB_NOT_FOUND)
        if (current.adminRevision != command.expectedAdminRevision) fail(PlatformAdminError.REVISION_CONFLICT)
        VisibilityPolicy.validateLockedTarget(current, preview.targetVisibility)
        val receipt =
            VisibilityPolicy.storedReceipt(
                commandPort.storeVisibility(storeCommand(preview, current, admin, claim)),
            )
        complete(claim, receipt)
        return receipt
    }

    private fun validatePreview(
        preview: StoredPlatformAdminClubCommandPreview,
        admin: PlatformActor,
        clubId: UUID,
        command: ConfirmPlatformAdminClubVisibilityCommand,
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
    ) {
        if (preview.actorAdminId != admin.adminId || preview.clubId != clubId) fail(PlatformAdminError.PREVIEW_MISMATCH)
        if (preview.consumedAt != null || preview.consumedReceiptId != null) fail(PlatformAdminError.PREVIEW_CONSUMED)
        if (!preview.expiresAt.isAfter(clock.instant())) fail(PlatformAdminError.PREVIEW_EXPIRED)
        val shapeMatches =
            preview.expectedAdminRevision == command.expectedAdminRevision &&
                preview.targetVisibility == command.targetVisibility
        if (!shapeMatches) fail(PlatformAdminError.PREVIEW_MISMATCH)
        val digest =
            identityService
                .resolve(identity, request)
                .digests.lookupCandidates
                .firstOrNull { it.digestKeyVersion == preview.digestKeyVersion }
                ?: fail(PlatformAdminError.PREVIEW_MISMATCH)
        val matches = preview.canonicalSchemaVersion == digest.schemaVersion
        val hmacMatches = RequestIdentityHmac.equal(preview.requestHmac, digest.requestHmac)
        if (!(matches and hmacMatches)) fail(PlatformAdminError.PREVIEW_MISMATCH)
    }

    private fun storeCommand(
        preview: StoredPlatformAdminClubCommandPreview,
        current: LockedPlatformAdminClubVisibilityState,
        admin: PlatformActor,
        claim: AdminCommandClaimResult.Claimed,
    ) = StorePlatformAdminClubVisibilityCommand(
        preview = preview,
        receiptId = UUID.randomUUID(),
        auditEventId = UUID.randomUUID(),
        actorAdminId = admin.adminId,
        actorRoleSnapshot = admin.role.name,
        actorCapabilities = admin.capabilitySnapshots(),
        digest = claim.currentDigest,
        previousStatus = current.status,
        nextStatus = VisibilityPolicy.nextStatus(current.status, preview.targetVisibility),
        occurredAt = clock.instant(),
    )

    private fun replay(
        claim: AdminCommandClaimResult.Completed,
        admin: PlatformActor,
        clubId: UUID,
    ): PlatformAdminClubCommandReceipt =
        commandPort.loadReceipt(
            UUID.fromString(claim.receiptId),
            admin.adminId,
            CLUB_VISIBILITY_COMMAND_TYPE,
            CLUB_TARGET_TYPE,
            clubId,
        ) ?: fail(PlatformAdminError.PREVIEW_MISMATCH)

    private fun complete(
        claim: AdminCommandClaimResult.Claimed,
        receipt: PlatformAdminClubCommandReceipt,
    ) {
        if (!idempotencyService.complete(claim.claimId, claim.claimToken, RECEIPT_TYPE, receipt.receiptId.toString())) {
            fail(PlatformAdminError.COMMAND_IN_PROGRESS)
        }
    }

    private fun requireManage(admin: PlatformActor) {
        if (!admin.can(PlatformCapability.MANAGE_CLUBS)) {
            throw AccessDeniedException("Platform admin role cannot update clubs")
        }
    }

    private fun requireClub(clubId: UUID): PlatformAdminClubDetail =
        loadClubsPort.loadClubDetail(clubId) ?: fail(PlatformAdminError.CLUB_NOT_FOUND)

    private fun requireRevision(
        club: PlatformAdminClubDetail,
        expected: Long,
    ) {
        if (club.adminRevision != expected) fail(PlatformAdminError.REVISION_CONFLICT)
    }

    private fun fail(error: PlatformAdminError): Nothing = throw PlatformAdminException(error, error.name)

    private companion object {
        private const val CLUB_TARGET_TYPE = "club"
        private const val RECEIPT_TYPE = "platform_admin_club_command_receipt"
    }
}

private object VisibilityPolicy {
    fun identity(
        admin: PlatformActor,
        clubId: UUID,
        key: String,
    ) = PlatformAdminCommandIdentity(
        admin.adminId,
        CLUB_VISIBILITY_COMMAND_TYPE,
        CLUB_TARGET_TYPE,
        clubId.toString(),
        key,
    )

    fun request(
        previewId: UUID,
        clubId: UUID,
        expectedRevision: Long,
        targetVisibility: ClubPublicVisibility,
    ): CanonicalAdminCommandRequest =
        object : CanonicalAdminCommandRequest {
            override val schemaVersion: String = CLUB_VISIBILITY_SCHEMA_VERSION

            override fun canonicalFields(): List<Pair<String, String>> =
                listOf(
                    "clubId" to clubId.toString(),
                    "confirmed" to "true",
                    "expectedAdminRevision" to expectedRevision.toString(),
                    "previewId" to previewId.toString(),
                    "targetVisibility" to targetVisibility.name,
                )
        }

    fun toResponse(preview: StoredPlatformAdminClubCommandPreview) =
        PlatformAdminClubCommandPreview(
            preview.previewId,
            preview.expiresAt,
            preview.currentVisibility,
            preview.targetVisibility,
            preview.impactCodes,
            preview.requestHmac.fingerprintPrefix(),
        )

    fun storedReceipt(result: StorePlatformAdminClubVisibilityResult): PlatformAdminClubCommandReceipt =
        when (result) {
            is StorePlatformAdminClubVisibilityResult.Stored -> result.receipt
            StorePlatformAdminClubVisibilityResult.RevisionConflict -> fail(PlatformAdminError.REVISION_CONFLICT)
            StorePlatformAdminClubVisibilityResult.PreviewConsumed -> fail(PlatformAdminError.PREVIEW_CONSUMED)
        }

    fun validateTarget(
        current: PlatformAdminClubDetail,
        target: ClubPublicVisibility,
        activeHostCount: () -> Int,
    ) {
        if (target == current.publicVisibility) fail(PlatformAdminError.PREVIEW_MISMATCH)
        if (target == ClubPublicVisibility.PUBLIC) {
            PlatformAdminClubPublicInfoPolicy.validate(current.name, current.tagline, current.about)
            validatePublic(current.status, activeHostCount())
        }
    }

    fun validateLockedTarget(
        current: LockedPlatformAdminClubVisibilityState,
        target: ClubPublicVisibility,
    ) {
        if (target == current.publicVisibility) fail(PlatformAdminError.PREVIEW_MISMATCH)
        if (target == ClubPublicVisibility.PUBLIC) {
            PlatformAdminClubPublicInfoPolicy.validate(current.name, current.tagline, current.about)
            validatePublic(current.status, if (current.hasActiveHost) 1 else 0)
        }
    }

    fun impacts(
        current: PlatformAdminClubDetail,
        target: ClubPublicVisibility,
    ): List<String> =
        buildList {
            add(if (target == ClubPublicVisibility.PUBLIC) "ENABLE_PUBLIC_ACCESS" else "REMOVE_PUBLIC_ACCESS")
            if (nextStatus(current, target) != current.status) add("ACTIVATE_CLUB")
        }

    fun nextStatus(
        current: PlatformAdminClubDetail,
        target: ClubPublicVisibility,
    ): ClubStatus = nextStatus(current.status, target)

    fun nextStatus(
        currentStatus: ClubStatus,
        target: ClubPublicVisibility,
    ): ClubStatus =
        ClubStatus.ACTIVE.takeIf {
            target == ClubPublicVisibility.PUBLIC && currentStatus == ClubStatus.SETUP_REQUIRED
        } ?: currentStatus

    private fun validatePublic(
        currentStatus: ClubStatus,
        activeHostCount: Int,
    ) {
        if (currentStatus in setOf(ClubStatus.SUSPENDED, ClubStatus.ARCHIVED)) {
            fail(PlatformAdminError.CLUB_PUBLISH_NOT_ALLOWED)
        }
        if (activeHostCount == 0) fail(PlatformAdminError.CLUB_HOST_REQUIRED)
    }

    private fun fail(error: PlatformAdminError): Nothing = throw PlatformAdminException(error, error.name)

    private const val CLUB_TARGET_TYPE = "club"
}
