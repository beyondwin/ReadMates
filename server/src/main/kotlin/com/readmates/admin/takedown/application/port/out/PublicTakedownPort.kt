package com.readmates.admin.takedown.application.port.out

import com.readmates.admin.takedown.application.model.PublicTakedownIdempotencyScope
import com.readmates.admin.takedown.application.model.PublicTakedownPreview
import com.readmates.admin.takedown.application.model.PublicTakedownReceipt
import com.readmates.admin.takedown.application.model.PublicTakedownRequestIdentity
import com.readmates.admin.takedown.application.model.PublicTakedownTarget
import java.time.Instant
import java.util.UUID

interface PublicTakedownPort {
    fun loadTarget(
        clubId: UUID,
        sessionId: UUID,
        publicationId: UUID,
    ): PublicTakedownTarget?

    fun savePreview(preview: PublicTakedownPreview)

    fun loadPreview(previewId: UUID): PublicTakedownPreview?

    fun loadReplay(
        scope: PublicTakedownIdempotencyScope,
        identity: PublicTakedownRequestIdentity,
    ): ReplayResult

    fun confirmNew(command: StorePublicTakedownCommand): PublicTakedownReceipt

    sealed interface ReplayResult {
        data object Missing : ReplayResult

        data class Replayed(
            val receipt: PublicTakedownReceipt,
        ) : ReplayResult

        data object Conflict : ReplayResult
    }
}

data class StorePublicTakedownCommand(
    val preview: PublicTakedownPreview,
    val scope: PublicTakedownIdempotencyScope,
    val identity: PublicTakedownRequestIdentity,
    val reasonCategory: String,
    val now: Instant,
    val idempotencyExpiresAt: Instant,
)

fun interface PublicTakedownActivationEvidencePort {
    fun confirmEnabled(): Boolean
}
