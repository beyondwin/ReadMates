package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.service.HealthCardProvider
import io.micrometer.core.instrument.MeterRegistry
import org.springframework.stereotype.Component
import java.time.Clock

@Component
class OutboxBacklogHealthCardProvider(
    private val meterRegistry: MeterRegistry,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "outbox_backlog"

    override fun compute(): HealthCard {
        val now = clock.instant()
        val gauge =
            meterRegistry
                .find("readmates.notifications.outbox.backlog")
                .tag("status", "pending")
                .gauge()
        if (gauge == null) {
            return HealthCard(
                id = cardId,
                title = "Outbox backlog",
                status = HealthCardStatus.UNKNOWN,
                metric = null,
                thresholds = THRESHOLDS,
                lastCheckedAt = now,
                source = HealthCardSource.IN_PROCESS,
                drill = DRILL,
                reason = "outbox_gauge_unavailable",
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
            title = "Outbox backlog",
            status = status,
            metric = HealthCardMetric(value = pending, unit = "rows", label = "pending"),
            thresholds = THRESHOLDS,
            lastCheckedAt = now,
            source = HealthCardSource.IN_PROCESS,
            drill = DRILL,
            reason = null,
        )
    }

    private companion object {
        private const val WARN_THRESHOLD = 100.0
        private const val CRIT_THRESHOLD = 1000.0
        private val THRESHOLDS = HealthCardThresholds(warn = WARN_THRESHOLD, crit = CRIT_THRESHOLD)
        private val DRILL = HealthCardDrill.AdminRoute("/admin/notifications?focus=outbox_backlog")
    }
}
