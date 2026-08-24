package com.readmates.admin.takedown.application.model

import java.time.Instant
import java.util.UUID

const val PUBLIC_TAKEDOWN_OPERATION = "EMERGENCY_PUBLIC_TAKEDOWN"
const val PUBLIC_TAKEDOWN_SCHEMA_VERSION = 1
const val PUBLIC_TAKEDOWN_ACTIVATION_BOUNDARY = "PROTECTED_CACHE_SAFETY_EVIDENCE_REQUIRED"
const val PUBLIC_TAKEDOWN_REMOTE_COPY_LIMITATION =
    "이미 표시되었거나 저장된 사본과 연결이 끊긴 오프라인 사본은 원격으로 삭제할 수 없습니다."

data class PreviewPublicTakedownCommand(
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
)

data class ConfirmPublicTakedownCommand(
    val previewId: UUID,
    val reasonCategory: PublicTakedownReasonCategory,
    val reason: String,
    val idempotencyKey: String,
)

enum class PublicTakedownReasonCategory {
    PRIVATE_DATA,
    LEGAL_REQUEST,
    SECURITY_INCIDENT,
    PUBLIC_SAFETY,
    ;

    companion object {
        fun fromWire(value: String): PublicTakedownReasonCategory? = entries.firstOrNull { it.name == value.trim() }
    }
}

data class PublicTakedownTarget(
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val generation: Long,
    val originReadable: Boolean,
    val currentSurfaces: Set<String>,
)

data class PublicTakedownPreview(
    val previewId: UUID,
    val actorAdminId: UUID,
    val actorRoleSnapshot: String,
    val expiresAt: Instant,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val targetGeneration: Long,
    val currentSurfaces: Set<String>,
    val confirmEnabled: Boolean,
    val activationBoundary: String = PUBLIC_TAKEDOWN_ACTIVATION_BOUNDARY,
    val remoteCopyLimitation: String = PUBLIC_TAKEDOWN_REMOTE_COPY_LIMITATION,
)

data class PublicTakedownReceipt(
    val receiptId: UUID,
    val convergenceId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val committedGeneration: Long,
    val originResult: String,
    val reasonCategory: PublicTakedownReasonCategory,
    val reasonRedacted: Boolean,
    val createdAt: Instant,
    val bffEvictionOutcome: String = "NOT_STARTED",
    val cdnPurgeOutcome: String = "QUEUED",
    val browserRevalidationOutcome: String = "BOUNDED_BY_CACHE_POLICY",
    val remoteCopyLimitation: String = PUBLIC_TAKEDOWN_REMOTE_COPY_LIMITATION,
)

data class PublicTakedownIdempotencyScope(
    val actorAdminId: UUID,
    val clubId: UUID,
    val publicationId: UUID,
    val idempotencyKey: String,
)

data class PublicTakedownRequestIdentity(
    val requestHmac: ByteArray,
    val canonicalSchemaVersion: Int,
    val digestKeyVersion: Int,
    val replayHmacs: Map<Int, ByteArray>,
)

enum class PublicTakedownError {
    PERMISSION_DENIED,
    TARGET_NOT_FOUND,
    TARGET_NOT_PUBLIC,
    PREVIEW_NOT_FOUND,
    PREVIEW_EXPIRED,
    PREVIEW_ACTOR_MISMATCH,
    TARGET_MISMATCH,
    GENERATION_MISMATCH,
    SURFACES_MISMATCH,
    INVALID_REASON_CATEGORY,
    INVALID_REASON,
    INVALID_IDEMPOTENCY_KEY,
    IDEMPOTENCY_KEY_REUSED,
    TAKEDOWN_CONFIRM_DISABLED,
}

class PublicTakedownException(
    val error: PublicTakedownError,
) : RuntimeException(error.name)
