package com.readmates.admin.health.application.service.providers

import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.service.HealthCardProvider
import com.readmates.shared.adapter.out.resilience.OutboundCircuitBreakers
import org.springframework.stereotype.Component
import java.time.Clock

/**
 * Surfaces outbound CircuitBreaker health in `/admin/health`. This lives in the
 * application layer, so it must NOT import any resilience4j type — it reads circuit
 * health through [OutboundCircuitBreakers.openCircuitCount], which returns a plain
 * Int and keeps the hexagonal boundary intact.
 */
@Component
class OutboundResilienceHealthCardProvider(
    private val circuitBreakers: OutboundCircuitBreakers,
    private val clock: Clock,
) : HealthCardProvider {
    override val cardId: String = "outbound-resilience"

    override fun compute(): HealthCard {
        val openCount = circuitBreakers.openCircuitCount()
        val status = if (openCount >= OPEN_THRESHOLD) HealthCardStatus.CRIT else HealthCardStatus.OK
        return HealthCard(
            id = cardId,
            title = "Outbound resilience",
            status = status,
            metric = HealthCardMetric(value = openCount.toDouble(), unit = "open circuits", label = "current"),
            thresholds = THRESHOLDS,
            lastCheckedAt = clock.instant(),
            source = HealthCardSource.IN_PROCESS,
            drill = null,
            reason = null,
        )
    }

    private companion object {
        private const val OPEN_THRESHOLD = 1.0
        private val THRESHOLDS = HealthCardThresholds(warn = OPEN_THRESHOLD, crit = OPEN_THRESHOLD)
    }
}
