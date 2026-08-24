package com.readmates.club.application.model

import com.readmates.club.domain.SupportAccessGrantScope
import com.readmates.shared.adminmutation.application.model.AdminCommandDigest
import com.readmates.shared.adminmutation.application.model.CanonicalAdminCommandRequest
import com.readmates.shared.security.PlatformActor
import java.text.Normalizer
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID

data class CreateSupportAccessGrantCommand(
    val clubId: UUID,
    val granteeUserId: UUID,
    val scope: SupportAccessGrantScope,
    val reason: String,
    val expiresAt: OffsetDateTime,
)

data class SupportAccessGrant(
    val id: UUID,
    val clubId: UUID,
    val grantedByUserId: UUID,
    val granteeUserId: UUID,
    val scope: SupportAccessGrantScope,
    val reason: String,
    val expiresAt: OffsetDateTime,
    val revokedAt: OffsetDateTime?,
    val createdAt: OffsetDateTime,
)

enum class SupportGrantReasonCategory {
    INCIDENT_INVESTIGATION,
    MEMBER_ASSISTANCE,
    DATA_CORRECTION,
    SECURITY_REVIEW,
}

enum class SupportGrantCommandType { CREATE, REVOKE }

data class PreviewSupportGrantCreateCommand(
    val clubId: UUID,
    val granteeUserId: UUID,
    val scope: SupportAccessGrantScope,
    val expiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val note: String?,
)

data class ConfirmSupportGrantCreateCommand(
    val previewId: UUID,
    val idempotencyKey: String,
    val clubId: UUID,
    val granteeUserId: UUID,
    val scope: SupportAccessGrantScope,
    val expiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val note: String?,
    val confirmed: Boolean,
)

data class PreviewSupportGrantRevokeCommand(
    val reasonCategory: SupportGrantReasonCategory,
    val note: String?,
)

data class ConfirmSupportGrantRevokeCommand(
    val previewId: UUID,
    val idempotencyKey: String,
    val clubId: UUID,
    val scope: SupportAccessGrantScope,
    val expiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val note: String?,
    val confirmed: Boolean,
)

data class SupportGrantCommandPreview(
    val previewId: UUID,
    val commandType: SupportGrantCommandType,
    val grantId: UUID?,
    val clubId: UUID,
    val scope: SupportAccessGrantScope,
    val grantExpiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val notePresent: Boolean,
    val impactCodes: List<String>,
    val expiresAt: Instant,
    val fingerprintPrefix: String,
)

data class SupportGrantCommandReceipt(
    val receiptId: UUID,
    val previewId: UUID,
    val commandType: SupportGrantCommandType,
    val grantId: UUID,
    val clubId: UUID,
    val scope: SupportAccessGrantScope,
    val grantExpiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val notePresent: Boolean,
    val beforeStatus: String,
    val afterStatus: String,
    val outcome: String,
    val createdAt: Instant,
)

data class StoredSupportGrantCommandPreview(
    val previewId: UUID,
    val commandType: SupportGrantCommandType,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val grantId: UUID?,
    val clubId: UUID,
    val createSlotId: UUID?,
    val scope: SupportAccessGrantScope,
    val grantExpiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val notePresent: Boolean,
    val canonicalSchemaVersion: String,
    val digestKeyVersion: Int,
    val requestHmac: ByteArray,
    val impactCodes: List<String>,
    val expiresAt: Instant,
    val consumedAt: Instant?,
    val consumedReceiptId: UUID?,
    val createdAt: Instant,
)

data class SupportGrantCommandReceiptRecord(
    val receiptId: UUID,
    val previewId: UUID,
    val commandType: SupportGrantCommandType,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val actorCapabilities: List<String>,
    val grantId: UUID,
    val clubId: UUID,
    val scope: SupportAccessGrantScope,
    val grantExpiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val notePresent: Boolean,
    val beforeStatus: String,
    val afterStatus: String,
    val outcome: String,
    val digest: AdminCommandDigest,
    val auditEventId: UUID,
    val createdAt: Instant,
)

data class PersistSupportGrantOrigin(
    val preview: StoredSupportGrantCommandPreview,
    val receipt: SupportGrantCommandReceiptRecord,
    val actor: PlatformActor,
)

data class CreateSupportGrantCanonicalRequest(
    val previewId: UUID,
    val clubId: UUID,
    val granteeUserId: UUID,
    val scope: SupportAccessGrantScope,
    val expiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val note: String?,
) : CanonicalAdminCommandRequest {
    override val schemaVersion: String = SUPPORT_GRANT_COMMAND_SCHEMA_VERSION

    override fun canonicalFields(): List<Pair<String, String>> =
        listOf(
            "previewId" to previewId.toString(),
            "clubId" to clubId.toString(),
            "granteeUserId" to granteeUserId.toString(),
            "scope" to scope.name,
            "expiresAt" to expiresAt.toInstant().toString(),
            "reasonCategory" to reasonCategory.name,
            "notePresent" to (note != null).toString(),
            "note" to (note ?: ""),
        )
}

data class RevokeSupportGrantCanonicalRequest(
    val previewId: UUID,
    val grantId: UUID,
    val clubId: UUID,
    val scope: SupportAccessGrantScope,
    val expiresAt: OffsetDateTime,
    val reasonCategory: SupportGrantReasonCategory,
    val note: String?,
) : CanonicalAdminCommandRequest {
    override val schemaVersion: String = SUPPORT_GRANT_COMMAND_SCHEMA_VERSION

    override fun canonicalFields(): List<Pair<String, String>> =
        listOf(
            "previewId" to previewId.toString(),
            "grantId" to grantId.toString(),
            "clubId" to clubId.toString(),
            "scope" to scope.name,
            "expiresAt" to expiresAt.toInstant().toString(),
            "reasonCategory" to reasonCategory.name,
            "notePresent" to (note != null).toString(),
            "note" to (note ?: ""),
        )
}

fun normalizeSupportGrantNote(note: String?): String? {
    val normalized = note?.let { Normalizer.normalize(it, Normalizer.Form.NFC) }?.trim()
    return normalized?.takeIf(String::isNotEmpty)
}

const val SUPPORT_GRANT_COMMAND_SCHEMA_VERSION = "support-grant-command-v1"
