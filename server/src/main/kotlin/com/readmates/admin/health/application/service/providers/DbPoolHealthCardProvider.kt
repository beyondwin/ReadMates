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
class DbPoolHealthCardProvider(
    private val meterRegistry: MeterRegistry,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "db_pool"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val gauge = meterRegistry.find("hikaricp.connections.pending").gauge()
        if (gauge == null) {
            return HealthCard(
                id = cardId,
                title = "DB pool",
                status = HealthCardStatus.UNKNOWN,
                metric = null,
                thresholds = THRESHOLDS,
                lastCheckedAt = now,
                source = HealthCardSource.IN_PROCESS,
                drill = null,
                reason = "hikari_gauge_unavailable",
            )
        }
        val pending = gauge.value()
        val status =
            when {
                pending >= CRIT_THRESHOLD -> HealthCardStatus.CRIT
                pending >= WARN_THRESHOLD -> HealthCardStatus.WARN
                else -> HealthCardStatus.OK
            }
        return HealthCard(
            id = cardId,
            title = "DB pool",
            status = status,
            metric = HealthCardMetric(value = pending, unit = "connections", label = "pending"),
            thresholds = THRESHOLDS,
            lastCheckedAt = now,
            source = HealthCardSource.IN_PROCESS,
            drill = null,
            reason = null,
        )
    }

    private companion object {
        private const val WARN_THRESHOLD = 1.0
        private const val CRIT_THRESHOLD = 5.0
        private val THRESHOLDS = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD)
    }
}
