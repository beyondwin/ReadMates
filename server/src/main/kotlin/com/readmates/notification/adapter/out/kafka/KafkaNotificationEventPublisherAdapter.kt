package com.readmates.notification.adapter.out.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.support.KafkaHeaders
import org.springframework.messaging.support.MessageBuilder
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class KafkaNotificationEventPublisherAdapter(
    private val kafkaTemplate: KafkaTemplate<String, NotificationEventMessage>,
) : NotificationEventPublisherPort {
    override fun publish(message: NotificationEventMessage, topic: String, key: String) {
        val kafkaMessage = MessageBuilder.withPayload(message)
            .setHeader(KafkaHeaders.TOPIC, topic)
            .setHeader(KafkaHeaders.KEY, key)
            .setHeader("readmates-schema-version", message.schemaVersion.toString())
            .setHeader("readmates-event-id", message.eventId.toString())
            .setHeader("readmates-event-type", message.eventType.name)
            .build()

        kafkaTemplate.send(kafkaMessage).get()
    }
}
