package com.readmates.shared.adapter.out.resilience

import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration(proxyBeanMethods = false)
class OutboundCircuitBreakerRegistryConfiguration {
    @Bean
    fun outboundCircuitBreakerRegistry(properties: OutboundResilienceProperties): CircuitBreakerRegistry =
        buildOutboundCircuitBreakerRegistry(properties)
}
