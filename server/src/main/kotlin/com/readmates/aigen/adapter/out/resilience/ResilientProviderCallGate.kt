package com.readmates.aigen.adapter.out.resilience

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ProviderCallGate
import com.readmates.aigen.application.port.out.ProviderCallPermit
import com.readmates.aigen.application.port.out.ProviderCircuitOutcome
import com.readmates.aigen.application.port.out.ProviderGateRejection
import com.readmates.aigen.application.port.out.ProviderPermitDecision
import com.readmates.aigen.application.service.AiGenerationMetrics
import com.readmates.aigen.application.service.ProviderCircuitState
import com.readmates.aigen.config.AiGenerationProperties
import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Component
import java.time.Duration
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

@Component
class ResilientProviderCallGate internal constructor(
    properties: AiGenerationProperties,
    private val metrics: AiGenerationMetrics,
    private val circuitBreakerRegistry: CircuitBreakerRegistry,
) : ProviderCallGate {
    @Autowired
    constructor(
        properties: AiGenerationProperties,
        metrics: AiGenerationMetrics,
    ) : this(properties, metrics, CircuitBreakerRegistry.ofDefaults())

    private val semaphores =
        Provider.entries.associateWith {
            Semaphore(properties.providerCalls.maxConcurrentPerProvider, true)
        }
    private val circuitBreakers =
        Provider.entries.associateWith { provider ->
            circuitBreakerRegistry
                .circuitBreaker(circuitName(provider))
                .also { breaker ->
                    breaker.eventPublisher.onStateTransition { event ->
                        metrics.recordProviderCircuitTransition(
                            provider,
                            ProviderCircuitState.valueOf(event.stateTransition.toState.name),
                        )
                    }
                }
        }

    override fun tryAcquire(provider: Provider): ProviderPermitDecision {
        val circuitBreaker = circuitBreakers.getValue(provider)
        return if (!circuitBreaker.tryAcquirePermission()) {
            metrics.recordProviderGateRejection(provider, ProviderGateRejection.CIRCUIT_OPEN)
            ProviderPermitDecision.Rejected(ProviderGateRejection.CIRCUIT_OPEN)
        } else {
            tryAcquireSemaphore(provider, circuitBreaker)
        }
    }

    private fun tryAcquireSemaphore(
        provider: Provider,
        circuitBreaker: CircuitBreaker,
    ): ProviderPermitDecision {
        val semaphore = semaphores.getValue(provider)
        return if (!semaphore.tryAcquire()) {
            circuitBreaker.releasePermission()
            metrics.recordProviderGateRejection(provider, ProviderGateRejection.CONCURRENCY_LIMIT)
            ProviderPermitDecision.Rejected(ProviderGateRejection.CONCURRENCY_LIMIT)
        } else {
            ProviderPermitDecision.Acquired(
                ResilientProviderCallPermit(provider, circuitBreaker, semaphore, metrics),
            )
        }
    }

    private class ResilientProviderCallPermit(
        private val provider: Provider,
        private val circuitBreaker: CircuitBreaker,
        private val semaphore: Semaphore,
        private val metrics: AiGenerationMetrics,
    ) : ProviderCallPermit {
        private val recorded = AtomicBoolean(false)
        private val closed = AtomicBoolean(false)

        override fun record(
            outcome: ProviderCircuitOutcome,
            elapsed: Duration,
        ) {
            if (!recorded.compareAndSet(false, true)) return
            val elapsedNanos = elapsed.toNanos().coerceAtLeast(0)
            when (outcome) {
                ProviderCircuitOutcome.SUCCESS,
                ProviderCircuitOutcome.IGNORED_FAILURE,
                -> circuitBreaker.onSuccess(elapsedNanos, TimeUnit.NANOSECONDS)

                ProviderCircuitOutcome.TRANSIENT_FAILURE ->
                    circuitBreaker.onError(elapsedNanos, TimeUnit.NANOSECONDS, TransientProviderFailure)
            }
            metrics.recordProviderCall(provider, outcome, elapsed)
        }

        override fun close() {
            if (!closed.compareAndSet(false, true)) return
            try {
                if (!recorded.get()) circuitBreaker.releasePermission()
            } finally {
                semaphore.release()
            }
        }
    }

    private object TransientProviderFailure : RuntimeException(null, null, false, false)

    private companion object {
        fun circuitName(provider: Provider): String = "aigen-provider-${provider.name.lowercase()}"
    }
}
