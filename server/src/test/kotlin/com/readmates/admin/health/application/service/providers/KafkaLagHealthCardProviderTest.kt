package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.port.out.PromInstantValue
import com.readmates.admin.health.application.port.out.PromQueryResult
import com.readmates.admin.health.application.port.out.PrometheusQueryException
import com.readmates.admin.health.application.port.out.PrometheusQueryFailureKind
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class KafkaLagHealthCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    private class FakePrometheus(
        private val behaviour: () -> PromQueryResult,
    ) : PrometheusQueryPort {
        override fun query(promql: String): PromQueryResult = behaviour()
    }

    @Test
    fun `status OK when max lag below warn`() {
        val card =
            KafkaLagHealthCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 12.0))) },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(12.0)
    }

    @Test
    fun `status WARN at warn and CRIT at crit thresholds`() {
        val warn =
            KafkaLagHealthCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 50.0))) },
                clock,
            ).compute()
        val crit =
            KafkaLagHealthCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 500.0))) },
                clock,
            ).compute()
        assertThat(warn.status).isEqualTo(HealthCardStatus.WARN)
        assertThat(crit.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status UNKNOWN when prometheus returns empty`() {
        val card =
            KafkaLagHealthCardProvider(
                FakePrometheus { PromQueryResult(emptyList()) },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(card.reason).isEqualTo("no_data")
    }

    @Test
    fun `typed prometheus failure reaches refresh orchestration`() {
        val failure = PrometheusQueryException(PrometheusQueryFailureKind.CONNECTION)
        val provider = KafkaLagHealthCardProvider(FakePrometheus { throw failure }, clock)

        assertThatThrownBy(provider::compute).isSameAs(failure)
    }
}
