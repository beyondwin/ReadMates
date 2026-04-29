package com.readmates.notification.kafka

import com.readmates.notification.adapter.`in`.kafka.NotificationEventKafkaListener
import com.readmates.notification.adapter.out.kafka.KafkaNotificationEventPublisherAdapter
import com.readmates.notification.adapter.out.kafka.NotificationKafkaConfiguration
import com.readmates.notification.adapter.out.kafka.NotificationKafkaProperties
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.`in`.DispatchNotificationEventUseCase
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import com.readmates.notification.domain.NotificationEventType
import com.readmates.support.KafkaTestContainer
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.SpringBootConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.kafka.annotation.EnableKafka
import org.springframework.kafka.config.KafkaListenerEndpointRegistry
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.test.utils.ContainerTestUtils
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.time.Duration
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

@SpringBootTest(
    classes = [
        NotificationKafkaPipelineIntegrationTest.TestApplication::class,
        NotificationKafkaConfiguration::class,
        NotificationEventKafkaListener::class,
        NotificationKafkaPipelineIntegrationTest.TestDispatchConfiguration::class,
    ],
    properties = [
        "readmates.notifications.enabled=true",
        "readmates.notifications.kafka.enabled=true",
        "readmates.notifications.kafka.delivery-retry-backoff=10ms",
        "readmates.notifications.kafka.delivery-retry-max-attempts=0",
    ],
)
class NotificationKafkaPipelineIntegrationTest(
    @param:Autowired
    private val notificationEventPublisherPort: NotificationEventPublisherPort,
    @param:Autowired private val recordingDispatchUseCase: RecordingDispatchNotificationEventUseCase,
    @param:Autowired private val kafkaListenerEndpointRegistry: KafkaListenerEndpointRegistry,
) {
    @BeforeEach
    fun resetDispatchRecorder() {
        recordingDispatchUseCase.clear()
    }

    @Test
    fun `published notification event is consumed and dispatched`() {
        val message = notificationEventMessage()
        waitForListenerAssignment()

        notificationEventPublisherPort.publish(message, eventsTopic, message.clubId.toString())

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                assertThat(recordingDispatchUseCase.receivedMessages()).containsExactly(message)
            }
    }

    private fun waitForListenerAssignment() {
        val listenerContainers = kafkaListenerEndpointRegistry.listenerContainers
        assertThat(listenerContainers).hasSize(1)
        ContainerTestUtils.waitForAssignment(listenerContainers.single(), 1)
    }

    @SpringBootConfiguration
    @EnableKafka
    class TestApplication

    @TestConfiguration(proxyBeanMethods = false)
    class TestDispatchConfiguration {
        @Bean
        fun recordingDispatchNotificationEventUseCase(): RecordingDispatchNotificationEventUseCase =
            RecordingDispatchNotificationEventUseCase()

        @Bean
        fun notificationEventPublisherPort(
            @Qualifier("notificationEventKafkaTemplate")
            kafkaTemplate: KafkaTemplate<String, NotificationEventMessage>,
            properties: NotificationKafkaProperties,
        ): NotificationEventPublisherPort = KafkaNotificationEventPublisherAdapter(kafkaTemplate, properties)
    }

    companion object {
        private val topicSuffix = UUID.randomUUID().toString()
        private val eventsTopic = "readmates.notification.events.pipeline.$topicSuffix"
        private val dlqTopic = "readmates.notification.events.pipeline.dlq.$topicSuffix"
        private val consumerGroup = "readmates-notification-pipeline-$topicSuffix"

        @JvmStatic
        @DynamicPropertySource
        fun registerKafkaProperties(registry: DynamicPropertyRegistry) {
            val bootstrapServers = KafkaTestContainer.container.bootstrapServers
            createTopic(bootstrapServers, eventsTopic)
            createTopic(bootstrapServers, dlqTopic)

            registry.add("readmates.notifications.kafka.bootstrap-servers") { bootstrapServers }
            registry.add("readmates.notifications.kafka.events-topic") { eventsTopic }
            registry.add("readmates.notifications.kafka.consumer-group") { consumerGroup }
            registry.add("readmates.notifications.kafka.dlq-topic") { dlqTopic }
        }

        private fun createTopic(bootstrapServers: String, topic: String) {
            AdminClient.create(
                mapOf(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers),
            ).use { adminClient ->
                adminClient.createTopics(listOf(NewTopic(topic, 1, 1.toShort())))
                    .all()
                    .get(10, TimeUnit.SECONDS)
            }
        }

        private fun notificationEventMessage(): NotificationEventMessage =
            NotificationEventMessage(
                eventId = UUID.fromString("11111111-1111-4111-8111-111111111111"),
                clubId = UUID.fromString("22222222-2222-4222-8222-222222222222"),
                eventType = NotificationEventType.SESSION_REMINDER_DUE,
                aggregateType = "SESSION",
                aggregateId = UUID.fromString("33333333-3333-4333-8333-333333333333"),
                occurredAt = OffsetDateTime.of(2026, 4, 29, 12, 0, 0, 0, ZoneOffset.UTC),
                payload = NotificationEventPayload(
                    sessionId = UUID.fromString("33333333-3333-4333-8333-333333333333"),
                    sessionNumber = 6,
                    bookTitle = "Example Book",
                    targetDate = LocalDate.of(2026, 5, 1),
                ),
            )
    }
}

class RecordingDispatchNotificationEventUseCase : DispatchNotificationEventUseCase {
    private val receivedMessages = CopyOnWriteArrayList<NotificationEventMessage>()

    override fun dispatch(message: NotificationEventMessage) {
        receivedMessages.add(message)
    }

    fun receivedMessages(): List<NotificationEventMessage> = receivedMessages.toList()

    fun clear() {
        receivedMessages.clear()
    }
}
