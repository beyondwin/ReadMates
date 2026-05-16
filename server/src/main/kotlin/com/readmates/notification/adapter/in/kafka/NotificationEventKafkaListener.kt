package com.readmates.notification.adapter.`in`.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.`in`.DispatchNotificationEventUseCase
import org.slf4j.MDC
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.messaging.handler.annotation.Header
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
    fun onMessage(
        message: NotificationEventMessage,
        @Header(name = REQUEST_ID_HEADER, required = false) requestId: String?,
    ) {
        val effectiveRequestId = requestId?.takeIf { it.isNotBlank() } ?: UNKNOWN_REQUEST_ID
        MDC.put(MDC_REQUEST_ID_KEY, effectiveRequestId)
        try {
            if (message.schemaVersion != SUPPORTED_SCHEMA_VERSION) {
                throw NotificationUnsupportedSchemaVersionException(message.schemaVersion)
            }
            dispatchNotificationEventUseCase.dispatch(message)
        } finally {
            MDC.remove(MDC_REQUEST_ID_KEY)
        }
    }

    private companion object {
        private const val SUPPORTED_SCHEMA_VERSION = 1
        private const val REQUEST_ID_HEADER = "readmates-request-id"
        private const val MDC_REQUEST_ID_KEY = "requestId"
        private const val UNKNOWN_REQUEST_ID = "unknown"
    }
}

class NotificationUnsupportedSchemaVersionException(
    schemaVersion: Int,
) : RuntimeException("Unsupported notification event schemaVersion $schemaVersion")
