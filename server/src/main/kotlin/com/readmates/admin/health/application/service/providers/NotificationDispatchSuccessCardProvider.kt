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
class NotificationDispatchSuccessCardProvider(
    private val prometheusQueryPort: PrometheusQueryPort,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "notification_dispatch_success"

    @Suppress("ReturnCount", "SwallowedException")
    override fun compute(): HealthCard {
        val now = clock.instant()
        val ratio =
            try {
                prometheusQueryPort
                    .query(PROMQL)
                    .values
                    .firstOrNull()
                    ?.value
            } catch (ignored: PrometheusQueryException) {
                // Health probes must never throw — a degraded metric source surfaces as
                // an UNKNOWN card so one unreachable backend can't fail the dashboard.
                return failure(now, "prometheus_unreachable")
            }
        if (ratio == null) {
            return failure(now, "no_data")
        }
        val status =
            when {
                ratio < CRIT_THRESHOLD -> HealthCardStatus.CRIT
                ratio < WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "알림 발송 성공률",
            status = status,
            metric = HealthCardMetric(value = ratio, unit = "ratio", label = "5m"),
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
        title = "알림 발송 성공률",
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
        private val DRILL = HealthCardDrill.AdminRoute("/admin/notifications?focus=notification_dispatch_success")
        private const val PROMQL =
            "sum(rate(readmates_outbox_publish_total{result=\"success\"}[5m])) / " +
                "clamp_min(sum(rate(readmates_outbox_publish_total[5m])), 1)"
    }
}
