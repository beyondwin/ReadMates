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
    val clubId: UUID,
    val sessionId: UUID,
    val generation: Long,
    val clubGeneration: Long,
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

data class PublicConvergenceClaim(
    val convergenceId: UUID,
    val attemptNo: Int,
    val leaseOwner: String,
    val leaseExpiresAt: Instant,
    val clubIdSnapshot: UUID,
    val sessionIdSnapshot: UUID?,
    val publicationIdSnapshot: UUID?,
)

data class PublicConvergenceEvent(
    val convergenceId: UUID,
    val attemptNo: Int,
    val eventSeq: Int,
    val status: ConvergenceAttemptStatus,
    val observedAt: Instant,
    val resultCategory: String?,
)

enum class ProviderAttemptStatus {
    SUCCEEDED,
    FAILED,
}

enum class ProviderResultCategory {
    PURGED,
    TEMPORARY_FAILURE,
    PERMANENT_FAILURE,
    NOT_CONFIGURED,
}

data class ProviderAttemptResult(
    val status: ProviderAttemptStatus,
    val category: ProviderResultCategory,
    val retryable: Boolean,
) {
    init {
        require((status == ProviderAttemptStatus.SUCCEEDED) == (category == ProviderResultCategory.PURGED))
        require(status == ProviderAttemptStatus.FAILED || !retryable)
    }
}

data class PublicConvergenceView(
    val convergenceId: UUID,
    val originResult: String,
    val committedGeneration: Long,
    val status: String,
    val lastAttemptAt: Instant?,
    val retryable: Boolean,
)
