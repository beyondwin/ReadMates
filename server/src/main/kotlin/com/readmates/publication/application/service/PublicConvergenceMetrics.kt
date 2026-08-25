package com.readmates.publication.application.service

import com.readmates.publication.application.model.ProviderAttemptResult
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component

@Component
class PublicConvergenceMetrics(
    private val registry: MeterRegistry,
) {
    fun record(result: ProviderAttemptResult) {
        registry
            .counter(
                "readmates.public.convergence.attempts",
                "status",
                result.status.name,
                "retryable",
                result.retryable.toString(),
            ).increment()
    }
}
