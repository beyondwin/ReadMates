@file:Suppress("ktlint:standard:package-name")

package com.readmates.club.adapter.`in`.scheduler

import com.readmates.club.application.port.`in`.ProcessPlatformAdminHostInvitationConvergenceUseCase
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.worker", name = ["enabled"], havingValue = "true")
class PlatformAdminHostInvitationConvergenceScheduler(
    private val useCase: ProcessPlatformAdminHostInvitationConvergenceUseCase,
) {
    @Scheduled(fixedDelayString = "#{@notificationWorkerRuntime.fixedDelay.toMillis()}")
    fun deliver() {
        useCase.processBatch()
    }
}
