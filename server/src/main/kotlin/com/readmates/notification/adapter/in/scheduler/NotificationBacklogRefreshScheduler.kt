@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.adapter.`in`.scheduler

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.port.`in`.RefreshNotificationBacklogUseCase
import com.readmates.notification.application.port.out.NotificationBacklogObservationPort
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnBean(NotificationRuntimeProperties.Worker::class)
class NotificationBacklogRefreshScheduler(
    private val refreshUseCase: RefreshNotificationBacklogUseCase,
    private val observationPort: NotificationBacklogObservationPort,
) {
    @Scheduled(
        fixedDelayString = "#{@notificationWorkerRuntime.backlogRefreshInterval.toMillis()}",
        initialDelayString = "#{@notificationWorkerRuntime.backlogInitialDelay.toMillis()}",
    )
    fun refresh() {
        val result = refreshUseCase.refresh()
        try {
            observationPort.recordBacklogRefresh(result)
        } catch (_: RuntimeException) {
            // Metrics are fail-open and cannot invalidate the snapshots already refreshed above.
        }
    }
}
