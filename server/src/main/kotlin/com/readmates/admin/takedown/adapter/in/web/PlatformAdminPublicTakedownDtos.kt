@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.takedown.adapter.`in`.web

import com.readmates.admin.takedown.application.model.ConfirmPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PreviewPublicTakedownCommand
import com.readmates.admin.takedown.application.model.PublicTakedownError
import com.readmates.admin.takedown.application.model.PublicTakedownException
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReasonCategory
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import java.time.Instant
import java.util.UUID

data class PublicTakedownPreviewRequest(
    val clubId: UUID?,
    val sessionId: UUID?,
    val publicationId: UUID?,
) {
    fun toCommand(): PreviewPublicTakedownCommand =
        PreviewPublicTakedownCommand(
            clubId = clubId ?: throw InvalidPublicTakedownRequestException(),
            sessionId = sessionId ?: throw InvalidPublicTakedownRequestException(),
            publicationId = publicationId ?: throw InvalidPublicTakedownRequestException(),
        )
}

data class PublicTakedownConfirmRequest(
    val previewId: UUID?,
    val reasonCategory: String?,
    val reason: String?,
    val idempotencyKey: String?,
) {
    fun toCommand(): ConfirmPublicTakedownCommand =
        ConfirmPublicTakedownCommand(
            previewId = previewId ?: throw InvalidPublicTakedownRequestException(),
            reasonCategory =
                reasonCategory
                    ?.let(PublicTakedownReasonCategory::fromWire)
                    ?: throw PublicTakedownException(PublicTakedownError.INVALID_REASON_CATEGORY),
            reason = reason ?: throw InvalidPublicTakedownRequestException(),
            idempotencyKey = idempotencyKey ?: throw InvalidPublicTakedownRequestException(),
        )
}

data class PublicTakedownPreviewResponse(
    val schema: String = "admin.public_takedown.preview.v1",
    val previewId: UUID,
    val expiresAt: Instant,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val targetGeneration: Long,
    val currentSurfaces: Set<String>,
    val confirmEnabled: Boolean,
    val activationBoundary: String,
    val remoteCopyLimitation: String,
) {
    companion object {
        fun from(preview: PublicTakedownPreview) =
            PublicTakedownPreviewResponse(
                previewId = preview.previewId,
                expiresAt = preview.expiresAt,
                clubId = preview.clubId,
                sessionId = preview.sessionId,
                publicationId = preview.publicationId,
                targetGeneration = preview.targetGeneration,
                currentSurfaces = preview.currentSurfaces,
                confirmEnabled = preview.confirmEnabled,
                activationBoundary = preview.activationBoundary,
                remoteCopyLimitation = preview.remoteCopyLimitation,
            )
    }
}

data class PublicTakedownReceiptResponse(
    val schema: String = "admin.public_takedown.receipt.v1",
    val receiptId: UUID,
    val convergenceId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val committedGeneration: Long,
    val originResult: String,
    val reasonCategory: String,
    val reasonRedacted: Boolean,
    val createdAt: Instant,
    val bffEvictionOutcome: String,
    val cdnPurgeOutcome: String,
    val browserRevalidationOutcome: String,
    val remoteCopyLimitation: String,
) {
    companion object {
        fun from(receipt: PublicTakedownReceipt) =
            PublicTakedownReceiptResponse(
                receiptId = receipt.receiptId,
                convergenceId = receipt.convergenceId,
                clubId = receipt.clubId,
                sessionId = receipt.sessionId,
                publicationId = receipt.publicationId,
                committedGeneration = receipt.committedGeneration,
                originResult = receipt.originResult,
                reasonCategory = receipt.reasonCategory.name,
                reasonRedacted = receipt.reasonRedacted,
                createdAt = receipt.createdAt,
                bffEvictionOutcome = receipt.bffEvictionOutcome,
                cdnPurgeOutcome = receipt.cdnPurgeOutcome,
                browserRevalidationOutcome = receipt.browserRevalidationOutcome,
                remoteCopyLimitation = receipt.remoteCopyLimitation,
            )
    }
}

class InvalidPublicTakedownRequestException : RuntimeException("INVALID_PUBLIC_TAKEDOWN_REQUEST")
