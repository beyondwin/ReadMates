package com.readmates.aigen.application.model

import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

enum class ProviderCallMode {
    PRIMARY,
    FALLBACK,
    RETRY,
    SCHEMA_CORRECTION,
    SECTION_REPAIR,
    REGENERATE_SECTION,
}

enum class CostBasis {
    NONE,
    ACTUAL,
    ESTIMATED_UNKNOWN,
}

enum class ProviderAttemptState {
    IN_FLIGHT,
    SUCCEEDED,
    FAILED,
    UNKNOWN,
}

/** Content-safe provider failure exposed across the outbound-port boundary. */
class ProviderCallException(
    val error: GenerationError,
    cause: Throwable? = null,
    val retryAfter: Duration? = null,
) : RuntimeException(error.message, cause)

/**
 * Content-free metadata for one physical provider request.
 *
 * Deliberately excludes admission, session, club and user identifiers as well as
 * prompt, schema, transcript, completion, evidence and raw provider failures.
 */
data class ProviderAttempt(
    val attemptId: UUID,
    val ordinal: Int,
    val jobId: UUID,
    val provider: Provider,
    val model: ModelId,
    val mode: ProviderCallMode,
    val state: ProviderAttemptState,
    val reservedCostUsd: BigDecimal,
    val costBasis: CostBasis,
    val safeErrorCode: ErrorCode?,
    val startedAt: Instant,
    val completedAt: Instant?,
) {
    init {
        require(ordinal > 0) { "ordinal must be positive" }
        require(model.provider == provider) { "model provider must match provider" }
        require(reservedCostUsd >= BigDecimal.ZERO) { "reservedCostUsd must be non-negative" }
    }
}
