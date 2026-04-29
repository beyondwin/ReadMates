package com.readmates.notification.adapter.`in`.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
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
}
