package com.readmates.shared.mutation.application.service

import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component

@Component
class MutationIdempotencyMetrics(
    private val registry: MeterRegistry,
) {
    fun claimOutcome(outcome: String) {
        require(outcome in CLAIM_OUTCOMES) { "unsupported mutation idempotency outcome" }
        registry.counter(CLAIM_METRIC, "outcome", outcome).increment()
    }

    fun purged(count: Int) {
        registry.counter(PURGE_METRIC, "outcome", "purged").increment(count.toDouble())
    }

    fun retirement(allowed: Boolean) {
        val outcome = if (allowed) "allowed" else "rejected"
        registry.counter(RETIREMENT_METRIC, "outcome", outcome).increment()
    }

    private companion object {
        const val CLAIM_METRIC = "mutation.idempotency.claim"
        const val PURGE_METRIC = "mutation.idempotency.purge"
        const val RETIREMENT_METRIC = "mutation.idempotency.retirement"
        val CLAIM_OUTCOMES = setOf("claimed", "replayed", "conflict", "pending")
    }
}
