package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.port.out.OutboundResilienceHealthPort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class OutboundResilienceHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-06-06T00:00:00Z"), ZoneOffset.UTC)

    @Test
    fun `card id is outbound-resilience`() {
        val provider = OutboundResilienceHealthCardProvider(OutboundResilienceHealthPort { 0 }, clock)

        assertThat(provider.cardId).isEqualTo("outbound-resilience")
    }

    @Test
    fun `status is OK when no circuit is open`() {
        val card = OutboundResilienceHealthCardProvider(OutboundResilienceHealthPort { 0 }, clock).compute()

        assertThat(card.id).isEqualTo("outbound-resilience")
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.0)
        assertThat(card.metric?.unit).isEqualTo("open circuits")
        assertThat(card.thresholds).isEqualTo(HealthCardThresholds(warn = 1.0, crit = 1.0))
        assertThat(card.source).isEqualTo(HealthCardSource.IN_PROCESS)
        assertThat(card.lastCheckedAt).isEqualTo(clock.instant())
    }

    @Test
    fun `status is CRIT when a circuit is open`() {
        val card = OutboundResilienceHealthCardProvider(OutboundResilienceHealthPort { 1 }, clock).compute()

        assertThat(card.status).isEqualTo(HealthCardStatus.CRIT)
        assertThat(card.metric?.value).isEqualTo(1.0)
    }
}
