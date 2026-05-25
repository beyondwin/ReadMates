package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.PromInstantValue
import com.readmates.admin.health.application.port.out.PromQueryResult
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class AiProviderAvailabilityCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    private class FakePrometheus(private val behaviour: () -> PromQueryResult) : PrometheusQueryPort {
        override fun query(promql: String): PromQueryResult = behaviour()
    }

    @Test
    fun `status OK when minimum provider success ratio is at least warn threshold`() {
        val card =
            AiProviderAvailabilityCardProvider(
                FakePrometheus {
                    PromQueryResult(
                        listOf(
                            PromInstantValue(mapOf("provider" to "CLAUDE"), 1.0),
                            PromInstantValue(mapOf("provider" to "OPENAI"), 0.995),
                        ),
                    )
                },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.995)
        assertThat(card.drill).isEqualTo(HealthCardDrill.AdminRoute("/admin/ai-ops"))
    }

    @Test
    fun `status WARN at warn threshold and CRIT at crit threshold`() {
        val warn =
            AiProviderAvailabilityCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(mapOf("provider" to "OPENAI"), 0.98))) },
                clock,
            ).compute()
        val crit =
            AiProviderAvailabilityCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(mapOf("provider" to "OPENAI"), 0.90))) },
                clock,
            ).compute()
        assertThat(warn.status).isEqualTo(HealthCardStatus.WARN)
        assertThat(crit.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status UNKNOWN when no provider data`() {
        val card =
            AiProviderAvailabilityCardProvider(
                FakePrometheus { PromQueryResult(emptyList()) },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("no_data")
    }

    @Test
    fun `status UNKNOWN when prometheus throws`() {
        val card =
            AiProviderAvailabilityCardProvider(
                FakePrometheus { throw PrometheusQueryException("boom") },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("prometheus_unreachable")
    }
}
