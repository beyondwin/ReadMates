package com.readmates.publication.application.model

import java.time.Instant
import java.util.UUID

data class PublicClubProjectionGeneration(
    val clubId: UUID,
    val generation: Long,
    val originReadable: Boolean,
)

data class PublicProjectionGeneration(
    val publicationId: UUID?,
    val generation: Long,
    val liveRecordRevision: Long?,
    val originReadable: Boolean,
    val clubId: UUID = UUID(0, 0),
    val sessionId: UUID = UUID(0, 0),
    val clubGeneration: Long = 0,
)

data class PublicMutationConvergenceReceipt(
    val mutationReceiptId: String,
    val convergenceId: UUID,
    val publicationIdSnapshot: UUID? = null,
    val sessionIdSnapshot: UUID? = null,
    val committedGeneration: Long,
    val originReadable: Boolean,
)

enum class ConvergenceAttemptStatus {
    PENDING,
    SUCCEEDED,
    FAILED,
}

enum class PublicConvergenceProcessResult {
    PROCESSED,
    NO_WORK,
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

data class ClaimPublicConvergenceWorkCommand(
    val workerId: String,
    val now: Instant,
    val leaseExpiresAt: Instant,
    val maxAttempts: Int,
)

data class ClaimedPublicConvergenceWork(
    val convergenceId: UUID,
    val publicationId: UUID,
    val sessionId: UUID,
    val committedGeneration: Long,
    val originReadable: Boolean,
    val attemptNo: Int,
    val workerId: String,
    val leaseExpiresAt: Instant,
)

data class CompletePublicConvergenceAttemptCommand(
    val convergenceId: UUID,
    val attemptNo: Int,
    val workerId: String,
    val status: ConvergenceAttemptStatus,
    val observedAt: Instant,
    val resultCategory: String,
    val nextAvailableAt: Instant,
    val exhausted: Boolean,
)

data class PublicConvergenceHostSnapshot(
    val receipt: PublicMutationConvergenceReceipt,
    val currentEvent: PublicConvergenceEvent?,
    val nextAttemptNo: Int?,
)

data class PublicConvergenceView(
    val convergenceId: UUID,
    val originResult: String,
    val committedGeneration: Long,
    val status: String,
    val lastAttemptAt: Instant?,
    val retryable: Boolean,
)

class PublicConvergenceNotAuthorizedException : RuntimeException("PUBLIC_CONVERGENCE_NOT_AUTHORIZED")

class PublicConvergenceNotFoundException : RuntimeException("PUBLIC_CONVERGENCE_NOT_FOUND")

fun providerIdempotencyToken(
    convergenceId: UUID,
    attemptNo: Int,
): String = "public-convergence:$convergenceId:$attemptNo"
