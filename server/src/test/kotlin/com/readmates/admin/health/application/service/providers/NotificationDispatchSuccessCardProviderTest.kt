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

class NotificationDispatchSuccessCardProviderTest {
    private val clock: Clock = Clock.fixed(Instant.parse("2026-05-26T00:00:00Z"), ZoneOffset.UTC)

    private class FakePrometheus(
        private val behaviour: () -> PromQueryResult,
    ) : PrometheusQueryPort {
        override fun query(promql: String): PromQueryResult = behaviour()
    }

    @Test
    fun `status OK at high ratio with admin notifications drill`() {
        val card =
            NotificationDispatchSuccessCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 0.999))) },
                clock,
            ).compute()
        assertThat(card.status).isEqualTo(HealthCardStatus.OK)
        assertThat(card.metric?.value).isEqualTo(0.999)
        assertThat(card.drill).isEqualTo(HealthCardDrill.AdminRoute("/admin/notifications?focus=notification_dispatch_success"))
    }

    @Test
    fun `status WARN below warn threshold and CRIT below crit threshold`() {
        val warn =
            NotificationDispatchSuccessCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 0.98))) },
                clock,
            ).compute()
        val crit =
            NotificationDispatchSuccessCardProvider(
                FakePrometheus { PromQueryResult(listOf(PromInstantValue(emptyMap(), 0.80))) },
                clock,
            ).compute()
        assertThat(warn.status).isEqualTo(HealthCardStatus.WARN)
        assertThat(crit.status).isEqualTo(HealthCardStatus.CRIT)
    }

    @Test
    fun `status UNKNOWN on empty result or prometheus error`() {
        val empty =
            NotificationDispatchSuccessCardProvider(
                FakePrometheus { PromQueryResult(emptyList()) },
                clock,
            ).compute()
        val error =
            NotificationDispatchSuccessCardProvider(
                FakePrometheus { throw PrometheusQueryException("boom") },
                clock,
            ).compute()
        assertThat(empty.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(empty.reason).isEqualTo("no_data")
        assertThat(error.status).isEqualTo(HealthCardStatus.UNKNOWN)
        assertThat(error.reason).isEqualTo("prometheus_unreachable")
    }
}
