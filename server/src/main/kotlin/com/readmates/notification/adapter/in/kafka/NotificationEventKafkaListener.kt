package com.readmates.notification.adapter.`in`.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.`in`.DispatchNotificationEventUseCase
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class NotificationEventKafkaListener(
    private val dispatchNotificationEventUseCase: DispatchNotificationEventUseCase,
) {
    @KafkaListener(
        topics = ["\${readmates.notifications.kafka.events-topic:readmates.notification.events.v1}"],
        groupId = "\${readmates.notifications.kafka.consumer-group:readmates-notification-dispatcher}",
    )
    fun onMessage(message: NotificationEventMessage) {
        require(message.schemaVersion == 1) {
            "Unsupported notification event schemaVersion ${message.schemaVersion}"
        }
        dispatchNotificationEventUseCase.dispatch(message)
    }
}
