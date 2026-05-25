package com.readmates.admin.health.adapter.`in`.web

import com.readmates.admin.health.application.model.DeployAttemptStripEntry
import com.readmates.admin.health.application.model.HealthCard
import com.readmates.admin.health.application.model.HealthCardDrill
import com.readmates.admin.health.application.model.HealthCardMetric
import com.readmates.admin.health.application.model.HealthCardSource
import com.readmates.admin.health.application.model.HealthCardStatus
import com.readmates.admin.health.application.model.HealthCardThresholds
import com.readmates.admin.health.application.model.PlatformHealthSnapshot
import com.readmates.admin.health.application.service.PlatformAdminHealthService
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant

@RestController
@RequestMapping("/api/admin/health")
class PlatformAdminHealthController(
    private val service: PlatformAdminHealthService,
) {
    @GetMapping("/snapshot")
    fun snapshot(
        @Suppress("UNUSED_PARAMETER") admin: CurrentPlatformAdmin,
    ): PlatformHealthSnapshotResponse = PlatformHealthSnapshotResponse.from(service.currentSnapshot())
}

data class PlatformHealthSnapshotResponse(
    val schema: String,
    val generatedAt: Instant,
    val cards: List<HealthCardResponse>,
) {
    companion object {
        fun from(snapshot: PlatformHealthSnapshot): PlatformHealthSnapshotResponse =
            PlatformHealthSnapshotResponse(
                schema = snapshot.schema,
                generatedAt = snapshot.generatedAt,
                cards = snapshot.cards.map(HealthCardResponse::from),
            )
    }
}

data class HealthCardResponse(
    val id: String,
    val title: String,
    val status: HealthCardStatus,
    val metric: HealthCardMetric?,
    val thresholds: HealthCardThresholds?,
    val lastCheckedAt: Instant,
    val source: HealthCardSource,
    val drill: HealthCardDrillResponse?,
    val reason: String?,
    val deployStrip: List<DeployAttemptStripEntry>?,
) {
    companion object {
        fun from(card: HealthCard): HealthCardResponse =
            HealthCardResponse(
                id = card.id,
                title = card.title,
                status = card.status,
                metric = card.metric,
                thresholds = card.thresholds,
                lastCheckedAt = card.lastCheckedAt,
                source = card.source,
                drill = card.drill?.let(HealthCardDrillResponse::from),
                reason = card.reason,
                deployStrip = card.deployStrip,
            )
    }
}

data class HealthCardDrillResponse(
    val kind: String,
    val target: String,
) {
    companion object {
        fun from(drill: HealthCardDrill): HealthCardDrillResponse =
            when (drill) {
                is HealthCardDrill.AdminRoute ->
                    HealthCardDrillResponse(kind = "ADMIN_ROUTE", target = drill.target)
            }
    }
}
