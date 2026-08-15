package com.readmates.shared.adapter.out.resilience

import io.github.resilience4j.circuitbreaker.CallNotPermittedException
import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.context.annotation.Import
import org.springframework.stereotype.Component

/**
 * Programmatic CircuitBreaker facade for outbound adapters. Keeping resilience4j
 * usage here (and inside `*.adapter.out`) preserves the hexagonal boundary —
 * application/domain code never sees a circuit-breaker type.
 *
 * fail-open contract: when the breaker is OPEN, [execute] does NOT invoke the
 * block and returns the caller-supplied fallback. The caller decides what the
 * fallback means (allow vs. degraded result).
 */
@Component
@Import(OutboundCircuitBreakerRegistryConfiguration::class)
class OutboundCircuitBreakers
    @Autowired
    internal constructor(
        private val properties: OutboundResilienceProperties,
        private val meterRegistryProvider: ObjectProvider<MeterRegistry>,
        private val registry: CircuitBreakerRegistry,
    ) {
        constructor(
            properties: OutboundResilienceProperties,
            meterRegistryProvider: ObjectProvider<MeterRegistry>,
        ) : this(properties, meterRegistryProvider, buildOutboundCircuitBreakerRegistry(properties))

        init {
            registry.eventPublisher.onEntryAdded { entryEvent ->
                val breaker = entryEvent.addedEntry
                breaker.eventPublisher.onStateTransition { event ->
                    meterRegistryProvider.ifAvailable
                        ?.counter(
                            "readmates.resilience.state_transition",
                            "name",
                            breaker.name,
                            "from",
                            event.stateTransition.fromState.name,
                            "to",
                            event.stateTransition.toState.name,
                        )?.increment()
                }
            }
        }

        @Suppress("TooGenericExceptionCaught")
        fun <T> execute(
            name: String,
            fallback: (Throwable) -> T,
            block: () -> T,
        ): T {
            if (!properties.enabled) {
                return runCatching(block).getOrElse(fallback)
            }
            val breaker = registry.circuitBreaker(name)
            return try {
                breaker.executeCallable { block() }
            } catch (ex: CallNotPermittedException) {
                meterRegistryProvider.ifAvailable
                    ?.counter("readmates.resilience.short_circuited", "name", name)
                    ?.increment()
                fallback(ex)
            } catch (ex: Exception) {
                fallback(ex)
            }
        }

        fun states(): Map<String, CircuitBreaker.State> = registry.allCircuitBreakers.associate { it.name to it.state }
    }

internal fun buildOutboundCircuitBreakerRegistry(properties: OutboundResilienceProperties): CircuitBreakerRegistry =
    CircuitBreakerRegistry.of(
        CircuitBreakerConfig
            .custom()
            .failureRateThreshold(properties.failureRateThreshold)
            .slidingWindowSize(properties.slidingWindowSize)
            .minimumNumberOfCalls(properties.minimumNumberOfCalls)
            .permittedNumberOfCallsInHalfOpenState(properties.permittedCallsInHalfOpenState)
            .waitDurationInOpenState(properties.waitDurationInOpenState)
            .automaticTransitionFromOpenToHalfOpenEnabled(true)
            .build(),
    )
