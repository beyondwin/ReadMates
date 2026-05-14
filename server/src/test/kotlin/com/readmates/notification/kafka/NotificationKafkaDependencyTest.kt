package com.readmates.notification.kafka

import com.readmates.support.KafkaTestContainer
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test

@Tag("integration")
@Tag("container")
class NotificationKafkaDependencyTest {
    @Test
    fun `kafka test container exposes bootstrap servers`() {
        assertThat(KafkaTestContainer.container.bootstrapServers).contains(":")
    }
}
