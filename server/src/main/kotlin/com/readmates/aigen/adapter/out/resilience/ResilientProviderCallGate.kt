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
import io.github.resilience4j.micrometer.tagged.TaggedCircuitBreakerMetrics
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Component
import java.time.Duration
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

@Component
class ResilientProviderCallGate internal constructor(
    properties: AiGenerationProperties,
    private val metrics: AiGenerationMetrics,
    private val circuitBreakerRegistry: CircuitBreakerRegistry,
    meterRegistry: MeterRegistry,
) : ProviderCallGate {
    @Autowired
    constructor(
        properties: AiGenerationProperties,
        metrics: AiGenerationMetrics,
        meterRegistry: MeterRegistry,
    ) : this(properties, metrics, CircuitBreakerRegistry.ofDefaults(), meterRegistry)

    init {
        TaggedCircuitBreakerMetrics
            .ofCircuitBreakerRegistry(circuitBreakerRegistry)
            .bindTo(meterRegistry)
    }

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

    /**
     * Coordinator lifecycle: call [record] exactly once for the provider outcome, then call [close]
     * from `finally`. A close that wins before record cancels the circuit permission and makes every
     * later record a no-op; all transitions are linearized on this permit instance.
     */
    private class ResilientProviderCallPermit(
        private val provider: Provider,
        private val circuitBreaker: CircuitBreaker,
        private val semaphore: Semaphore,
        private val metrics: AiGenerationMetrics,
    ) : ProviderCallPermit {
        private var lifecycleState = PermitLifecycleState.ACTIVE

        @Synchronized
        override fun record(
            outcome: ProviderCircuitOutcome,
            elapsed: Duration,
        ) {
            if (lifecycleState != PermitLifecycleState.ACTIVE) return
            val elapsedNanos = elapsed.toNanos().coerceAtLeast(0)
            when (outcome) {
                ProviderCircuitOutcome.SUCCESS ->
                    circuitBreaker.onSuccess(elapsedNanos, TimeUnit.NANOSECONDS)

                ProviderCircuitOutcome.TRANSIENT_FAILURE ->
                    circuitBreaker.onError(elapsedNanos, TimeUnit.NANOSECONDS, TransientProviderFailure)

                ProviderCircuitOutcome.IGNORED_FAILURE -> circuitBreaker.releasePermission()
            }
            lifecycleState = PermitLifecycleState.RECORDED
            metrics.recordProviderCall(provider, outcome, elapsed)
        }

        @Synchronized
        override fun close() {
            if (lifecycleState == PermitLifecycleState.CLOSED) return
            val releaseCircuitPermission = lifecycleState == PermitLifecycleState.ACTIVE
            lifecycleState = PermitLifecycleState.CLOSED
            try {
                if (releaseCircuitPermission) circuitBreaker.releasePermission()
            } finally {
                semaphore.release()
            }
        }
    }

    private enum class PermitLifecycleState {
        ACTIVE,
        RECORDED,
        CLOSED,
    }

    private object TransientProviderFailure : RuntimeException(null, null, false, false)

    private companion object {
        fun circuitName(provider: Provider): String = "aigen-provider-${provider.name.lowercase()}"
    }
}
