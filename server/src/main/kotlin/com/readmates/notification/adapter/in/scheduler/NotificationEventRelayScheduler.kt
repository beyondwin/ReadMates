package com.readmates.notification.adapter.`in`.scheduler

import com.readmates.notification.application.port.`in`.PublishNotificationEventsUseCase
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class NotificationEventRelayScheduler(
    private val publishNotificationEventsUseCase: PublishNotificationEventsUseCase,
    @param:Value("\${readmates.notifications.kafka.relay-batch-size:50}") private val batchSize: Int,
) {
    @Scheduled(fixedDelayString = "\${readmates.notifications.worker.fixed-delay-ms:30000}")
    fun publish() {
        publishNotificationEventsUseCase.publishPending(batchSize)
    }
}

@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class NotificationEventRelaySchedulingConfig
