package com.readmates.notification.adapter.out.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.support.KafkaHeaders
import org.springframework.messaging.support.MessageBuilder
import org.springframework.stereotype.Component
import java.time.Duration
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

@Component
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
class KafkaNotificationEventPublisherAdapter(
    @param:Qualifier("notificationEventKafkaTemplate")
    private val kafkaTemplate: KafkaTemplate<String, NotificationEventMessage>,
    private val kafkaProperties: NotificationKafkaProperties,
) : NotificationEventPublisherPort {
    constructor(
        kafkaTemplate: KafkaTemplate<String, NotificationEventMessage>,
        sendTimeout: Duration,
    ) : this(kafkaTemplate, NotificationKafkaProperties(sendTimeout = sendTimeout))

    override fun publish(message: NotificationEventMessage, topic: String, key: String) {
        val kafkaMessage = MessageBuilder.withPayload(message)
            .setHeader(KafkaHeaders.TOPIC, topic)
            .setHeader(KafkaHeaders.KEY, key)
            .setHeader("readmates-schema-version", message.schemaVersion.toString())
            .setHeader("readmates-event-id", message.eventId.toString())
            .setHeader("readmates-event-type", message.eventType.name)
            .build()

        try {
            kafkaTemplate.send(kafkaMessage).get(kafkaProperties.sendTimeout.toMillis(), TimeUnit.MILLISECONDS)
        } catch (ex: NotificationKafkaPublishException) {
            throw ex
        } catch (ex: InterruptedException) {
            Thread.currentThread().interrupt()
            throw NotificationKafkaPublishException("Interrupted publishing notification event ${message.eventId}", ex)
        } catch (ex: TimeoutException) {
            throw NotificationKafkaPublishException(
                "Timed out publishing notification event ${message.eventId} after ${kafkaProperties.sendTimeout}",
                ex,
            )
        } catch (ex: ExecutionException) {
            throw NotificationKafkaPublishException("Failed publishing notification event ${message.eventId}", ex.cause ?: ex)
        } catch (ex: RuntimeException) {
            throw NotificationKafkaPublishException("Failed publishing notification event ${message.eventId}", ex)
        }
    }
}

class NotificationKafkaPublishException(message: String, cause: Throwable) : RuntimeException(message, cause)
