package com.readmates.auth.application.port.out

import java.time.Duration

data class RateLimitCheck(
    val key: String,
    val limit: Long,
    val window: Duration,
    val sensitive: Boolean,
)

data class RateLimitDecision(
    val allowed: Boolean,
    val retryAfterSeconds: Long? = null,
    val fallback: Boolean = false,
) {
    companion object {
        fun allowed(fallback: Boolean = false) =
            RateLimitDecision(allowed = true, fallback = fallback)

        fun denied(retryAfterSeconds: Long?) =
            RateLimitDecision(allowed = false, retryAfterSeconds = retryAfterSeconds)
    }
}

interface RateLimitPort {
    fun check(check: RateLimitCheck): RateLimitDecision

    class InMemoryForTest : RateLimitPort {
        val checks = mutableListOf<RateLimitCheck>()
        var decision: RateLimitDecision = RateLimitDecision.allowed()

        override fun check(check: RateLimitCheck): RateLimitDecision {
            checks += check
            return decision
        }
    }
}
