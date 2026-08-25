@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.takedown.adapter.`in`.web

import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import java.time.Instant
import java.util.UUID

data class PublicTakedownPreviewRequest(
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
)

data class ConfirmPublicTakedownRequest(
    val previewId: UUID,
    val reasonCategory: String,
    val reason: String,
    val idempotencyKey: String,
)

data class PublicTakedownPreviewResponse(
    val schema: String = "admin.public_takedown.preview.v1",
    val previewId: UUID,
    val expiresAt: Instant,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val targetGeneration: Long,
    val currentSurfaces: Set<String>,
    val limitationCode: String = STORED_COPY_LIMITATION,
)

data class PublicTakedownReceiptResponse(
    val schema: String = "admin.public_takedown.receipt.v1",
    val receiptId: UUID,
    val convergenceId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val publicationId: UUID,
    val originResult: String,
    val committedGeneration: Long,
    val committedClubGeneration: Long,
    val reasonCategory: String,
    val createdAt: Instant,
    val limitationCode: String = STORED_COPY_LIMITATION,
)

fun PublicTakedownPreview.toResponse() =
    PublicTakedownPreviewResponse(
        previewId = previewId,
        expiresAt = expiresAt,
        clubId = clubId,
        sessionId = sessionId,
        publicationId = publicationId,
        targetGeneration = targetGeneration,
        currentSurfaces = currentSurfaces,
    )

fun PublicTakedownReceipt.toResponse() =
    PublicTakedownReceiptResponse(
        receiptId = receiptId,
        convergenceId = convergenceId,
        clubId = clubId,
        sessionId = sessionId,
        publicationId = publicationId,
        originResult = originResult,
        committedGeneration = committedGeneration,
        committedClubGeneration = committedClubGeneration,
        reasonCategory = reasonCategory,
        createdAt = createdAt,
    )

private const val STORED_COPY_LIMITATION = "STORED_OR_OFFLINE_COPY_MAY_REMAIN"
