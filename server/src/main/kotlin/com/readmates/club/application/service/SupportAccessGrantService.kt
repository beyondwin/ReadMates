package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.ConfirmSupportGrantCreateCommand
import com.readmates.club.application.model.ConfirmSupportGrantRevokeCommand
import com.readmates.club.application.model.CreateSupportAccessGrantCommand
import com.readmates.club.application.model.PreviewSupportGrantCreateCommand
import com.readmates.club.application.model.PreviewSupportGrantRevokeCommand
import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.club.application.model.SupportGrantCommandPreview
import com.readmates.club.application.model.SupportGrantCommandReceipt
import com.readmates.club.application.port.`in`.CheckSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.ConfirmSupportGrantCommandUseCase
import com.readmates.club.application.port.`in`.CreateSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.ListSupportAccessGrantsUseCase
import com.readmates.club.application.port.`in`.PreviewSupportGrantCommandUseCase
import com.readmates.club.application.port.`in`.RevokeSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.club.application.port.out.AdminSupportGrantLedgerPort
import com.readmates.club.application.port.out.CreateSupportAccessGrantPort
import com.readmates.club.application.port.out.LoadSupportAccessGrantPort
import com.readmates.club.application.port.out.RevokeSupportAccessGrantPort
import com.readmates.club.application.port.out.SupportGrantCommandPort
import com.readmates.club.application.port.out.WritePlatformAuditEventPort
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformActor
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@Service
class SupportAccessGrantService(
    private val createGrantPort: CreateSupportAccessGrantPort,
    private val revokeGrantPort: RevokeSupportAccessGrantPort,
    private val loadGrantPort: LoadSupportAccessGrantPort,
    private val grantLedgerPort: AdminSupportGrantLedgerPort,
    private val auditEventPort: WritePlatformAuditEventPort,
    private val objectMapper: ObjectMapper,
    private val commandPort: SupportGrantCommandPort? = null,
    private val identityService: AdminCommandIdentityService? = null,
    private val idempotencyService: AdminCommandIdempotencyService? = null,
    private val idempotencyProperties: AdminCommandIdempotencyProperties? = null,
    private val transactionTemplate: TransactionTemplate? = null,
    private val clock: Clock = Clock.systemUTC(),
) : CheckSupportAccessGrantUseCase,
    CreateSupportAccessGrantUseCase,
    RevokeSupportAccessGrantUseCase,
    ListSupportAccessGrantsUseCase,
    PreviewSupportGrantCommandUseCase,
    ConfirmSupportGrantCommandUseCase {
    private val commandPolicy = SupportGrantCommandPolicy(commandPort, identityService, clock)
    private val previewWorkflow =
        SupportGrantPreviewWorkflow(
            loadGrantPort,
            grantLedgerPort,
            commandPort,
            identityService,
            idempotencyProperties,
            clock,
            commandPolicy,
        )
    private val confirmationWorkflow =
        SupportGrantConfirmationWorkflow(
            grantLedgerPort,
            commandPort,
            idempotencyService,
            transactionTemplate,
            clock,
            commandPolicy,
        )

    override fun synthesizeHostCurrentMember(
        userId: UUID,
        email: String,
        clubId: UUID,
        clubSlug: String,
        clubName: String,
    ): SupportMemberSynthesis? {
        val activeGrant = loadGrantPort.loadActiveGrantByGranteeAndClub(userId, clubId) ?: return null
        return SupportMemberSynthesis(
            membershipProxyId = activeGrant.id,
            displayName = email,
            accountName = email,
        )
    }

    override fun createSupportAccessGrant(
        admin: CurrentPlatformAdmin,
        command: CreateSupportAccessGrantCommand,
    ): SupportAccessGrant {
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        validateCreateGrant(admin, command, now)

        val grant =
            createGrantPort.createGrant(
                clubId = command.clubId,
                grantedByUserId = admin.userId,
                granteeUserId = command.granteeUserId,
                scope = command.scope,
                reason = command.reason,
                expiresAt = command.expiresAt,
            )

        val metadata =
            mapOf(
                "grantId" to grant.id.toString(),
                "clubId" to grant.clubId.toString(),
                "granteeUserId" to grant.granteeUserId.toString(),
                "scope" to grant.scope.name,
                "expiresAt" to grant.expiresAt.toString(),
            )
        auditEventPort.writeEvent(
            actorUserId = admin.userId,
            actorPlatformRole = admin.role.name,
            targetUserId = command.granteeUserId,
            eventType = "SUPPORT_ACCESS_GRANT_CREATED",
            metadataJson = objectMapper.writeValueAsString(metadata),
        )

        return grant
    }

    private fun validateCreateGrant(
        admin: CurrentPlatformAdmin,
        command: CreateSupportAccessGrantCommand,
        now: OffsetDateTime,
    ) {
        if (!admin.canManageSupportAccess) {
            denySupportGrantManagement()
        }
        if (command.reason.isBlank()) {
            rejectGrant(
                PlatformAdminError.GRANT_REASON_REQUIRED,
                "Reason is required to create a support access grant",
            )
        }
        if (command.expiresAt <= now) {
            rejectGrant(
                PlatformAdminError.GRANT_EXPIRY_IN_PAST,
                "Grant expiry must be in the future",
            )
        }
        if (command.expiresAt > now.plusHours(MAX_GRANT_EXPIRY_HOURS)) {
            rejectGrant(
                PlatformAdminError.GRANT_EXPIRY_TOO_LONG,
                "Grant expiry must be within 24 hours",
            )
        }
        if (!grantLedgerPort.isActivePlatformAdmin(command.granteeUserId)) {
            rejectGrant(
                PlatformAdminError.SUPPORT_TARGET_NOT_ELIGIBLE,
                "Grantee must be an active platform admin",
            )
        }
        if (!grantLedgerPort.isGrantEligibleClub(command.clubId)) {
            rejectGrant(PlatformAdminError.SUPPORT_TARGET_NOT_FOUND, "Club is not grant eligible")
        }
        if (grantLedgerPort.hasActiveGrant(command.clubId, command.granteeUserId)) {
            rejectGrant(PlatformAdminError.GRANT_DUPLICATE_ACTIVE, "Active grant already exists")
        }
    }

    override fun revokeSupportAccessGrant(
        admin: CurrentPlatformAdmin,
        grantId: UUID,
    ) {
        if (!admin.canManageSupportAccess) {
            throw AccessDeniedException("Platform admin role cannot manage support access grants")
        }
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val revoked =
            revokeGrantPort.revokeGrant(grantId, now)
                ?: throw PlatformAdminException(PlatformAdminError.GRANT_NOT_FOUND, "Support access grant not found")

        val metadata =
            mapOf(
                "grantId" to revoked.id.toString(),
                "clubId" to revoked.clubId.toString(),
                "granteeUserId" to revoked.granteeUserId.toString(),
            )
        auditEventPort.writeEvent(
            actorUserId = admin.userId,
            actorPlatformRole = admin.role.name,
            targetUserId = revoked.granteeUserId,
            eventType = "SUPPORT_ACCESS_GRANT_REVOKED",
            metadataJson = objectMapper.writeValueAsString(metadata),
        )
    }

    override fun listByClub(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
    ): List<SupportAccessGrant> = loadGrantPort.loadActiveGrantsByClub(clubId)

    override fun listByGrantee(
        admin: CurrentPlatformAdmin,
        granteeUserId: UUID,
    ): List<SupportAccessGrant> = loadGrantPort.loadActiveGrantsByGrantee(granteeUserId)

    override fun previewCreate(
        admin: PlatformActor,
        command: PreviewSupportGrantCreateCommand,
    ): SupportGrantCommandPreview = previewWorkflow.previewCreate(admin, command)

    override fun previewRevoke(
        admin: PlatformActor,
        grantId: UUID,
        command: PreviewSupportGrantRevokeCommand,
    ): SupportGrantCommandPreview = previewWorkflow.previewRevoke(admin, grantId, command)

    override fun confirmCreate(
        admin: PlatformActor,
        command: ConfirmSupportGrantCreateCommand,
    ): SupportGrantCommandReceipt = confirmationWorkflow.confirmCreate(admin, command)

    override fun confirmRevoke(
        admin: PlatformActor,
        grantId: UUID,
        command: ConfirmSupportGrantRevokeCommand,
    ): SupportGrantCommandReceipt = confirmationWorkflow.confirmRevoke(admin, grantId, command)
}

@Suppress("ktlint:standard:function-expression-body")
internal fun denySupportGrantManagement(): Nothing {
    throw AccessDeniedException("Platform admin role cannot manage support access grants")
}

internal fun rejectGrant(
    error: PlatformAdminError,
    message: String,
): Nothing = throw PlatformAdminException(error, message)

internal const val MAX_GRANT_EXPIRY_HOURS = 24L
internal const val MAX_SUPPORT_NOTE_CODE_POINTS = 500
internal const val SUPPORT_FINGERPRINT_PREFIX_BYTES = 8
internal const val SUPPORT_GRANT_RECEIPT_TYPE = "platform-admin-support-command"
internal const val SUPPORT_CREATE_COMMAND = "support.grant.create"
internal const val SUPPORT_REVOKE_COMMAND = "support.grant.revoke"
internal const val SUPPORT_CLUB_TARGET = "club"
internal const val SUPPORT_GRANT_TARGET = "support-grant"
internal val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9._:-]{8,128}$")
