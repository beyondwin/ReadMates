package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.CreateSupportAccessGrantCommand
import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.club.application.port.`in`.CheckSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.CreateSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.ListSupportAccessGrantsUseCase
import com.readmates.club.application.port.`in`.RevokeSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.SupportMemberSynthesis
import com.readmates.club.application.port.out.AdminSupportGrantLedgerPort
import com.readmates.club.application.port.out.CreateSupportAccessGrantPort
import com.readmates.club.application.port.out.LoadSupportAccessGrantPort
import com.readmates.club.application.port.out.RevokeSupportAccessGrantPort
import com.readmates.club.application.port.out.WritePlatformAuditEventPort
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Service
import tools.jackson.databind.ObjectMapper
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
) : CheckSupportAccessGrantUseCase,
    CreateSupportAccessGrantUseCase,
    RevokeSupportAccessGrantUseCase,
    ListSupportAccessGrantsUseCase {
    override fun synthesizeHostCurrentMember(
        userId: UUID,
        email: String,
        clubId: UUID,
        clubSlug: String,
        clubName: String,
    ): SupportMemberSynthesis? {
        val grant = loadGrantPort.loadActiveGrantByGranteeAndClub(userId, clubId) ?: return null
        return SupportMemberSynthesis(
            membershipProxyId = grant.id,
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
}

@Suppress("ktlint:standard:function-expression-body")
private fun denySupportGrantManagement(): Nothing {
    throw AccessDeniedException("Platform admin role cannot manage support access grants")
}

private fun rejectGrant(
    error: PlatformAdminError,
    message: String,
): Nothing = throw PlatformAdminException(error, message)

private const val MAX_GRANT_EXPIRY_HOURS = 24L
