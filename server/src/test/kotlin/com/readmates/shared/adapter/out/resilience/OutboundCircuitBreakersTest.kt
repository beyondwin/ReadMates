package com.readmates.shared.adapter.out.resilience

import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import java.time.Duration

class OutboundCircuitBreakersTest {
    private fun breakers(registry: MeterRegistry): OutboundCircuitBreakers =
        OutboundCircuitBreakers(
            properties =
                OutboundResilienceProperties(
                    slidingWindowSize = 2,
                    minimumNumberOfCalls = 2,
                    failureRateThreshold = 50f,
                    waitDurationInOpenState = Duration.ofSeconds(60),
                ),
            meterRegistryProvider = registryProvider(registry),
        )

    @Test
    fun `successful block returns its value and keeps circuit closed`() {
        val cb = breakers(SimpleMeterRegistry())

        val result = cb.execute("svc", fallback = { "fallback" }) { "ok" }

        assertThat(result).isEqualTo("ok")
        assertThat(cb.states()["svc"]).isEqualTo(CircuitBreaker.State.CLOSED)
    }

    @Test
    fun `repeated failures open the circuit then short-circuit to fallback`() {
        val registry = SimpleMeterRegistry()
        val cb = breakers(registry)
        var blockInvocations = 0

        repeat(2) {
            cb.execute("svc", fallback = { "fallback" }) {
                blockInvocations++
                throw IllegalStateException("boom")
            }
        }
        assertThat(cb.states()["svc"]).isEqualTo(CircuitBreaker.State.OPEN)

        val result = cb.execute("svc", fallback = { "fallback" }) {
            blockInvocations++
            "should-not-run"
        }

        assertThat(result).isEqualTo("fallback")
        assertThat(blockInvocations).isEqualTo(2)
        assertThat(registry.counter("readmates.resilience.short_circuited", "name", "svc").count()).isEqualTo(1.0)
    }

    @Test
    fun `state transitions are recorded as a metric`() {
        val registry = SimpleMeterRegistry()
        val cb = breakers(registry)

        repeat(2) {
            cb.execute("svc", fallback = { "fallback" }) { throw IllegalStateException("boom") }
        }

        val toOpen =
            registry
                .find("readmates.resilience.state_transition")
                .tag("name", "svc")
                .tag("to", "OPEN")
                .counter()
        assertThat(toOpen).isNotNull
        assertThat(toOpen!!.count()).isEqualTo(1.0)
    }

    private fun registryProvider(registry: MeterRegistry): ObjectProvider<MeterRegistry> =
        object : ObjectProvider<MeterRegistry> {
            override fun getObject() = registry

            override fun getObject(vararg args: Any?) = registry

            override fun getIfAvailable() = registry

            override fun getIfUnique() = registry
        }
}
