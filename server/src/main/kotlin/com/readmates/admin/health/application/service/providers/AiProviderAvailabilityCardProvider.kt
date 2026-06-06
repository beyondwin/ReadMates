package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.port.out.PrometheusQueryPort
import com.readmates.admin.health.application.service.HealthCardProvider
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant

@Component
class AiProviderAvailabilityCardProvider(
    private val prometheusQueryPort: PrometheusQueryPort,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "ai_provider_availability"

    @Suppress("ReturnCount", "SwallowedException")
    override fun compute(): HealthCard {
        val now = clock.instant()
        val minRatio =
            try {
                val result = prometheusQueryPort.query(PROMQL)
                result.values.minOfOrNull { it.value }
            } catch (ignored: PrometheusQueryException) {
                // Health probes must never throw — a degraded metric source surfaces as
                // an UNKNOWN card so one unreachable backend can't fail the dashboard.
                return failure(now, "prometheus_unreachable")
            }
        if (minRatio == null) {
            return failure(now, "no_data")
        }
        val status =
            when {
                minRatio < CRIT_THRESHOLD -> HealthCardStatus.CRIT
                minRatio < WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "AI provider 가용성",
            status = status,
            metric = HealthCardMetric(value = minRatio, unit = "ratio", label = "min over providers (5m)"),
            thresholds = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD),
            lastCheckedAt = now,
            source = HealthCardSource.PROMETHEUS,
            drill = DRILL,
            reason = null,
        )
    }

    private fun failure(
        now: Instant,
        reason: String,
    ) = HealthCard(
        id = cardId,
        title = "AI provider 가용성",
        status = HealthCardStatus.UNKNOWN,
        metric = null,
        thresholds = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD),
        lastCheckedAt = now,
        source = HealthCardSource.PROMETHEUS,
        drill = DRILL,
        reason = reason,
    )

    private companion object {
        private const val WARN_THRESHOLD = 0.99
        private const val CRIT_THRESHOLD = 0.95
        private val DRILL = HealthCardDrill.AdminRoute("/admin/ai-ops")
        private const val PROMQL =
            "sum by (provider) (rate(readmates_aigen_jobs_completed_total{status=\"SUCCEEDED\"}[5m])) / " +
                "clamp_min(sum by (provider) (rate(readmates_aigen_jobs_completed_total[5m])), 1)"
    }
}
