@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.health.adapter.`in`.scheduling

import com.readmates.admin.health.application.model.PlatformHealthRefreshTrigger
import com.readmates.admin.health.application.port.`in`.RefreshPlatformAdminHealthUseCase
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class PlatformAdminHealthRefreshScheduler(
    private val refreshHealth: RefreshPlatformAdminHealthUseCase,
) {
    @Scheduled(fixedDelayString = "\${readmates.admin.health.refresh-interval}")
    fun refresh() {
        try {
            refreshHealth.refresh(PlatformHealthRefreshTrigger.SCHEDULED).whenComplete { _, failure ->
                if (failure != null) {
                    logger.warn(SCHEDULED_REFRESH_FAILED_MESSAGE)
                }
            }
        } catch (_: RuntimeException) {
            logger.warn(SCHEDULED_REFRESH_FAILED_MESSAGE)
        }
    }

    private companion object {
        const val SCHEDULED_REFRESH_FAILED_MESSAGE = "Scheduled admin health refresh failed"
        val logger = LoggerFactory.getLogger(PlatformAdminHealthRefreshScheduler::class.java)
    }
}
