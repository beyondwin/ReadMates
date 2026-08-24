@file:Suppress("ktlint:standard:package-name")

package com.readmates.publication.adapter.`in`.scheduling

import com.readmates.publication.application.port.`in`.MaintainPublicConvergenceWorkUseCase
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(
    prefix = "readmates.public-convergence.maintenance",
    name = ["enabled"],
    havingValue = "true",
    matchIfMissing = true,
)
class PublicConvergenceMaintenanceScheduler(
    private val maintenance: MaintainPublicConvergenceWorkUseCase,
) {
    @Scheduled(fixedDelayString = "\${readmates.public-convergence.maintenance.fixed-delay:1h}")
    fun purgeExpired() {
        runCatching { maintenance.purgeExpiredWork() }
            .onFailure { log.warn("Public convergence work maintenance failed") }
    }

    private companion object {
        val log = LoggerFactory.getLogger(PublicConvergenceMaintenanceScheduler::class.java)
    }
}
