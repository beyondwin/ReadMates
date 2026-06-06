package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import com.readmates.shared.adapter.out.resilience.OutboundResilienceProperties
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.ObjectProvider
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

class OutboundResilienceHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-06-06T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `card id is outbound-resilience`() {
        val provider = OutboundResilienceHealthCardProvider(breakers(), clock)

        assertThat(provider.cardId).isEqualTo("outbound-resilience")
    }

    @Test
    fun `status is OK when no circuit is open`() {
        val breakers = breakers()
        breakers.execute("svc", fallback = { "f" }) { "ok" }

        val card = OutboundResilienceHealthCardProvider(breakers, clock).compute()

        assertThat(card.id).isEqualTo("outbound-resilience")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.0)
        assertThat(card.source).isEqualTo(HealthCardSource.IN_PROCESS)
        assertThat(card.lastCheckedAt).isEqualTo(clock.instant())
    }

    @Test
    fun `status is CRIT when a circuit is open`() {
        val breakers = breakers()
        repeat(2) { breakers.execute("svc", fallback = { "f" }) { throw IllegalStateException("boom") } }

        val card = OutboundResilienceHealthCardProvider(breakers, clock).compute()

        assertThat(card.status).isEqualTo(HealthCardStatus.CRIT)
        assertThat(card.metric?.value).isEqualTo(1.0)
    }

    private fun breakers(): OutboundCircuitBreakers =
        OutboundCircuitBreakers(
            properties =
                OutboundResilienceProperties(
                    slidingWindowSize = 2,
                    minimumNumberOfCalls = 2,
                    waitDurationInOpenState = Duration.ofSeconds(60),
                ),
            meterRegistryProvider = noop(),
        )

    private fun noop(): ObjectProvider<MeterRegistry> =
        object : ObjectProvider<MeterRegistry> {
            private val registry = SimpleMeterRegistry()

            override fun getObject() = registry

            override fun getObject(vararg args: Any?) = registry

            override fun getIfAvailable() = registry

            override fun getIfUnique() = registry
        }
}
