package com.readmates.notification.adapter.`in`.kafka

import com.readmates.notification.adapter.`in`.scheduler.NotificationEventRelayScheduler
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.`in`.DispatchNotificationEventUseCase
import com.readmates.notification.application.service.NotificationRelayService
import com.readmates.notification.adapter.out.kafka.KafkaNotificationEventPublisherAdapter
import com.readmates.notification.domain.NotificationEventType
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.annotation.KafkaListener
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

class NotificationEventKafkaListenerTest {
    @Test
    fun `listener uses notification kafka listener container factory`() {
        val listener = NotificationEventKafkaListener::class.java.getDeclaredMethod(
            "onMessage",
            NotificationEventMessage::class.java,
        )

        val kafkaListener = listener.getAnnotation(KafkaListener::class.java)

        assertThat(kafkaListener.containerFactory).isEqualTo("notificationKafkaListenerContainerFactory")
    }

    @Test
    fun `kafka listener relay and publisher require global notifications and kafka enabled`() {
        assertThat(NotificationEventKafkaListener::class.java.requiredEnabledProperties()).containsExactlyInAnyOrder(
            "readmates.notifications.enabled",
            "readmates.notifications.kafka.enabled",
        )
        assertThat(NotificationEventRelayScheduler::class.java.requiredEnabledProperties()).containsExactlyInAnyOrder(
            "readmates.notifications.enabled",
            "readmates.notifications.kafka.enabled",
        )
        assertThat(NotificationRelayService::class.java.requiredEnabledProperties()).containsExactlyInAnyOrder(
            "readmates.notifications.enabled",
            "readmates.notifications.kafka.enabled",
        )
        assertThat(KafkaNotificationEventPublisherAdapter::class.java.requiredEnabledProperties()).containsExactlyInAnyOrder(
            "readmates.notifications.enabled",
            "readmates.notifications.kafka.enabled",
        )
    }

    @Test
    fun `listener rejects unsupported schema version with terminal exception before dispatch`() {
        val recordingUseCase = RecordingDispatchUseCase()
        val listener = NotificationEventKafkaListener(recordingUseCase)
        val message = notificationEventMessage(schemaVersion = 2)

        assertThatThrownBy {
            listener.onMessage(message)
        }.isInstanceOf(NotificationUnsupportedSchemaVersionException::class.java)
            .hasMessageContaining("Unsupported notification event schemaVersion 2")

        assertThat(recordingUseCase.dispatchedMessages).isEmpty()
    }

    private fun Class<*>.requiredEnabledProperties(): List<String> =
        getAnnotationsByType(ConditionalOnProperty::class.java)
            .filter { it.havingValue == "true" }
            .flatMap { annotation ->
                annotation.name.map { name ->
                    listOf(annotation.prefix, name).filter(String::isNotBlank).joinToString(".")
                }
            }
}

private class RecordingDispatchUseCase : DispatchNotificationEventUseCase {
    val dispatchedMessages = mutableListOf<NotificationEventMessage>()

    override fun dispatch(message: NotificationEventMessage) {
        dispatchedMessages += message
    }
}

private fun notificationEventMessage(schemaVersion: Int): NotificationEventMessage =
    NotificationEventMessage(
        schemaVersion = schemaVersion,
        eventId = UUID.fromString("11111111-1111-4111-8111-111111111111"),
        clubId = UUID.fromString("22222222-2222-4222-8222-222222222222"),
        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
        aggregateType = "SESSION",
        aggregateId = UUID.fromString("33333333-3333-4333-8333-333333333333"),
        occurredAt = OffsetDateTime.of(2026, 4, 29, 12, 0, 0, 0, ZoneOffset.UTC),
        payload = NotificationEventPayload(
            sessionId = UUID.fromString("33333333-3333-4333-8333-333333333333"),
        ),
    )
