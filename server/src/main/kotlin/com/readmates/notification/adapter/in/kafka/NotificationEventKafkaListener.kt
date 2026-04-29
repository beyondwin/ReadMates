package com.readmates.notification.adapter.`in`.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.`in`.DispatchNotificationEventUseCase
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class NotificationEventKafkaListener(
    private val dispatchNotificationEventUseCase: DispatchNotificationEventUseCase,
) {
    @KafkaListener(
        topics = ["\${readmates.notifications.kafka.events-topic:readmates.notification.events.v1}"],
        groupId = "\${readmates.notifications.kafka.consumer-group:readmates-notification-dispatcher}",
        containerFactory = "notificationKafkaListenerContainerFactory",
    )
    fun onMessage(message: NotificationEventMessage) {
        if (message.schemaVersion != SUPPORTED_SCHEMA_VERSION) {
            throw NotificationUnsupportedSchemaVersionException(message.schemaVersion)
        }
        dispatchNotificationEventUseCase.dispatch(message)
    }

    private companion object {
        private const val SUPPORTED_SCHEMA_VERSION = 1
    }
}

class NotificationUnsupportedSchemaVersionException(
    schemaVersion: Int,
) : RuntimeException("Unsupported notification event schemaVersion $schemaVersion")
