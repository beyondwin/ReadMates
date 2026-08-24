package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.CLUB_DOMAIN_CREATE_COMMAND_TYPE
import com.readmates.club.application.model.CLUB_DOMAIN_RECHECK_COMMAND_TYPE
import com.readmates.club.application.model.ConfirmCreateClubDomainCommand
import com.readmates.club.application.model.NormalizedClubDomainHostname
import com.readmates.club.application.model.PlatformAdminClubCommandReceipt
import com.readmates.club.application.model.PlatformAdminClubDomain
import com.readmates.club.application.model.PlatformAdminDomainCommandPreview
import com.readmates.club.application.model.PreviewCreateClubDomainCommand
import com.readmates.club.application.model.RecheckClubDomainCommand
import com.readmates.club.application.port.`in`.CheckClubDomainProvisioningUseCase
import com.readmates.club.application.port.`in`.CreateClubDomainUseCase
import com.readmates.club.application.port.`in`.PreviewClubDomainUseCase
import com.readmates.club.application.port.out.CreatePlatformAdminClubDomainOrigin
import com.readmates.club.application.port.out.LoadClubDomainProvisioningPort
import com.readmates.club.application.port.out.LoadPlatformAdminClubsPort
import com.readmates.club.application.port.out.PlatformAdminClubCommandPort
import com.readmates.club.application.port.out.StorePlatformAdminClubDomainEvidenceCommand
import com.readmates.club.application.port.out.StorePlatformAdminClubDomainResult
import com.readmates.club.application.port.out.StorePlatformAdminDomainRecheckCommand
import com.readmates.club.application.port.out.StorePlatformAdminDomainRecheckResult
import com.readmates.club.application.port.out.StoredPlatformAdminDomainCommandPreview
import com.readmates.club.domain.ClubDomainStatus
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
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.util.UUID

@Service
class PlatformAdminDomainCommandService(
    private val domainPort: LoadClubDomainProvisioningPort,
    private val clubsPort: LoadPlatformAdminClubsPort,
    private val commandPort: PlatformAdminClubCommandPort,
    private val identityService: AdminCommandIdentityService,
    private val idempotencyService: AdminCommandIdempotencyService,
    private val properties: AdminCommandIdempotencyProperties,
    private val transactions: TransactionTemplate,
    private val convergenceService: PlatformAdminDomainConvergenceService,
    private val clock: Clock,
) : PreviewClubDomainUseCase,
    CreateClubDomainUseCase,
    CheckClubDomainProvisioningUseCase {
    override fun previewClubDomain(
        admin: PlatformActor,
        clubId: UUID,
        command: PreviewCreateClubDomainCommand,
    ): PlatformAdminDomainCommandPreview {
        requireManage(admin)
        val hostname = PlatformAdminDomainCommandPolicy.validatedHostname(command.hostname, command.isPrimary)
        val club = clubsPort.loadClubDetail(clubId) ?: fail(PlatformAdminError.CLUB_NOT_FOUND)
        if (club.adminRevision != command.expectedAdminRevision) fail(PlatformAdminError.REVISION_CONFLICT)
        val previewId = UUID.randomUUID()
        val request =
            PlatformAdminDomainCommandPolicy.createRequest(
                previewId,
                clubId,
                command.expectedAdminRevision,
                hostname,
                command.kind.name,
            )
        val identity = PlatformAdminDomainCommandPolicy.createIdentity(admin, clubId, previewId.toString())
        val digest = identityService.resolve(identity, request).digests.current
        val now = clock.instant()
        val preview =
            StoredPlatformAdminDomainCommandPreview(
                previewId = previewId,
                actorAdminId = admin.adminId,
                actorRoleSnapshot = admin.role.name,
                actorCapabilities = admin.capabilitySnapshots(),
                clubId = clubId,
                canonicalSchemaVersion = digest.schemaVersion,
                digestKeyVersion = digest.digestKeyVersion,
                requestHmac = digest.requestHmac,
                expectedAdminRevision = command.expectedAdminRevision,
                kind = command.kind,
                isPrimary = false,
                impactCodes = listOf("CREATE_DOMAIN", "START_DOMAIN_PROVISIONING"),
                expiresAt = now.plus(properties.previewTtl),
                consumedAt = null,
                consumedReceiptId = null,
                createdAt = now,
            )
        commandPort.saveDomainPreview(preview)
        return PlatformAdminDomainCommandPreview(
            preview.previewId,
            preview.expiresAt,
            preview.kind,
            preview.isPrimary,
            preview.impactCodes,
            preview.requestHmac.fingerprintPrefix(),
        )
    }

    override fun createClubDomain(
        admin: PlatformActor,
        clubId: UUID,
        command: ConfirmCreateClubDomainCommand,
    ): PlatformAdminClubCommandReceipt {
        requireManage(admin)
        if (!command.confirmed) fail(PlatformAdminError.CONFIRMATION_REQUIRED)
        PlatformAdminCommandInputPolicy.requireIdempotencyKey(command.idempotencyKey)
        val hostname = PlatformAdminDomainCommandPolicy.validatedHostname(command.hostname, command.isPrimary)
        val request =
            PlatformAdminDomainCommandPolicy.createRequest(
                command.previewId,
                clubId,
                command.expectedAdminRevision,
                hostname,
                command.kind.name,
            )
        val identity = PlatformAdminDomainCommandPolicy.createIdentity(admin, clubId, command.idempotencyKey)
        val receipt =
            checkNotNull(
                transactions.execute { claimCreate(admin, clubId, command, hostname, identity, request) },
            )
        return convergenceService.process(receipt, admin)
    }

    override fun checkClubDomainProvisioning(
        admin: PlatformActor,
        domainId: UUID,
        command: RecheckClubDomainCommand,
    ): PlatformAdminClubCommandReceipt {
        requireManage(admin)
        PlatformAdminCommandInputPolicy.requireIdempotencyKey(command.idempotencyKey)
        val request = PlatformAdminDomainCommandPolicy.recheckRequest(domainId, command.expectedStatus)
        val identity = PlatformAdminDomainCommandPolicy.recheckIdentity(admin, domainId, command.idempotencyKey)
        val receipt = checkNotNull(transactions.execute { claimRecheck(admin, domainId, command, identity, request) })
        return convergenceService.process(receipt, admin)
    }

    private fun claimCreate(
        admin: PlatformActor,
        clubId: UUID,
        command: ConfirmCreateClubDomainCommand,
        hostname: NormalizedClubDomainHostname,
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
    ): PlatformAdminClubCommandReceipt =
        when (val claim = idempotencyService.claim(identity, request)) {
            is AdminCommandClaimResult.Completed ->
                loadReceipt(claim.receiptId, admin, CLUB_DOMAIN_CREATE_COMMAND_TYPE, CLUB_TARGET_TYPE, clubId)
            AdminCommandClaimResult.Conflict -> fail(PlatformAdminError.IDEMPOTENCY_CONFLICT)
            AdminCommandClaimResult.InProgress -> fail(PlatformAdminError.COMMAND_IN_PROGRESS)
            is AdminCommandClaimResult.Claimed ->
                createOrigin(admin, clubId, command, hostname, identity, request, claim)
        }

    private fun claimRecheck(
        admin: PlatformActor,
        domainId: UUID,
        command: RecheckClubDomainCommand,
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
    ): PlatformAdminClubCommandReceipt =
        when (val claim = idempotencyService.claim(identity, request)) {
            is AdminCommandClaimResult.Completed ->
                loadReceipt(claim.receiptId, admin, CLUB_DOMAIN_RECHECK_COMMAND_TYPE, DOMAIN_TARGET_TYPE, domainId)
            AdminCommandClaimResult.Conflict -> fail(PlatformAdminError.IDEMPOTENCY_CONFLICT)
            AdminCommandClaimResult.InProgress -> fail(PlatformAdminError.COMMAND_IN_PROGRESS)
            is AdminCommandClaimResult.Claimed -> {
                val domain = domainPort.loadClubDomain(domainId) ?: fail(PlatformAdminError.CLUB_DOMAIN_NOT_FOUND)
                if (domain.status == ClubDomainStatus.DISABLED) fail(PlatformAdminError.CLUB_DOMAIN_CONFLICT)
                recheckOrigin(admin, domain, command, claim)
            }
        }

    private fun createOrigin(
        admin: PlatformActor,
        clubId: UUID,
        command: ConfirmCreateClubDomainCommand,
        hostname: NormalizedClubDomainHostname,
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
        claim: AdminCommandClaimResult.Claimed,
    ): PlatformAdminClubCommandReceipt {
        val preview = commandPort.loadDomainPreview(command.previewId) ?: fail(PlatformAdminError.PREVIEW_NOT_FOUND)
        validatePreview(admin, clubId, command, preview, identity, request)
        val current = clubsPort.loadClubDetail(clubId) ?: fail(PlatformAdminError.CLUB_NOT_FOUND)
        if (current.adminRevision != command.expectedAdminRevision) fail(PlatformAdminError.REVISION_CONFLICT)
        val result =
            clock.instant().let { occurredAt ->
                val domainId = UUID.randomUUID()
                commandPort.storeDomainCreation(
                    CreatePlatformAdminClubDomainOrigin(
                        domainId,
                        preview.clubId,
                        hostname,
                        preview.kind,
                        occurredAt,
                    ),
                    StorePlatformAdminClubDomainEvidenceCommand(
                        preview,
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        UUID.randomUUID(),
                        admin.adminId,
                        admin.role.name,
                        admin.capabilitySnapshots(),
                        claim.currentDigest,
                        occurredAt,
                    ),
                )
            }
        val receipt =
            when (result) {
                is StorePlatformAdminClubDomainResult.Stored -> result.receipt
                StorePlatformAdminClubDomainResult.DuplicateHostname -> fail(PlatformAdminError.CLUB_DOMAIN_CONFLICT)
                StorePlatformAdminClubDomainResult.PreviewConsumed -> fail(PlatformAdminError.PREVIEW_CONSUMED)
                StorePlatformAdminClubDomainResult.RevisionConflict -> fail(PlatformAdminError.REVISION_CONFLICT)
            }
        complete(claim, receipt)
        return receipt
    }

    private fun recheckOrigin(
        admin: PlatformActor,
        domain: PlatformAdminClubDomain,
        command: RecheckClubDomainCommand,
        claim: AdminCommandClaimResult.Claimed,
    ): PlatformAdminClubCommandReceipt {
        val revision = clubsPort.loadClubDetail(domain.clubId)?.adminRevision ?: fail(PlatformAdminError.CLUB_NOT_FOUND)
        val result =
            commandPort.storeDomainRecheck(
                StorePlatformAdminDomainRecheckCommand(
                    domain.id,
                    domain.clubId,
                    command.expectedStatus,
                    revision,
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    admin.adminId,
                    admin.role.name,
                    admin.capabilitySnapshots(),
                    claim.currentDigest,
                    clock.instant(),
                ),
            )
        val receipt =
            when (result) {
                StorePlatformAdminDomainRecheckResult.DomainNotFound -> fail(PlatformAdminError.CLUB_DOMAIN_NOT_FOUND)
                StorePlatformAdminDomainRecheckResult.StateConflict -> fail(PlatformAdminError.CLUB_DOMAIN_CONFLICT)
                is StorePlatformAdminDomainRecheckResult.Stored -> result.receipt
            }
        complete(claim, receipt)
        return receipt
    }

    private fun validatePreview(
        admin: PlatformActor,
        clubId: UUID,
        command: ConfirmCreateClubDomainCommand,
        preview: StoredPlatformAdminDomainCommandPreview,
        identity: PlatformAdminCommandIdentity,
        request: CanonicalAdminCommandRequest,
    ) {
        if (preview.actorAdminId != admin.adminId || preview.clubId != clubId) fail(PlatformAdminError.PREVIEW_MISMATCH)
        if (preview.consumedAt != null || preview.consumedReceiptId != null) fail(PlatformAdminError.PREVIEW_CONSUMED)
        if (!preview.expiresAt.isAfter(clock.instant())) fail(PlatformAdminError.PREVIEW_EXPIRED)
        val shapeMatches =
            preview.expectedAdminRevision == command.expectedAdminRevision &&
                preview.kind == command.kind && preview.isPrimary == command.isPrimary
        if (!shapeMatches) fail(PlatformAdminError.PREVIEW_MISMATCH)
        val digest =
            identityService
                .resolve(identity, request)
                .digests.lookupCandidates
                .firstOrNull { it.digestKeyVersion == preview.digestKeyVersion }
                ?: fail(PlatformAdminError.PREVIEW_MISMATCH)
        val schemaMatches = preview.canonicalSchemaVersion == digest.schemaVersion
        val requestMatches = RequestIdentityHmac.equal(preview.requestHmac, digest.requestHmac)
        if (!(schemaMatches and requestMatches)) fail(PlatformAdminError.PREVIEW_MISMATCH)
    }

    private fun loadReceipt(
        receiptId: String,
        admin: PlatformActor,
        commandType: String,
        targetType: String,
        targetId: UUID,
    ): PlatformAdminClubCommandReceipt =
        commandPort.loadReceipt(UUID.fromString(receiptId), admin.adminId, commandType, targetType, targetId)
            ?: fail(PlatformAdminError.PREVIEW_MISMATCH)

    private fun complete(
        claim: AdminCommandClaimResult.Claimed,
        receipt: PlatformAdminClubCommandReceipt,
    ) {
        if (!idempotencyService.complete(claim.claimId, claim.claimToken, RECEIPT_TYPE, receipt.receiptId.toString())) {
            fail(PlatformAdminError.COMMAND_IN_PROGRESS)
        }
    }

    private fun requireManage(admin: PlatformActor) {
        if (!admin.can(PlatformCapability.MANAGE_CLUB_DOMAINS)) {
            throw AccessDeniedException("Platform admin role cannot manage club domains")
        }
    }

    private companion object {
        private const val RECEIPT_TYPE = "platform_admin_club_command_receipt"
        private const val CLUB_TARGET_TYPE = PlatformAdminDomainCommandPolicy.CLUB_TARGET_TYPE
        private const val DOMAIN_TARGET_TYPE = PlatformAdminDomainCommandPolicy.DOMAIN_TARGET_TYPE
    }
}

private fun fail(error: PlatformAdminError): Nothing = throw PlatformAdminException(error, error.name)
