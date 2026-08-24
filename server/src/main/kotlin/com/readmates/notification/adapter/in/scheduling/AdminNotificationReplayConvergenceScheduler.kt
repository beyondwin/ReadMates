@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.adapter.`in`.scheduling

import com.readmates.notification.application.port.`in`.ProcessAdminNotificationReplayConvergenceUseCase
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(
    prefix = "readmates.notifications",
    name = ["enabled", "worker.enabled"],
    havingValue = "true",
)
class AdminNotificationReplayConvergenceScheduler(
    private val useCase: ProcessAdminNotificationReplayConvergenceUseCase,
) {
    @Scheduled(fixedDelayString = "#{@notificationWorkerRuntime.fixedDelay.toMillis()}")
    fun reconcile() {
        useCase.processBatch()
    }
}
