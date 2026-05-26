package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.service.HealthCardProvider
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component
import java.time.Clock

@Component
class RedisHealthCardProvider(
    private val meterRegistry: MeterRegistry,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "redis"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val counter = meterRegistry.find("readmates.redis.operation.errors").counter()
        if (counter == null) {
            return HealthCard(
                id = cardId,
                title = "Redis",
                status = HealthCardStatus.UNKNOWN,
                metric = null,
                thresholds = THRESHOLDS,
                lastCheckedAt = now,
                source = HealthCardSource.IN_PROCESS,
                drill = null,
                reason = "redis_metrics_unavailable",
            )
        }
        val errorCount = counter.count()
        val status =
            when {
                errorCount >= CRIT_THRESHOLD -> HealthCardStatus.CRIT
                errorCount >= WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "Redis",
            status = status,
            metric = HealthCardMetric(value = errorCount, unit = "errors", label = "process lifetime"),
            thresholds = THRESHOLDS,
            lastCheckedAt = now,
            source = HealthCardSource.IN_PROCESS,
            drill = null,
            reason = null,
        )
    }

    private companion object {
        private const val WARN_THRESHOLD = 1.0
        private const val CRIT_THRESHOLD = 50.0
        private val THRESHOLDS = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD)
    }
}
