package com.readmates.publication.application.port.out

import java.util.UUID

interface PublicCachePurgePort {
    fun requestPurge(command: PublicCachePurgeCommand): ProviderAttemptResult
}

data class PublicCachePurgeCommand(
    val convergenceId: UUID,
    val publicationId: UUID,
    val sessionId: UUID,
    val committedGeneration: Long,
    val originReadable: Boolean,
    val idempotencyToken: String,
)

sealed interface ProviderAttemptResult {
    data class Succeeded(
        val category: ProviderSuccessCategory,
    ) : ProviderAttemptResult

    data class Failed(
        val category: ProviderFailureCategory,
        val retryable: Boolean,
    ) : ProviderAttemptResult
}

enum class ProviderSuccessCategory {
    PURGED,
}

enum class ProviderFailureCategory {
    UNAVAILABLE,
    TIMEOUT,
    REJECTED,
}
