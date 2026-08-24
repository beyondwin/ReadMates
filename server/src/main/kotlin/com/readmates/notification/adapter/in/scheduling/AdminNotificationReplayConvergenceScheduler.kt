@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.adapter.`in`.scheduling

import com.readmates.notification.application.service.AdminNotificationReplayConvergenceService
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
    private val service: AdminNotificationReplayConvergenceService,
) {
    @Scheduled(fixedDelayString = "#{@notificationWorkerRuntime.fixedDelay.toMillis()}")
    fun reconcile() {
        service.processBatch()
    }
}
