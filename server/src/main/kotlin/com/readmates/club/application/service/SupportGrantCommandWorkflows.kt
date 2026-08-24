package com.readmates.club.application.service

import com.readmates.club.application.PlatformAdminError
import com.readmates.club.application.model.ConfirmSupportGrantCreateCommand
import com.readmates.club.application.model.ConfirmSupportGrantRevokeCommand
import com.readmates.club.application.model.CreateSupportGrantCanonicalRequest
import com.readmates.club.application.model.PersistSupportGrantOrigin
import com.readmates.club.application.model.PreviewSupportGrantCreateCommand
import com.readmates.club.application.model.PreviewSupportGrantRevokeCommand
import com.readmates.club.application.model.RevokeSupportGrantCanonicalRequest
import com.readmates.club.application.model.StoredSupportGrantCommandPreview
import com.readmates.club.application.model.SupportGrantCommandPreview
import com.readmates.club.application.model.SupportGrantCommandReceipt
import com.readmates.club.application.model.SupportGrantCommandReceiptRecord
import com.readmates.club.application.model.SupportGrantCommandType
import com.readmates.club.application.port.out.AdminSupportGrantLedgerPort
import com.readmates.club.application.port.out.LoadSupportAccessGrantPort
import com.readmates.club.application.port.out.SupportGrantCommandPort
import com.readmates.shared.adminmutation.application.model.AdminCommandClaimResult
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.shared.adminmutation.application.service.AdminCommandIdempotencyService
import com.readmates.shared.adminmutation.application.service.AdminCommandIdentityService
import com.readmates.shared.adminmutation.config.AdminCommandIdempotencyProperties
import com.readmates.shared.security.PlatformActor
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Locale
import java.util.UUID

internal class SupportGrantPreviewWorkflow(
    private val loadGrantPort: LoadSupportAccessGrantPort,
    private val grantLedgerPort: AdminSupportGrantLedgerPort,
    private val commandPort: SupportGrantCommandPort?,
    private val identityService: AdminCommandIdentityService?,
    private val idempotencyProperties: AdminCommandIdempotencyProperties?,
    private val clock: Clock,
    private val policy: SupportGrantCommandPolicy,
) {
    fun previewCreate(
        admin: PlatformActor,
        command: PreviewSupportGrantCreateCommand,
    ): SupportGrantCommandPreview {
        policy.requireManageSupport(admin)
        val normalizedNote = policy.validateCreate(command.expiresAt, command.note)
        if (!grantLedgerPort.isActivePlatformAdmin(command.granteeUserId)) {
            rejectGrant(PlatformAdminError.SUPPORT_TARGET_NOT_ELIGIBLE, "Grantee is not an active platform admin")
        }
        if (!grantLedgerPort.isGrantEligibleClub(command.clubId)) {
            rejectGrant(PlatformAdminError.SUPPORT_TARGET_NOT_FOUND, "Club is not grant eligible")
        }
        val previewId = UUID.randomUUID()
        val request = command.toCanonical(previewId, normalizedNote)
        val digest =
            requiredIdentityService()
                .resolve(policy.createIdentity(admin, command.clubId, previewId.toString()), request)
                .digests.current
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

    fun previewRevoke(
        admin: PlatformActor,
        grantId: UUID,
        command: PreviewSupportGrantRevokeCommand,
    ): SupportGrantCommandPreview {
        policy.requireManageSupport(admin)
        val normalizedNote = policy.validateNote(command.note)
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
        val digest =
            requiredIdentityService()
                .resolve(policy.revokeIdentity(admin, grantId, previewId.toString()), request)
                .digests.current
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

    private fun PreviewSupportGrantCreateCommand.toCanonical(
        previewId: UUID,
        note: String?,
    ) = CreateSupportGrantCanonicalRequest(
        previewId,
        clubId,
        granteeUserId,
        scope,
        expiresAt,
        reasonCategory,
        note,
    )

    private fun requiredCommandPort(): SupportGrantCommandPort =
        requireNotNull(commandPort) { "Support command persistence is unavailable" }

    private fun requiredIdentityService(): AdminCommandIdentityService =
        requireNotNull(identityService) { "Support command identity is unavailable" }

    private fun requiredIdempotencyProperties(): AdminCommandIdempotencyProperties =
        requireNotNull(idempotencyProperties) { "Support command idempotency properties are unavailable" }
}

internal class SupportGrantConfirmationWorkflow(
    private val grantLedgerPort: AdminSupportGrantLedgerPort,
    private val commandPort: SupportGrantCommandPort?,
    private val idempotencyService: AdminCommandIdempotencyService?,
    private val transactionTemplate: TransactionTemplate?,
    private val clock: Clock,
    private val policy: SupportGrantCommandPolicy,
) {
    private val receipts = SupportGrantReceiptWorkflow(commandPort, idempotencyService)

    fun confirmCreate(
        admin: PlatformActor,
        command: ConfirmSupportGrantCreateCommand,
    ): SupportGrantCommandReceipt {
        policy.requireManageSupport(admin)
        policy.requireConfirmation(command.confirmed, command.idempotencyKey)
        val note = policy.validateNote(command.note)
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
        return receipts.toResponse(
            inTransaction {
                when (
                    val claim =
                        requiredIdempotencyService().claim(
                            policy.createIdentity(admin, command.clubId, command.idempotencyKey),
                            request,
                        )
                ) {
                    is AdminCommandClaimResult.Completed ->
                        receipts.replay(claim, admin, SupportGrantCommandType.CREATE, command.clubId)
                    AdminCommandClaimResult.Conflict ->
                        rejectGrant(PlatformAdminError.IDEMPOTENCY_CONFLICT, "Idempotency conflict")
                    AdminCommandClaimResult.InProgress ->
                        rejectGrant(PlatformAdminError.COMMAND_IN_PROGRESS, "Command is in progress")
                    is AdminCommandClaimResult.Claimed -> storeCreate(admin, command, request, claim, note)
                }
            },
        )
    }

    fun confirmRevoke(
        admin: PlatformActor,
        grantId: UUID,
        command: ConfirmSupportGrantRevokeCommand,
    ): SupportGrantCommandReceipt {
        policy.requireManageSupport(admin)
        policy.requireConfirmation(command.confirmed, command.idempotencyKey)
        val note = policy.validateNote(command.note)
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
        return receipts.toResponse(
            inTransaction {
                when (
                    val claim =
                        requiredIdempotencyService().claim(
                            policy.revokeIdentity(admin, grantId, command.idempotencyKey),
                            request,
                        )
                ) {
                    is AdminCommandClaimResult.Completed ->
                        receipts.replay(claim, admin, SupportGrantCommandType.REVOKE, grantId)
                    AdminCommandClaimResult.Conflict ->
                        rejectGrant(PlatformAdminError.IDEMPOTENCY_CONFLICT, "Idempotency conflict")
                    AdminCommandClaimResult.InProgress ->
                        rejectGrant(PlatformAdminError.COMMAND_IN_PROGRESS, "Command is in progress")
                    is AdminCommandClaimResult.Claimed -> storeRevoke(admin, grantId, command, request, claim)
                }
            },
        )
    }

    private fun storeCreate(
        admin: PlatformActor,
        command: ConfirmSupportGrantCreateCommand,
        request: CreateSupportGrantCanonicalRequest,
        claim: AdminCommandClaimResult.Claimed,
        normalizedNote: String?,
    ): SupportGrantCommandReceiptRecord {
        val preview =
            policy.requirePreview(
                admin,
                SupportGrantCommandType.CREATE,
                command.previewId,
                command.idempotencyKey,
                command.clubId,
                request,
            )
        policy.validateCreate(command.expiresAt, normalizedNote)
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
        return receipts.persistAndComplete(
            preview,
            claim,
            receipts.receipt(preview, grantId, admin, claim.currentDigest, "ABSENT", "ACTIVE", now),
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
            policy.requirePreview(
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
        return receipts.persistAndComplete(
            preview,
            claim,
            receipts.receipt(preview, grantId, admin, claim.currentDigest, "ACTIVE", "REVOKED", now),
            admin,
        )
    }

    private fun <T> inTransaction(action: () -> T): T =
        requireNotNull(transactionTemplate) { "Support command transaction is unavailable" }.execute { action() }
            ?: error("Support command transaction returned null")

    private fun requiredCommandPort(): SupportGrantCommandPort =
        requireNotNull(commandPort) { "Support command persistence is unavailable" }

    private fun requiredIdempotencyService(): AdminCommandIdempotencyService =
        requireNotNull(idempotencyService) { "Support command idempotency is unavailable" }
}

private class SupportGrantReceiptWorkflow(
    private val commandPort: SupportGrantCommandPort?,
    private val idempotencyService: AdminCommandIdempotencyService?,
) {
    fun persistAndComplete(
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

    fun replay(
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

    fun receipt(
        preview: StoredSupportGrantCommandPreview,
        grantId: UUID,
        actor: PlatformActor,
        digest: AdminCommandDigest,
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

    fun toResponse(record: SupportGrantCommandReceiptRecord) =
        SupportGrantCommandReceipt(
            record.receiptId,
            record.previewId,
            record.commandType,
            record.grantId,
            record.clubId,
            record.scope,
            record.grantExpiresAt,
            record.reasonCategory,
            record.notePresent,
            record.beforeStatus,
            record.afterStatus,
            record.outcome,
            record.createdAt,
        )

    private fun requiredCommandPort(): SupportGrantCommandPort =
        requireNotNull(commandPort) { "Support command persistence is unavailable" }

    private fun requiredIdempotencyService(): AdminCommandIdempotencyService =
        requireNotNull(idempotencyService) { "Support command idempotency is unavailable" }
}

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
        requestHmac.take(SUPPORT_FINGERPRINT_PREFIX_BYTES).joinToString("") { "%02x".format(Locale.ROOT, it) },
    )
