package com.readmates.aigen.adapter.out.resilience

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ProviderCallPermit
import com.readmates.aigen.application.port.out.ProviderCircuitOutcome
import com.readmates.aigen.application.port.out.ProviderGateRejection
import com.readmates.aigen.application.port.out.ProviderPermitDecision
import com.readmates.aigen.application.service.AiGenerationMetrics
import com.readmates.aigen.config.AiGenerationProperties
import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertTimeout
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import java.time.Duration
import kotlin.io.path.Path
import kotlin.io.path.readText

class ResilientProviderCallGateTest {
    private val meterRegistry = SimpleMeterRegistry()

    @Test
    fun `default gate grants two permits per provider and rejects the third without waiting`() {
        val gate = gate()
        val first = gate.acquire(Provider.OPENAI)
        val second = gate.acquire(Provider.OPENAI)

        val third =
            assertTimeout(Duration.ofSeconds(1)) {
                gate.tryAcquire(Provider.OPENAI)
            }

        assertThat(third).isEqualTo(ProviderPermitDecision.Rejected(ProviderGateRejection.CONCURRENCY_LIMIT))
        first.close()
        second.close()
    }

    @Test
    fun `provider semaphores are independent`() {
        val gate = gate(maxConcurrentPerProvider = 1)
        val openAi = gate.acquire(Provider.OPENAI)

        assertThat(gate.tryAcquire(Provider.OPENAI))
            .isEqualTo(ProviderPermitDecision.Rejected(ProviderGateRejection.CONCURRENCY_LIMIT))
        val claude = gate.tryAcquire(Provider.CLAUDE)
        val gemini = gate.tryAcquire(Provider.GEMINI)
        assertThat(claude).isInstanceOf(ProviderPermitDecision.Acquired::class.java)
        assertThat(gemini).isInstanceOf(ProviderPermitDecision.Acquired::class.java)

        openAi.close()
        (claude as ProviderPermitDecision.Acquired).permit.close()
        (gemini as ProviderPermitDecision.Acquired).permit.close()
    }

    @Test
    fun `circuit permission is checked before the provider semaphore`() {
        val circuitRegistry = circuitRegistry()
        val gate = gate(maxConcurrentPerProvider = 1, circuitRegistry = circuitRegistry)
        val held = gate.acquire(Provider.OPENAI)
        circuitRegistry.circuitBreaker("aigen-provider-openai").transitionToForcedOpenState()

        val decision = gate.tryAcquire(Provider.OPENAI)

        assertThat(decision).isEqualTo(ProviderPermitDecision.Rejected(ProviderGateRejection.CIRCUIT_OPEN))
        held.close()
    }

    @ParameterizedTest(name = "{0} is a transient circuit failure")
    @ValueSource(strings = ["timeout", "network", "http_5xx"])
    fun `transient provider failures are recorded with onError`(
        @Suppress("UNUSED_PARAMETER") failureClass: String,
    ) {
        val circuitRegistry = circuitRegistry()
        val gate = gate(circuitRegistry = circuitRegistry)

        repeat(2) {
            gate.acquire(Provider.OPENAI).use { permit ->
                permit.record(ProviderCircuitOutcome.TRANSIENT_FAILURE, Duration.ofMillis(25))
            }
        }

        val circuit = circuitRegistry.circuitBreaker("aigen-provider-openai")
        assertThat(circuit.metrics.numberOfFailedCalls).isEqualTo(2)
        assertThat(circuit.state).isEqualTo(CircuitBreaker.State.OPEN)
    }

    @ParameterizedTest(name = "{0} is ignored by circuit failure rate")
    @ValueSource(
        strings = [
            "http_429",
            "auth",
            "permission",
            "safety",
            "invalid_request",
            "context_limit",
            "schema",
            "parse",
            "grounding",
        ],
    )
    fun `policy and content failures are recorded with onSuccess`(
        @Suppress("UNUSED_PARAMETER") failureClass: String,
    ) {
        val circuitRegistry = circuitRegistry()
        val gate = gate(circuitRegistry = circuitRegistry)

        repeat(2) {
            gate.acquire(Provider.CLAUDE).use { permit ->
                permit.record(ProviderCircuitOutcome.IGNORED_FAILURE, Duration.ofMillis(10))
            }
        }

        val circuit = circuitRegistry.circuitBreaker("aigen-provider-claude")
        assertThat(circuit.metrics.numberOfSuccessfulCalls).isEqualTo(2)
        assertThat(circuit.metrics.numberOfFailedCalls).isZero()
        assertThat(circuit.state).isEqualTo(CircuitBreaker.State.CLOSED)
    }

    @Test
    fun `closing after reconciliation failure releases exactly one semaphore permit`() {
        val gate = gate(maxConcurrentPerProvider = 1)
        val permit = gate.acquire(Provider.GEMINI)

        assertThatThrownBy {
            try {
                error("reconciliation failed")
            } finally {
                permit.close()
                permit.close()
            }
        }.isInstanceOf(IllegalStateException::class.java)

        val next = gate.acquire(Provider.GEMINI)
        assertThat(gate.tryAcquire(Provider.GEMINI))
            .isEqualTo(ProviderPermitDecision.Rejected(ProviderGateRejection.CONCURRENCY_LIMIT))
        next.close()
    }

    @Test
    fun `provider call configuration rejects unsafe bounds`() {
        val invalidFactories =
            listOf(
                { AiGenerationProperties.ProviderCalls(maxConcurrentPerProvider = 0) },
                { AiGenerationProperties.ProviderCalls(maxConcurrentPerProvider = 17) },
                { AiGenerationProperties.ProviderCalls(requestTimeout = Duration.ZERO) },
                { AiGenerationProperties.ProviderCalls(requestTimeout = Duration.ofMinutes(4).plusMillis(1)) },
                {
                    AiGenerationProperties.ProviderCalls(
                        transientBackoffBase = Duration.ofSeconds(31),
                        transientBackoffMax = Duration.ofSeconds(30),
                    )
                },
            )

        invalidFactories.forEach { factory ->
            assertThatThrownBy {
                factory()
                error("expected invalid provider-call configuration to be rejected")
            }.isInstanceOf(IllegalArgumentException::class.java)
        }
    }

    @Test
    fun `provider call yaml remains environment backed with safe defaults`() {
        val yaml = Path("src/main/resources/application.yml").readText()

        assertThat(yaml).contains(
            "request-timeout: \${READMATES_AIGEN_PROVIDER_REQUEST_TIMEOUT:4m}",
            "max-concurrent-per-provider: \${READMATES_AIGEN_MAX_CONCURRENT_PER_PROVIDER:2}",
            "transient-backoff-base: \${READMATES_AIGEN_TRANSIENT_BACKOFF_BASE:1s}",
            "transient-backoff-max: \${READMATES_AIGEN_TRANSIENT_BACKOFF_MAX:30s}",
        )
    }

    private fun gate(
        maxConcurrentPerProvider: Int = 2,
        circuitRegistry: CircuitBreakerRegistry = circuitRegistry(),
    ): ResilientProviderCallGate =
        ResilientProviderCallGate(
            properties =
                AiGenerationProperties(
                    providerCalls =
                        AiGenerationProperties.ProviderCalls(
                            maxConcurrentPerProvider = maxConcurrentPerProvider,
                        ),
                ),
            metrics = AiGenerationMetrics(meterRegistry),
            circuitBreakerRegistry = circuitRegistry,
        )

    private fun ResilientProviderCallGate.acquire(provider: Provider): ProviderCallPermit {
        return (tryAcquire(provider) as ProviderPermitDecision.Acquired).permit
    }

    private fun circuitRegistry(): CircuitBreakerRegistry =
        CircuitBreakerRegistry.of(
            CircuitBreakerConfig
                .custom()
                .slidingWindowSize(2)
                .minimumNumberOfCalls(2)
                .failureRateThreshold(50f)
                .waitDurationInOpenState(Duration.ofMinutes(1))
                .build(),
        )
}
