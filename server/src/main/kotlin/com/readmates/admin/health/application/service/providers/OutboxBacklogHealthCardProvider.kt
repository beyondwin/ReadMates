package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.port.out.PlatformAdminHealthLocalReadingsPort
import com.readmates.admin.health.application.port.out.PlatformHealthProvider
import com.readmates.admin.health.application.service.HealthCardProvider
import org.springframework.stereotype.Component
import java.time.Clock

@Component
class OutboxBacklogHealthCardProvider(
    private val localReadings: PlatformAdminHealthLocalReadingsPort,
    private val clock: Clock,
) : HealthCardProvider {
    override val identity: PlatformHealthProvider = PlatformHealthProvider.OUTBOX_BACKLOG

    override fun compute(): HealthCard {
        val now = clock.instant()
        val pending = localReadings.outboxPendingBacklog()
        if (pending == null) {
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
