@file:Suppress("UNCHECKED_CAST")

package com.readmates.notification.adapter.out.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import com.readmates.notification.domain.NotificationEventType
import org.apache.kafka.clients.producer.ProducerConfig
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.kafka.core.DefaultKafkaProducerFactory
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.support.KafkaHeaders
import org.springframework.kafka.support.SendResult
import org.springframework.messaging.Message
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

class KafkaNotificationEventPublisherAdapterTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(
                NotificationKafkaConfiguration::class.java,
                KafkaPublisherAdapterTestConfiguration::class.java,
            ).withPropertyValues(
                "readmates.notifications.sender-email=no-reply@example.test",
                "readmates.notifications.sender-name=ReadMates",
            )

    @AfterEach
    fun clearInterrupt() {
        Thread.interrupted()
    }

    @Test
    fun `kafka-only properties registration rejects enabled notifications without sender`() {
        ApplicationContextRunner()
            .withUserConfiguration(NotificationKafkaConfiguration::class.java)
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                assertThat(context).hasFailed()
                assertThat(context.startupFailure)
                    .hasRootCauseMessage("readmates.notifications.sender-email must not be blank")
            }
    }

    @Test
    fun `producer factory uses notification bootstrap servers`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092,kafka-b:9092",
            ).run { context ->
                assertThat(context).hasSingleBean(NotificationKafkaProperties::class.java)
                assertThat(context).hasSingleBean(NotificationEventPublisherPort::class.java)
                assertThat(context).hasBean("notificationEventProducerFactory")
                assertThat(context).hasBean("notificationEventKafkaTemplate")

                val factory =
                    context.getBean(
                        "notificationEventProducerFactory",
                        DefaultKafkaProducerFactory::class.java,
                    )

                assertThat(factory.configurationProperties[ProducerConfig.BOOTSTRAP_SERVERS_CONFIG])
                    .isEqualTo(listOf("kafka-a:9092", "kafka-b:9092"))
                assertThat(factory.configurationProperties[ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG]).isEqualTo(true)
                assertThat(factory.configurationProperties[ProducerConfig.ACKS_CONFIG]).isEqualTo("all")
                assertThat(factory.configurationProperties[ProducerConfig.RETRIES_CONFIG]).isEqualTo(Int.MAX_VALUE)
                assertThat(factory.configurationProperties[ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION])
                    .isEqualTo(5)
            }
    }

    @Test
    fun `publisher adapter component autowires notification kafka dependencies`() {
        ApplicationContextRunner()
            .withUserConfiguration(
                NotificationKafkaConfiguration::class.java,
                KafkaNotificationEventPublisherAdapter::class.java,
            ).withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.sender-email=no-reply@example.test",
                "readmates.notifications.sender-name=ReadMates",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                assertThat(context).hasSingleBean(NotificationEventPublisherPort::class.java)
            }
    }

    @Test
    fun `producer configuration owns no consumer beans`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                assertThat(context).doesNotHaveBean("notificationEventConsumerFactory")
                assertThat(context).doesNotHaveBean("notificationKafkaListenerContainerFactory")
                assertThat(context).doesNotHaveBean("notificationEventDeadLetterPublishingRecoverer")
                assertThat(context).doesNotHaveBean("notificationKafkaErrorHandler")
            }
    }

    @Test
    fun `kafka beans require global notifications and kafka notifications enabled`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=false",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                assertThat(context).doesNotHaveBean(NotificationKafkaProperties::class.java)
                assertThat(context).doesNotHaveBean(NotificationEventPublisherPort::class.java)
                assertThat(context).doesNotHaveBean("notificationEventProducerFactory")
            }
    }

    @Test
    fun `one millisecond Kafka timings reach the publisher and retry handler exactly`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
                "readmates.notifications.kafka.send-timeout=1ms",
            ).run { context ->
                assertThat(context).hasNotFailed()
                val properties = context.getBean(NotificationKafkaProperties::class.java)

                assertThat(properties.sendTimeout).isEqualTo(Duration.ofMillis(1))
            }

        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        val sendFuture = RecordingKafkaSendFuture()
        Mockito.`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>())).thenReturn(sendFuture)

        KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(1)).publish(
            notificationEventMessage(),
            topic = "readmates.notification.events.v1",
            key = "club-key",
            requestId = "req-abc-123",
        )

        assertThat(sendFuture.timeout).isEqualTo(1)
        assertThat(sendFuture.unit).isEqualTo(TimeUnit.MILLISECONDS)
    }

    @Test
    fun `producer value serializer writes design JSON with string temporals`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val factory =
                    context.getBean(
                        "notificationEventProducerFactory",
                        DefaultKafkaProducerFactory::class.java,
                    ) as DefaultKafkaProducerFactory<String, NotificationEventMessage>
                val valueSerializerSupplier = factory.valueSerializerSupplier

                assertThat(valueSerializerSupplier).isNotNull
                val json =
                    String(
                        valueSerializerSupplier!!.get()!!.serialize(
                            "readmates.notification.events.v1",
                            notificationEventMessage(
                                payload =
                                    NotificationEventPayload(
                                        sessionId = UUID.fromString("00000000-0000-0000-0000-000000000003"),
                                        targetDate = LocalDate.of(2026, 4, 30),
                                    ),
                            ),
                        ),
                        StandardCharsets.UTF_8,
                    )

                assertThat(json).contains(
                    """"schemaVersion":1""",
                    """"eventId":"00000000-0000-0000-0000-000000000001"""",
                    """"clubId":"00000000-0000-0000-0000-000000000002"""",
                    """"clubSlug":"reading-sai"""",
                    """"eventType":"NEXT_BOOK_PUBLISHED"""",
                    """"aggregateType":"SESSION"""",
                    """"aggregateId":"00000000-0000-0000-0000-000000000003"""",
                    """"occurredAt":"2026-04-29T00:00:00Z"""",
                    """"payload"""",
                    """"targetDate":"2026-04-30"""",
                )
                assertThat(json).doesNotContain(
                    """"occurredAt":1777420800""",
                    """"targetDate":[2026,4,30]""",
                )
            }
    }

    @Test
    fun `publisher sends headers and waits with configured timeout`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        val sendFuture = RecordingKafkaSendFuture()
        Mockito.`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>())).thenReturn(sendFuture)
        val adapter = KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(250))
        val message = notificationEventMessage()

        adapter.publish(
            message,
            topic = "readmates.notification.events.v1",
            key = "club-key",
            requestId = "req-abc-123",
        )

        assertThat(sendFuture.timeout).isEqualTo(250)
        assertThat(sendFuture.unit).isEqualTo(TimeUnit.MILLISECONDS)
        val captor = ArgumentCaptor.forClass(Message::class.java) as ArgumentCaptor<Message<NotificationEventMessage>>
        Mockito.verify(kafkaTemplate).send(captor.capture())
        assertThat(captor.value.payload).isEqualTo(message)
        assertThat(captor.value.headers[KafkaHeaders.TOPIC]).isEqualTo("readmates.notification.events.v1")
        assertThat(captor.value.headers[KafkaHeaders.KEY]).isEqualTo("club-key")
        assertThat(captor.value.headers["readmates-schema-version"]).isEqualTo("1")
        assertThat(captor.value.headers["readmates-event-id"]).isEqualTo(message.eventId.toString())
        assertThat(captor.value.headers["readmates-event-type"]).isEqualTo(message.eventType.name)
    }

    @Test
    fun `publish sets readmates-request-id header when requestId is provided`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        Mockito
            .`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>()))
            .thenReturn(RecordingKafkaSendFuture())
        val adapter = KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(250))

        adapter.publish(
            notificationEventMessage(),
            topic = "readmates.notification.events.v1",
            key = "club-key",
            requestId = "test-req-1234",
        )

        val captor = ArgumentCaptor.forClass(Message::class.java) as ArgumentCaptor<Message<NotificationEventMessage>>
        Mockito.verify(kafkaTemplate).send(captor.capture())
        assertThat(captor.value.headers["readmates-request-id"]).isEqualTo("test-req-1234")
    }

    @Test
    fun `publish sets readmates-request-id to unknown when requestId is null`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        Mockito
            .`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>()))
            .thenReturn(RecordingKafkaSendFuture())
        val adapter = KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(250))

        adapter.publish(
            notificationEventMessage(),
            topic = "readmates.notification.events.v1",
            key = "club-key",
            requestId = null,
        )

        val captor = ArgumentCaptor.forClass(Message::class.java) as ArgumentCaptor<Message<NotificationEventMessage>>
        Mockito.verify(kafkaTemplate).send(captor.capture())
        assertThat(captor.value.headers["readmates-request-id"]).isEqualTo("unknown")
    }

    @Test
    fun `publisher wraps send timeout in meaningful exception`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        Mockito
            .`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>()))
            .thenReturn(RecordingKafkaSendFuture(timeoutFailure = TimeoutException("timed out")))
        val adapter = KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(10))

        assertThatThrownBy {
            adapter.publish(notificationEventMessage(), topic = "topic", key = "key", requestId = "req-1")
        }.isInstanceOf(NotificationKafkaPublishException::class.java)
            .hasMessageContaining("Timed out publishing notification event")
            .hasCauseInstanceOf(TimeoutException::class.java)
    }

    @Test
    fun `publisher wraps synchronous send failure in meaningful exception`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        Mockito
            .`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>()))
            .thenThrow(IllegalStateException("producer closed"))
        val adapter = KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(10))

        assertThatThrownBy {
            adapter.publish(notificationEventMessage(), topic = "topic", key = "key", requestId = "req-1")
        }.isInstanceOf(NotificationKafkaPublishException::class.java)
            .hasMessageContaining("Failed publishing notification event")
            .hasCauseInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun `publisher preserves interrupt status when interrupted`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        Mockito
            .`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>()))
            .thenReturn(RecordingKafkaSendFuture(interruptFailure = InterruptedException("interrupted")))
        val adapter = KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(10))

        assertThatThrownBy {
            adapter.publish(notificationEventMessage(), topic = "topic", key = "key", requestId = "req-1")
        }.isInstanceOf(NotificationKafkaPublishException::class.java)
            .hasMessageContaining("Interrupted publishing notification event")
            .hasCauseInstanceOf(InterruptedException::class.java)

        assertThat(Thread.currentThread().isInterrupted).isTrue()
    }
}

@TestConfiguration
private class KafkaPublisherAdapterTestConfiguration {
    @Bean
    @ConditionalOnBean(KafkaTemplate::class)
    fun kafkaNotificationEventPublisherAdapter(
        @Qualifier("notificationEventKafkaTemplate")
        kafkaTemplate: KafkaTemplate<String, NotificationEventMessage>,
        properties: NotificationKafkaProperties,
    ): NotificationEventPublisherPort = KafkaNotificationEventPublisherAdapter(kafkaTemplate, properties)
}

private class RecordingKafkaSendFuture(
    private val timeoutFailure: TimeoutException? = null,
    private val interruptFailure: InterruptedException? = null,
) : CompletableFuture<SendResult<String, NotificationEventMessage>>() {
    var timeout: Long? = null
        private set
    var unit: TimeUnit? = null
        private set

    override fun get(
        timeout: Long,
        unit: TimeUnit,
    ): SendResult<String, NotificationEventMessage> {
        this.timeout = timeout
        this.unit = unit
        timeoutFailure?.let { throw it }
        interruptFailure?.let { throw it }
        return Mockito.mock(SendResult::class.java) as SendResult<String, NotificationEventMessage>
    }
}

private fun notificationEventMessage(
    payload: NotificationEventPayload =
        NotificationEventPayload(sessionId = UUID.fromString("00000000-0000-0000-0000-000000000003")),
): NotificationEventMessage =
    NotificationEventMessage(
        eventId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
        clubSlug = "reading-sai",
        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
        aggregateType = "SESSION",
        aggregateId = UUID.fromString("00000000-0000-0000-0000-000000000003"),
        occurredAt = OffsetDateTime.of(2026, 4, 29, 0, 0, 0, 0, ZoneOffset.UTC),
        payload = payload,
    )
