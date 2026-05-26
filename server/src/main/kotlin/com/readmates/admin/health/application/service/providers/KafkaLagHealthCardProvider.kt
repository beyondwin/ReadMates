package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.adapter.out.prometheus.PrometheusQueryException
import com.readmates.admin.health.application.model.HealthCard
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
class KafkaLagHealthCardProvider(
    private val prometheusQueryPort: PrometheusQueryPort,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "kafka_consumer_lag"

    @Suppress("ReturnCount", "SwallowedException")
    override fun compute(): HealthCard {
        val now = clock.instant()
        val maxLag =
            try {
                val result = prometheusQueryPort.query(PROMQL)
                result.values.maxOfOrNull { it.value }
            } catch (ex: PrometheusQueryException) {
                return failure(now, reason = "prometheus_unreachable")
            }
        if (maxLag == null) {
            return failure(now, reason = "no_data")
        }
        val status =
            when {
                maxLag >= CRIT_THRESHOLD -> HealthCardStatus.CRIT
                maxLag >= WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "Kafka consumer lag",
            status = status,
            metric = HealthCardMetric(value = maxLag, unit = "records", label = "max across partitions"),
            thresholds = THRESHOLDS,
            lastCheckedAt = now,
            source = HealthCardSource.PROMETHEUS,
            drill = null,
            reason = null,
        )
    }

    private fun failure(
        now: Instant,
        reason: String,
    ) = HealthCard(
        id = cardId,
        title = "Kafka consumer lag",
        status = HealthCardStatus.UNKNOWN,
        metric = null,
        thresholds = THRESHOLDS,
        lastCheckedAt = now,
        source = HealthCardSource.PROMETHEUS,
        drill = null,
        reason = reason,
    )

    private companion object {
        private const val WARN_THRESHOLD = 50.0
        private const val CRIT_THRESHOLD = 500.0
        private val THRESHOLDS = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD)
        private const val PROMQL =
            "max by (topic) (kafka_consumer_records_lag{consumer_group=\"readmates-aigen-worker\"})"
    }
}
