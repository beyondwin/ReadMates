package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.PlatformAdminException
import com.readmates.club.application.model.ConfirmSupportGrantCreateCommand
import com.readmates.club.application.model.ConfirmSupportGrantRevokeCommand
import com.readmates.club.application.model.CreateSupportAccessGrantCommand
import com.readmates.club.application.model.CreateSupportGrantCanonicalRequest
import com.readmates.club.application.model.PersistSupportGrantOrigin
import com.readmates.club.application.model.PreviewSupportGrantCreateCommand
import com.readmates.club.application.model.PreviewSupportGrantRevokeCommand
import com.readmates.club.application.model.RevokeSupportGrantCanonicalRequest
import com.readmates.club.application.model.StoredSupportGrantCommandPreview
import com.readmates.club.application.model.SupportAccessGrant
import com.readmates.club.application.model.SupportGrantCommandPreview
import com.readmates.club.application.model.SupportGrantCommandReceipt
import com.readmates.club.application.model.SupportGrantCommandReceiptRecord
import com.readmates.club.application.model.SupportGrantCommandType
import com.readmates.club.application.model.SupportGrantReasonCategory
import com.readmates.club.application.model.normalizeSupportGrantNote
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
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.PlatformAdminCommandIdentity
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import com.readmates.shared.security.PlatformActor
import com.readmates.shared.security.PlatformCapability
import com.readmates.shared.security.RequestIdentityHmac
import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import tools.jackson.databind.ObjectMapper
import java.time.Clock
import java.time.Instant
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.Locale
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
    ): SupportGrantCommandPreview {
        requireManageSupport(admin)
        val normalizedNote = validateCreate(command.expiresAt, command.note)
        if (!grantLedgerPort.isActivePlatformAdmin(command.granteeUserId)) {
            rejectGrant(PlatformAdminError.SUPPORT_TARGET_NOT_ELIGIBLE, "Grantee is not an active platform admin")
        }
        if (!grantLedgerPort.isGrantEligibleClub(command.clubId)) {
            rejectGrant(PlatformAdminError.SUPPORT_TARGET_NOT_FOUND, "Club is not grant eligible")
        }
        val previewId = UUID.randomUUID()
        val request = command.toCanonical(previewId, normalizedNote)
        val digest = requiredIdentityService().resolve(createIdentity(admin, command.clubId, previewId.toString()), request).digests.current
        val now = clock.instant()
        val preview =
            StoredSupportGrantCommandPreview(
                previewId = previewId,
                commandType = SupportGrantCommandType.CREATE,
                actorAdminId = admin.adminId,
                actorRoleSnapshot = admin.role.name,
                actorCapabilities = admin.capabilitySnapshots(),
                grantId = null,
                clubId = command.clubId,
                createSlotId = UUID.randomUUID(),
                scope = command.scope,
                grantExpiresAt = command.expiresAt,
                reasonCategory = command.reasonCategory,
                notePresent = normalizedNote != null,
                canonicalSchemaVersion = digest.schemaVersion,
                digestKeyVersion = digest.digestKeyVersion,
                requestHmac = digest.requestHmac,
                impactCodes = listOf("SUPPORT_ACCESS_WILL_BECOME_ACTIVE"),
                expiresAt = now.plus(requiredIdempotencyProperties().previewTtl),
                consumedAt = null,
                consumedReceiptId = null,
                createdAt = now,
            )
        requiredCommandPort().savePreview(preview)
        return preview.toResponse()
    }

    override fun previewRevoke(
        admin: PlatformActor,
        grantId: UUID,
        command: PreviewSupportGrantRevokeCommand,
    ): SupportGrantCommandPreview {
        requireManageSupport(admin)
        val normalizedNote = validateNote(command.note)
        val grant =
            loadGrantPort.loadActiveGrantById(grantId)
                ?: rejectGrant(PlatformAdminError.GRANT_NOT_FOUND, "Support access grant not found")
        val previewId = UUID.randomUUID()
        val request =
            RevokeSupportGrantCanonicalRequest(
                previewId,
                grant.id,
                grant.clubId,
                grant.scope,
                grant.expiresAt,
                command.reasonCategory,
                normalizedNote,
            )
        val digest = requiredIdentityService().resolve(revokeIdentity(admin, grantId, previewId.toString()), request).digests.current
        val now = clock.instant()
        val preview =
            StoredSupportGrantCommandPreview(
                previewId,
                SupportGrantCommandType.REVOKE,
                admin.adminId,
                admin.role.name,
                admin.capabilitySnapshots(),
                grant.id,
                grant.clubId,
                null,
                grant.scope,
                grant.expiresAt,
                command.reasonCategory,
                normalizedNote != null,
                digest.schemaVersion,
                digest.digestKeyVersion,
                digest.requestHmac,
                listOf("SUPPORT_ACCESS_WILL_BE_REVOKED"),
                now.plus(requiredIdempotencyProperties().previewTtl),
                null,
                null,
                now,
            )
        requiredCommandPort().savePreview(preview)
        return preview.toResponse()
    }

    override fun confirmCreate(
        admin: PlatformActor,
        command: ConfirmSupportGrantCreateCommand,
    ): SupportGrantCommandReceipt {
        requireManageSupport(admin)
        requireConfirmation(command.confirmed, command.idempotencyKey)
        val note = validateNote(command.note)
        val request =
            CreateSupportGrantCanonicalRequest(
                command.previewId,
                command.clubId,
                command.granteeUserId,
                command.scope,
                command.expiresAt,
                command.reasonCategory,
                note,
            )
        return translateDuplicate {
            inTransaction {
                when (
                    val claim =
                        requiredIdempotencyService().claim(
                            createIdentity(admin, command.clubId, command.idempotencyKey),
                            request,
                        )
                ) {
                    is AdminCommandClaimResult.Completed -> replay(claim, admin, SupportGrantCommandType.CREATE, command.clubId)
                    AdminCommandClaimResult.Conflict -> rejectGrant(PlatformAdminError.IDEMPOTENCY_CONFLICT, "Idempotency conflict")
                    AdminCommandClaimResult.InProgress -> rejectGrant(PlatformAdminError.COMMAND_IN_PROGRESS, "Command is in progress")
                    is AdminCommandClaimResult.Claimed -> storeCreate(admin, command, request, claim, note)
                }
            }.toResponse()
        }
    }

    override fun confirmRevoke(
        admin: PlatformActor,
        grantId: UUID,
        command: ConfirmSupportGrantRevokeCommand,
    ): SupportGrantCommandReceipt {
        requireManageSupport(admin)
        requireConfirmation(command.confirmed, command.idempotencyKey)
        val note = validateNote(command.note)
        val request =
            RevokeSupportGrantCanonicalRequest(
                command.previewId,
                grantId,
                command.clubId,
                command.scope,
                command.expiresAt,
                command.reasonCategory,
                note,
            )
        return inTransaction {
            when (
                val claim =
                    requiredIdempotencyService().claim(
                        revokeIdentity(admin, grantId, command.idempotencyKey),
                        request,
                    )
            ) {
                is AdminCommandClaimResult.Completed -> replay(claim, admin, SupportGrantCommandType.REVOKE, grantId)
                AdminCommandClaimResult.Conflict -> rejectGrant(PlatformAdminError.IDEMPOTENCY_CONFLICT, "Idempotency conflict")
                AdminCommandClaimResult.InProgress -> rejectGrant(PlatformAdminError.COMMAND_IN_PROGRESS, "Command is in progress")
                is AdminCommandClaimResult.Claimed -> storeRevoke(admin, grantId, command, request, claim)
            }
        }.toResponse()
    }

    private fun storeCreate(
        admin: PlatformActor,
        command: ConfirmSupportGrantCreateCommand,
        request: CreateSupportGrantCanonicalRequest,
        claim: AdminCommandClaimResult.Claimed,
        normalizedNote: String?,
    ): SupportGrantCommandReceiptRecord {
        val preview =
            requirePreview(
                admin,
                SupportGrantCommandType.CREATE,
                command.previewId,
                command.idempotencyKey,
                command.clubId,
                request,
            )
        validateCreate(command.expiresAt, normalizedNote)
        val now = clock.instant()
        val nowOffset = now.atOffset(ZoneOffset.UTC)
        if (!grantLedgerPort.isActivePlatformAdmin(command.granteeUserId)) {
            rejectGrant(PlatformAdminError.SUPPORT_TARGET_NOT_ELIGIBLE, "Grantee is not an active platform admin")
        }
        if (!grantLedgerPort.isGrantEligibleClub(command.clubId)) {
            rejectGrant(PlatformAdminError.SUPPORT_TARGET_NOT_FOUND, "Club is not grant eligible")
        }
        if (requiredCommandPort().lockCreateIdentity(command.clubId, command.granteeUserId, command.scope, nowOffset)) {
            rejectGrant(PlatformAdminError.GRANT_DUPLICATE_ACTIVE, "Active grant already exists")
        }
        val grantId = UUID.randomUUID()
        requiredCommandPort().createCanonicalGrant(
            grantId,
            command.clubId,
            admin.adminId,
            command.granteeUserId,
            command.scope,
            command.reasonCategory,
            normalizedNote != null,
            command.expiresAt,
            nowOffset,
        )
        return persistAndComplete(
            preview,
            claim,
            receipt(
                preview = preview,
                grantId = grantId,
                actor = admin,
                digest = claim.currentDigest,
                before = "ABSENT",
                after = "ACTIVE",
                now = now,
            ),
            admin,
        )
    }

    private fun storeRevoke(
        admin: PlatformActor,
        grantId: UUID,
        command: ConfirmSupportGrantRevokeCommand,
        request: RevokeSupportGrantCanonicalRequest,
        claim: AdminCommandClaimResult.Claimed,
    ): SupportGrantCommandReceiptRecord {
        val preview =
            requirePreview(
                admin,
                SupportGrantCommandType.REVOKE,
                command.previewId,
                command.idempotencyKey,
                grantId,
                request,
            )
        val now = clock.instant()
        val nowOffset = now.atOffset(ZoneOffset.UTC)
        val grant =
            requiredCommandPort().lockActiveGrant(grantId, nowOffset)
                ?: rejectGrant(PlatformAdminError.GRANT_NOT_FOUND, "Support access grant not found")
        if (grant.clubId != command.clubId ||
            grant.scope != command.scope ||
            grant.expiresAt.toInstant() != command.expiresAt.toInstant()
        ) {
            rejectGrant(PlatformAdminError.PREVIEW_MISMATCH, "Support grant changed after preview")
        }
        if (!requiredCommandPort().revokeCanonicalGrant(grantId, nowOffset)) {
            rejectGrant(PlatformAdminError.GRANT_NOT_FOUND, "Support access grant not found")
        }
        return persistAndComplete(
            preview,
            claim,
            receipt(preview, grantId, admin, claim.currentDigest, "ACTIVE", "REVOKED", now),
            admin,
        )
    }

    private fun requirePreview(
        admin: PlatformActor,
        type: SupportGrantCommandType,
        previewId: UUID,
        idempotencyKey: String,
        targetId: UUID,
        request: com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest,
    ): StoredSupportGrantCommandPreview {
        val preview =
            requiredCommandPort().loadPreview(previewId)
                ?: rejectGrant(PlatformAdminError.PREVIEW_NOT_FOUND, "Support command preview not found")
        if (preview.commandType != type || preview.actorAdminId != admin.adminId ||
            preview.actorRoleSnapshot != admin.role.name || preview.actorCapabilities != admin.capabilitySnapshots() ||
            (type == SupportGrantCommandType.CREATE && preview.clubId != targetId) ||
            (type == SupportGrantCommandType.REVOKE && preview.grantId != targetId)
        ) {
            rejectGrant(PlatformAdminError.PREVIEW_MISMATCH, "Support command preview does not match")
        }
        if (preview.consumedAt != null || preview.consumedReceiptId != null) {
            rejectGrant(PlatformAdminError.PREVIEW_CONSUMED, "Support command preview was consumed")
        }
        if (!preview.expiresAt.isAfter(clock.instant())) {
            rejectGrant(PlatformAdminError.PREVIEW_EXPIRED, "Support command preview expired")
        }
        val identity =
            if (type == SupportGrantCommandType.CREATE) {
                createIdentity(admin, preview.clubId, idempotencyKey)
            } else {
                revokeIdentity(admin, requireNotNull(preview.grantId), idempotencyKey)
            }
        val candidate =
            requiredIdentityService()
                .resolve(identity, request)
                .digests
                .lookupCandidates
                .firstOrNull { it.digestKeyVersion == preview.digestKeyVersion }
                ?: rejectGrant(PlatformAdminError.PREVIEW_MISMATCH, "Support command preview digest key is unavailable")
        if (preview.canonicalSchemaVersion != candidate.schemaVersion ||
            !RequestIdentityHmac.equal(preview.requestHmac, candidate.requestHmac)
        ) {
            rejectGrant(PlatformAdminError.PREVIEW_MISMATCH, "Support command preview digest does not match")
        }
        return preview
    }

    private fun persistAndComplete(
        preview: StoredSupportGrantCommandPreview,
        claim: AdminCommandClaimResult.Claimed,
        receipt: SupportGrantCommandReceiptRecord,
        admin: PlatformActor,
    ): SupportGrantCommandReceiptRecord {
        if (!requiredCommandPort().storeOrigin(PersistSupportGrantOrigin(preview, receipt, admin))) {
            rejectGrant(PlatformAdminError.PREVIEW_CONSUMED, "Support command preview was consumed")
        }
        if (!requiredIdempotencyService().complete(
                claim.claimId,
                claim.claimToken,
                SUPPORT_GRANT_RECEIPT_TYPE,
                receipt.receiptId.toString(),
            )
        ) {
            rejectGrant(PlatformAdminError.COMMAND_IN_PROGRESS, "Support command completion was lost")
        }
        return receipt
    }

    private fun replay(
        claim: AdminCommandClaimResult.Completed,
        admin: PlatformActor,
        type: SupportGrantCommandType,
        targetId: UUID,
    ): SupportGrantCommandReceiptRecord {
        if (claim.receiptType != SUPPORT_GRANT_RECEIPT_TYPE) {
            rejectGrant(PlatformAdminError.PREVIEW_MISMATCH, "Receipt type does not match support command")
        }
        val receiptId =
            runCatching { UUID.fromString(claim.receiptId) }.getOrNull()
                ?: rejectGrant(PlatformAdminError.PREVIEW_MISMATCH, "Receipt identity is invalid")
        return requiredCommandPort().loadReceipt(receiptId, admin.adminId, type.name, targetId)
            ?: rejectGrant(PlatformAdminError.PREVIEW_MISMATCH, "Support receipt is unavailable")
    }

    private fun receipt(
        preview: StoredSupportGrantCommandPreview,
        grantId: UUID,
        actor: PlatformActor,
        digest: com.readmates.shared.adminmutation.application.model.AdminCommandDigest,
        before: String,
        after: String,
        now: Instant,
    ) = SupportGrantCommandReceiptRecord(
        receiptId = UUID.randomUUID(),
        previewId = preview.previewId,
        commandType = preview.commandType,
        actorAdminId = actor.adminId,
        actorRoleSnapshot = actor.role.name,
        actorCapabilities = actor.capabilitySnapshots(),
        grantId = grantId,
        clubId = preview.clubId,
        scope = preview.scope,
        grantExpiresAt = preview.grantExpiresAt,
        reasonCategory = preview.reasonCategory,
        notePresent = preview.notePresent,
        beforeStatus = before,
        afterStatus = after,
        outcome = "SUCCEEDED",
        digest = digest,
        auditEventId = UUID.randomUUID(),
        createdAt = now,
    )

    private fun validateCreate(
        expiresAt: OffsetDateTime,
        note: String?,
    ): String? {
        val now = OffsetDateTime.now(clock)
        if (expiresAt <= now) rejectGrant(PlatformAdminError.GRANT_EXPIRY_IN_PAST, "Grant expiry must be in the future")
        if (expiresAt > now.plusHours(MAX_GRANT_EXPIRY_HOURS)) {
            rejectGrant(PlatformAdminError.GRANT_EXPIRY_TOO_LONG, "Grant expiry must be within 24 hours")
        }
        return validateNote(note)
    }

    private fun validateNote(note: String?): String? {
        val normalized = normalizeSupportGrantNote(note)
        if (normalized != null && normalized.codePointCount(0, normalized.length) > MAX_SUPPORT_NOTE_CODE_POINTS) {
            rejectGrant(PlatformAdminError.GRANT_REASON_REQUIRED, "Support note is too long")
        }
        return normalized
    }

    private fun requireConfirmation(
        confirmed: Boolean,
        idempotencyKey: String,
    ) {
        if (!confirmed) rejectGrant(PlatformAdminError.CONFIRMATION_REQUIRED, "Explicit confirmation is required")
        if (!IDEMPOTENCY_KEY.matches(idempotencyKey)) {
            rejectGrant(PlatformAdminError.INVALID_IDEMPOTENCY_KEY, "Idempotency key is invalid")
        }
    }

    private fun requireManageSupport(admin: PlatformActor) {
        if (!admin.can(PlatformCapability.MANAGE_SUPPORT_ACCESS)) denySupportGrantManagement()
    }

    private fun createIdentity(
        admin: PlatformActor,
        clubId: UUID,
        idempotencyKey: String,
    ) = PlatformAdminCommandIdentity(admin.adminId, SUPPORT_CREATE_COMMAND, SUPPORT_CLUB_TARGET, clubId.toString(), idempotencyKey)

    private fun revokeIdentity(
        admin: PlatformActor,
        grantId: UUID,
        idempotencyKey: String,
    ) = PlatformAdminCommandIdentity(admin.adminId, SUPPORT_REVOKE_COMMAND, SUPPORT_GRANT_TARGET, grantId.toString(), idempotencyKey)

    private fun PreviewSupportGrantCreateCommand.toCanonical(
        previewId: UUID,
        note: String?,
    ) = CreateSupportGrantCanonicalRequest(previewId, clubId, granteeUserId, scope, expiresAt, reasonCategory, note)

    private fun StoredSupportGrantCommandPreview.toResponse() =
        SupportGrantCommandPreview(
            previewId,
            commandType,
            grantId,
            clubId,
            scope,
            grantExpiresAt,
            reasonCategory,
            notePresent,
            impactCodes,
            expiresAt,
            requestHmac.take(FINGERPRINT_PREFIX_BYTES).joinToString("") { "%02x".format(Locale.ROOT, it) },
        )

    private fun SupportGrantCommandReceiptRecord.toResponse() =
        SupportGrantCommandReceipt(
            receiptId,
            previewId,
            commandType,
            grantId,
            clubId,
            scope,
            grantExpiresAt,
            reasonCategory,
            notePresent,
            beforeStatus,
            afterStatus,
            outcome,
            createdAt,
        )

    private fun PlatformActor.capabilitySnapshots(): List<String> = capabilities.map { it.name }.sorted()

    private fun <T> inTransaction(action: () -> T): T =
        requireNotNull(transactionTemplate) { "Support command transaction is unavailable" }.execute { action() }
            ?: error("Support command transaction returned null")

    private fun <T> translateDuplicate(action: () -> T): T =
        try {
            action()
        } catch (error: DuplicateKeyException) {
            if (error.mostSpecificCause.message?.contains(SUPPORT_ACTIVE_SLOT_UNIQUE_KEY) == true) {
                rejectGrant(PlatformAdminError.GRANT_DUPLICATE_ACTIVE, "Active support grant already exists")
            }
            throw error
        }

    private fun requiredCommandPort() = requireNotNull(commandPort) { "Support command persistence is unavailable" }

    private fun requiredIdentityService() = requireNotNull(identityService) { "Support command identity is unavailable" }

    private fun requiredIdempotencyService() = requireNotNull(idempotencyService) { "Support command idempotency is unavailable" }

    private fun requiredIdempotencyProperties() =
        requireNotNull(idempotencyProperties) { "Support command idempotency properties are unavailable" }
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
private const val MAX_SUPPORT_NOTE_CODE_POINTS = 500
private const val FINGERPRINT_PREFIX_BYTES = 8
private const val SUPPORT_GRANT_RECEIPT_TYPE = "platform-admin-support-command"
private const val SUPPORT_CREATE_COMMAND = "support.grant.create"
private const val SUPPORT_REVOKE_COMMAND = "support.grant.revoke"
private const val SUPPORT_CLUB_TARGET = "club"
private const val SUPPORT_GRANT_TARGET = "support-grant"
private const val SUPPORT_ACTIVE_SLOT_UNIQUE_KEY = "support_access_grants_active_slot_uk"
private val IDEMPOTENCY_KEY = Regex("^[A-Za-z0-9._:-]{8,128}$")
