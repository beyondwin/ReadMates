package com.readmates.notification.adapter.`in`.kafka

import com.readmates.notification.adapter.`in`.scheduler.NotificationEventRelayScheduler
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.service.NotificationRelayService
import com.readmates.notification.adapter.out.kafka.KafkaNotificationEventPublisherAdapter
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.annotation.KafkaListener

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

    private fun Class<*>.requiredEnabledProperties(): List<String> =
        getAnnotationsByType(ConditionalOnProperty::class.java)
            .filter { it.havingValue == "true" }
            .flatMap { annotation ->
                annotation.name.map { name ->
                    listOf(annotation.prefix, name).filter(String::isNotBlank).joinToString(".")
                }
            }
}
