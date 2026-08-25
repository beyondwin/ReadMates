package com.readmates.admin.takedown.application.model

import com.readmates.shared.security.PlatformActor
import java.time.Instant
import java.util.UUID

data class PublicTakedownActor(
    val authority: PlatformActor,
    val roleSnapshot: String,
)

data class PublicTakedownTarget(
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val targetGeneration: Long,
    val currentSurfaces: Set<String>,
)

data class PublicTakedownPreview(
    val previewId: UUID,
    val expiresAt: Instant,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val targetGeneration: Long,
    val currentSurfaces: Set<String>,
)

data class ConfirmPublicTakedownCommand(
    val previewId: UUID,
    val reasonCategory: String,
    val reason: String,
    val idempotencyKey: String,
)

data class StoredPublicTakedownPreview(
    val previewId: UUID,
    val actorAdminId: UUID,
    val roleSnapshot: String,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val targetGeneration: Long,
    val bindingDigestKeyVersion: Int,
    val bindingHmac: ByteArray,
    val expiresAt: Instant,
)

data class PreparedPublicTakedownConfirm(
    val preview: StoredPublicTakedownPreview,
    val idempotencyKeyHmac: ByteArray,
    val requestHmac: ByteArray,
    val canonicalSchemaVersion: Int,
    val digestKeyVersion: Int,
    val reasonCategory: String,
)

data class PublicTakedownReceipt(
    val receiptId: UUID,
    val convergenceId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val committedGeneration: Long,
    val committedClubGeneration: Long,
    val originResult: String = "DENIED",
    val reasonCategory: String,
    val createdAt: Instant,
)

enum class PublicTakedownError {
    ACTIVATION_NOT_VERIFIED,
    PERMISSION_DENIED,
    TARGET_NOT_FOUND,
    TARGET_NOT_PUBLIC,
    INVALID_REQUEST,
    PREVIEW_NOT_FOUND,
    PREVIEW_EXPIRED,
    PREVIEW_TARGET_MISMATCH,
    GENERATION_MISMATCH,
    IDEMPOTENCY_CONFLICT,
    DIGEST_KEY_UNAVAILABLE,
}

class PublicTakedownException(
    val error: PublicTakedownError,
) : RuntimeException(error.name)
