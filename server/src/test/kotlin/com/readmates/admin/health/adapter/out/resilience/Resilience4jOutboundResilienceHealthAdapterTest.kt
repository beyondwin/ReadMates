package com.readmates.admin.health.adapter.out.resilience

import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class Resilience4jOutboundResilienceHealthAdapterTest {
    private val registry = CircuitBreakerRegistry.ofDefaults()
    private val adapter = Resilience4jOutboundResilienceHealthAdapter(registry)

    @Test
    fun `counts only open and forced open circuits`() {
        registry.circuitBreaker("closed")
        registry.circuitBreaker("open").transitionToOpenState()
        registry.circuitBreaker("forced-open").transitionToForcedOpenState()
        registry.circuitBreaker("half-open").apply {
            transitionToOpenState()
            transitionToHalfOpenState()
        }

        assertThat(registry.circuitBreaker("closed").state).isEqualTo(CircuitBreaker.State.CLOSED)
        assertThat(adapter.openCircuitCount()).isEqualTo(2)
    }

    @Test
    fun `reports individual circuit states as expected`() {
        val closedRegistry = CircuitBreakerRegistry.ofDefaults()
        val openRegistry = CircuitBreakerRegistry.ofDefaults()
        val forcedOpenRegistry = CircuitBreakerRegistry.ofDefaults()
        val halfOpenRegistry = CircuitBreakerRegistry.ofDefaults()

        closedRegistry.circuitBreaker("closed")
        openRegistry.circuitBreaker("open").transitionToOpenState()
        forcedOpenRegistry.circuitBreaker("forced-open").transitionToForcedOpenState()
        halfOpenRegistry.circuitBreaker("half-open").apply {
            transitionToOpenState()
            transitionToHalfOpenState()
        }

        assertThat(Resilience4jOutboundResilienceHealthAdapter(closedRegistry).openCircuitCount()).isZero()
        assertThat(Resilience4jOutboundResilienceHealthAdapter(openRegistry).openCircuitCount()).isEqualTo(1)
        assertThat(Resilience4jOutboundResilienceHealthAdapter(forcedOpenRegistry).openCircuitCount()).isEqualTo(1)
        assertThat(Resilience4jOutboundResilienceHealthAdapter(halfOpenRegistry).openCircuitCount()).isZero()
    }
}
