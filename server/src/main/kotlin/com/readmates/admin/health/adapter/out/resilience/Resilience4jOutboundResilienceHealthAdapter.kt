package com.readmates.admin.health.adapter.out.resilience

import com.readmates.admin.health.application.port.out.OutboundResilienceHealthPort
import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry
import org.springframework.stereotype.Component

@Component
class Resilience4jOutboundResilienceHealthAdapter(
    private val registry: CircuitBreakerRegistry,
) : OutboundResilienceHealthPort {
    override fun openCircuitCount(): Int =
        registry.allCircuitBreakers.count { circuitBreaker ->
            circuitBreaker.state == CircuitBreaker.State.OPEN ||
                circuitBreaker.state == CircuitBreaker.State.FORCED_OPEN
        }
}
