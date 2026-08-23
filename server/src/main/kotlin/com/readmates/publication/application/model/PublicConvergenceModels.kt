package com.readmates.publication.application.model

import java.time.Instant
import java.util.UUID

data class PublicProjectionGeneration(
    val publicationId: UUID,
    val generation: Long,
    val liveRecordRevision: Long?,
    val originReadable: Boolean,
)

data class PublicMutationConvergenceReceipt(
    val mutationReceiptId: String,
    val convergenceId: UUID,
    val committedGeneration: Long,
)

enum class ConvergenceAttemptStatus {
    PENDING,
    SUCCEEDED,
    FAILED,
}

data class PublicConvergenceWork(
    val convergenceId: UUID,
    val nextAttemptNo: Int,
    val leaseOwner: String?,
    val leaseExpiresAt: Instant?,
)

data class PublicConvergenceEvent(
    val convergenceId: UUID,
    val attemptNo: Int,
    val eventSeq: Int,
    val status: ConvergenceAttemptStatus,
    val observedAt: Instant,
    val resultCategory: String?,
)

data class AppendPublicConvergenceEventCommand(
    val convergenceId: UUID,
    val expectedAttemptNo: Int,
    val expectedEventSeq: Int,
    val status: ConvergenceAttemptStatus,
    val observedAt: Instant,
    val resultCategory: String?,
)

fun providerIdempotencyToken(
    convergenceId: UUID,
    attemptNo: Int,
): String = "public-convergence:$convergenceId:$attemptNo"
