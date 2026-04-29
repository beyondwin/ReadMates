@file:Suppress("UNCHECKED_CAST")

package com.readmates.notification.adapter.out.kafka

import com.readmates.notification.adapter.`in`.kafka.NotificationUnsupportedSchemaVersionException
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.application.port.out.NotificationEventPublisherPort
import com.readmates.notification.application.service.NotificationDeliveryRetryableException
import com.readmates.notification.domain.NotificationEventType
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.ConsumerRecord
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.kafka.clients.producer.ProducerRecord
import org.apache.kafka.common.header.internals.RecordHeaders
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
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory
import org.springframework.kafka.core.DefaultKafkaConsumerFactory
import org.springframework.kafka.core.DefaultKafkaProducerFactory
import org.springframework.kafka.core.KafkaOperations
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.listener.CommonErrorHandler
import org.springframework.kafka.listener.DefaultErrorHandler
import org.springframework.kafka.listener.ExceptionClassifier
import org.springframework.kafka.listener.ListenerExecutionFailedException
import org.springframework.kafka.support.ExceptionMatcher
import org.springframework.kafka.support.KafkaHeaders
import org.springframework.kafka.support.SendResult
import org.springframework.kafka.support.serializer.ErrorHandlingDeserializer
import org.springframework.kafka.support.serializer.SerializationUtils
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
    private val contextRunner = ApplicationContextRunner()
        .withUserConfiguration(
            NotificationKafkaConfiguration::class.java,
            KafkaPublisherAdapterTestConfiguration::class.java,
        )

    @AfterEach
    fun clearInterrupt() {
        Thread.interrupted()
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

                val factory = context.getBean(
                    "notificationEventProducerFactory",
                    DefaultKafkaProducerFactory::class.java,
                )

                assertThat(factory.configurationProperties[ProducerConfig.BOOTSTRAP_SERVERS_CONFIG])
                    .isEqualTo(listOf("kafka-a:9092", "kafka-b:9092"))
            }
    }

    @Test
    fun `consumer factory uses notification bootstrap servers and consumer group`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092,kafka-b:9092",
                "readmates.notifications.kafka.consumer-group=notification-workers",
                "readmates.notifications.kafka.dlq-topic=readmates.notification.events.dlq.v1",
            ).run { context ->
                assertThat(context).hasBean("notificationEventConsumerFactory")
                assertThat(context).hasBean("notificationKafkaListenerContainerFactory")
                assertThat(context).hasBean("notificationEventDeadLetterPublishingRecoverer")
                assertThat(context).hasBean("notificationKafkaErrorHandler")

                val consumerFactory = context.getBean(
                    "notificationEventConsumerFactory",
                    DefaultKafkaConsumerFactory::class.java,
                )

                assertThat(consumerFactory.configurationProperties[ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG])
                    .isEqualTo(listOf("kafka-a:9092", "kafka-b:9092"))
                assertThat(consumerFactory.configurationProperties[ConsumerConfig.GROUP_ID_CONFIG])
                    .isEqualTo("notification-workers")
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
                assertThat(context).doesNotHaveBean("notificationEventConsumerFactory")
                assertThat(context).doesNotHaveBean("notificationKafkaListenerContainerFactory")
            }
    }

    @Test
    fun `listener container factory uses notification error handler`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val factory = context.getBean(
                    "notificationKafkaListenerContainerFactory",
                    ConcurrentKafkaListenerContainerFactory::class.java,
                ) as ConcurrentKafkaListenerContainerFactory<String, NotificationEventMessage>
                val errorHandler = context.getBean(
                    "notificationKafkaErrorHandler",
                    CommonErrorHandler::class.java,
                )

                val container = factory.createContainer("readmates.notification.events.v1")

                assertThat(container.commonErrorHandler).isSameAs(errorHandler)
            }
    }

    @Test
    fun `error handler is configured for bounded retry before dead letter publishing`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val errorHandler = context.getBean("notificationKafkaErrorHandler", CommonErrorHandler::class.java)
                val properties = context.getBean(NotificationKafkaProperties::class.java)

                assertThat(errorHandler).isInstanceOf(DefaultErrorHandler::class.java)
                assertThat(properties.deliveryRetryBackoff).isEqualTo(Duration.ofMinutes(5))
                assertThat(properties.deliveryRetryMaxAttempts).isEqualTo(72)
            }
    }

    @Test
    fun `error handler treats generic consumer processing failures as retryable`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val errorHandler = context.getBean("notificationKafkaErrorHandler", DefaultErrorHandler::class.java)
                val exceptionMatcher = errorHandler.exceptionMatcher()

                assertThat(exceptionMatcher.match(RuntimeException("database temporarily unavailable"))).isTrue()
                assertThat(
                    exceptionMatcher.match(
                        ListenerExecutionFailedException(
                            "listener failed",
                            RuntimeException("database temporarily unavailable"),
                        ),
                    ),
                ).isTrue()
                assertThat(exceptionMatcher.match(NotificationDeliveryRetryableException("email provider unavailable")))
                    .isTrue()
            }
    }

    @Test
    fun `error handler treats unsupported notification schema as non retryable`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val errorHandler = context.getBean("notificationKafkaErrorHandler", DefaultErrorHandler::class.java)
                val exceptionMatcher = errorHandler.exceptionMatcher()

                assertThat(
                    exceptionMatcher.match(
                        NotificationUnsupportedSchemaVersionException(
                            schemaVersion = 2,
                        ),
                    ),
                ).isFalse()
                assertThat(
                    exceptionMatcher.match(
                        ListenerExecutionFailedException(
                            "listener failed",
                            NotificationUnsupportedSchemaVersionException(schemaVersion = 2),
                        ),
                    ),
                ).isFalse()
            }
    }

    @Test
    fun `dead letter recoverer publishes to configured notification dlq topic`() {
        val kafkaOperations =
            Mockito.mock(KafkaOperations::class.java) as KafkaOperations<String, NotificationEventMessage>
        Mockito.`when`(kafkaOperations.isTransactional).thenReturn(false)
        Mockito.`when`(kafkaOperations.send(Mockito.any<ProducerRecord<String, NotificationEventMessage>>()))
            .thenReturn(
                CompletableFuture.completedFuture(
                    Mockito.mock(SendResult::class.java) as SendResult<String, NotificationEventMessage>,
                ),
            )
        val recoverer = NotificationKafkaConfiguration().notificationEventDeadLetterPublishingRecoverer(
            kafkaOperations,
            NotificationKafkaProperties(
                bootstrapServers = listOf("kafka-a:9092"),
                dlqTopic = "custom.notification.dlq.v1",
            ),
        )
        val record = ConsumerRecord(
            "readmates.notification.events.v1",
            2,
            42L,
            "club-key",
            notificationEventMessage(),
        )

        recoverer.accept(record, null, IllegalArgumentException("unsupported schema"))

        val captor = ArgumentCaptor.forClass(ProducerRecord::class.java)
            as ArgumentCaptor<ProducerRecord<String, NotificationEventMessage>>
        Mockito.verify(kafkaOperations).send(captor.capture())
        val partition: Int? = captor.value.partition()
        assertThat(captor.value.topic()).isEqualTo("custom.notification.dlq.v1")
        assertThat(partition).isNull()
        assertThat(captor.value.key()).isEqualTo("club-key")
        assertThat(captor.value.value()).isEqualTo(record.value())
    }

    @Test
    fun `producer value serializer writes design JSON with string temporals`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val factory = context.getBean(
                    "notificationEventProducerFactory",
                    DefaultKafkaProducerFactory::class.java,
                ) as DefaultKafkaProducerFactory<String, NotificationEventMessage>
                val valueSerializerSupplier = factory.valueSerializerSupplier

                assertThat(valueSerializerSupplier).isNotNull
                val json = String(
                    valueSerializerSupplier!!.get()!!.serialize(
                        "readmates.notification.events.v1",
                        notificationEventMessage(
                            payload = NotificationEventPayload(
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
                    """"eventType":"NEXT_BOOK_PUBLISHED"""",
                    """"aggregateType":"session"""",
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
    fun `consumer value deserializer wraps JSON deserialization errors for listener error handling`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val factory = context.getBean(
                    "notificationEventConsumerFactory",
                    DefaultKafkaConsumerFactory::class.java,
                ) as DefaultKafkaConsumerFactory<String, NotificationEventMessage>
                val headers = RecordHeaders()

                val deserializer = factory.valueDeserializer
                val result = deserializer!!.deserialize(
                    "readmates.notification.events.v1",
                    headers,
                    """{"schemaVersion":""".toByteArray(StandardCharsets.UTF_8),
                )

                assertThat(deserializer).isInstanceOf(ErrorHandlingDeserializer::class.java)
                assertThat(result).isNull()
                assertThat(headers.lastHeader(SerializationUtils.VALUE_DESERIALIZER_EXCEPTION_HEADER)).isNotNull
            }
    }

    @Test
    fun `publisher sends headers and waits with configured timeout`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        val sendFuture = RecordingKafkaSendFuture()
        Mockito.`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>())).thenReturn(sendFuture)
        val adapter = KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(250))
        val message = notificationEventMessage()

        adapter.publish(message, topic = "readmates.notification.events.v1", key = "club-key")

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
    fun `publisher wraps send timeout in meaningful exception`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        Mockito.`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>()))
            .thenReturn(RecordingKafkaSendFuture(timeoutFailure = TimeoutException("timed out")))
        val adapter = KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(10))

        assertThatThrownBy {
            adapter.publish(notificationEventMessage(), topic = "topic", key = "key")
        }.isInstanceOf(NotificationKafkaPublishException::class.java)
            .hasMessageContaining("Timed out publishing notification event")
            .hasCauseInstanceOf(TimeoutException::class.java)
    }

    @Test
    fun `publisher wraps synchronous send failure in meaningful exception`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        Mockito.`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>()))
            .thenThrow(IllegalStateException("producer closed"))
        val adapter = KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(10))

        assertThatThrownBy {
            adapter.publish(notificationEventMessage(), topic = "topic", key = "key")
        }.isInstanceOf(NotificationKafkaPublishException::class.java)
            .hasMessageContaining("Failed publishing notification event")
            .hasCauseInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun `publisher preserves interrupt status when interrupted`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
        Mockito.`when`(kafkaTemplate.send(Mockito.any<Message<NotificationEventMessage>>()))
            .thenReturn(RecordingKafkaSendFuture(interruptFailure = InterruptedException("interrupted")))
        val adapter = KafkaNotificationEventPublisherAdapter(kafkaTemplate, Duration.ofMillis(10))

        assertThatThrownBy {
            adapter.publish(notificationEventMessage(), topic = "topic", key = "key")
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

    override fun get(timeout: Long, unit: TimeUnit): SendResult<String, NotificationEventMessage> {
        this.timeout = timeout
        this.unit = unit
        timeoutFailure?.let { throw it }
        interruptFailure?.let { throw it }
        return Mockito.mock(SendResult::class.java) as SendResult<String, NotificationEventMessage>
    }
}

private fun DefaultErrorHandler.exceptionMatcher(): ExceptionMatcher {
    val method = ExceptionClassifier::class.java.getDeclaredMethod("getExceptionMatcher")
    method.isAccessible = true
    return method.invoke(this) as ExceptionMatcher
}

private fun notificationEventMessage(
    payload: NotificationEventPayload =
        NotificationEventPayload(sessionId = UUID.fromString("00000000-0000-0000-0000-000000000003")),
): NotificationEventMessage =
    NotificationEventMessage(
        eventId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
        aggregateType = "session",
        aggregateId = UUID.fromString("00000000-0000-0000-0000-000000000003"),
        occurredAt = OffsetDateTime.of(2026, 4, 29, 0, 0, 0, 0, ZoneOffset.UTC),
        payload = payload,
    )
