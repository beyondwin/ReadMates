package com.readmates.aigen.application.port.out

import java.time.Instant

interface ActiveAiGenerationJobProbe {
    fun probe(now: Instant): Result

    sealed interface Result

    data class Available(
        val depth: Long,
    ) : Result {
        init {
            require(depth >= 0) { "AI generation queue depth must not be negative" }
        }
    }

    data class Unavailable(
        val reason: UnavailableReason,
    ) : Result

    enum class UnavailableReason {
        REDIS_UNAVAILABLE,
        INDEX_NOT_READY,
        OVER_CAP,
        QUARANTINED,
    }
}
