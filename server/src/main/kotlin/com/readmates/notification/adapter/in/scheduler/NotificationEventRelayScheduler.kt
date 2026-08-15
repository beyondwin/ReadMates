package com.readmates.notification.adapter.`in`.scheduler

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.port.`in`.PublishNotificationEventsUseCase
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
@ConditionalOnBean(NotificationRuntimeProperties.Worker::class)
class NotificationEventRelayScheduler(
    private val publishNotificationEventsUseCase: PublishNotificationEventsUseCase,
    worker: NotificationRuntimeProperties.Worker,
) {
    private val batchSize = worker.relayBatchSize

    @Scheduled(fixedDelayString = "#{@notificationWorkerRuntime.fixedDelay.toMillis()}")
    fun publish() {
        publishNotificationEventsUseCase.publishPending(batchSize)
    }
}

@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
@ConditionalOnBean(NotificationRuntimeProperties.Worker::class)
class NotificationEventRelaySchedulingConfig
