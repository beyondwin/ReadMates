@file:Suppress("UNCHECKED_CAST")

package com.readmates.notification.adapter.`in`.kafka

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.NotificationDeliveryRetryableException
import com.readmates.notification.application.model.NotificationEventMessage
import com.readmates.notification.application.model.NotificationEventPayload
import com.readmates.notification.domain.NotificationEventType
import org.apache.kafka.clients.consumer.Consumer
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.ConsumerRecord
import org.apache.kafka.clients.producer.ProducerRecord
import org.apache.kafka.common.PartitionInfo
import org.apache.kafka.common.header.internals.RecordHeaders
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory
import org.springframework.kafka.core.DefaultKafkaConsumerFactory
import org.springframework.kafka.core.KafkaOperations
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.listener.CommonErrorHandler
import org.springframework.kafka.listener.DefaultErrorHandler
import org.springframework.kafka.listener.ExceptionClassifier
import org.springframework.kafka.listener.ListenerExecutionFailedException
import org.springframework.kafka.listener.MessageListenerContainer
import org.springframework.kafka.support.ExceptionMatcher
import org.springframework.kafka.support.SendResult
import org.springframework.kafka.support.serializer.ErrorHandlingDeserializer
import org.springframework.kafka.support.serializer.SerializationUtils
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.CompletableFuture

class NotificationKafkaConsumerConfigurationTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(
                NotificationKafkaConsumerConfiguration::class.java,
                NotificationKafkaConsumerConfigurationTestSupport::class.java,
            ).withPropertyValues(
                "readmates.notifications.sender-email=no-reply@example.test",
                "readmates.notifications.sender-name=ReadMates",
            )

    @Test
    fun `consumer factory uses current group manual commits read committed isolation and earliest reset`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092,kafka-b:9092",
                "readmates.notifications.kafka.consumer-group=notification-workers",
            ).run { context ->
                val consumerFactory =
                    context.getBean(
                        "notificationEventConsumerFactory",
                        DefaultKafkaConsumerFactory::class.java,
                    ) as DefaultKafkaConsumerFactory<String, NotificationEventMessage>

                assertThat(consumerFactory.configurationProperties[ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG])
                    .isEqualTo(listOf("kafka-a:9092", "kafka-b:9092"))
                assertThat(consumerFactory.configurationProperties[ConsumerConfig.GROUP_ID_CONFIG])
                    .isEqualTo("notification-workers")
                assertThat(consumerFactory.configurationProperties[ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG])
                    .isEqualTo(false)
                assertThat(consumerFactory.configurationProperties[ConsumerConfig.ISOLATION_LEVEL_CONFIG])
                    .isEqualTo("read_committed")
                assertThat(consumerFactory.configurationProperties[ConsumerConfig.AUTO_OFFSET_RESET_CONFIG])
                    .isEqualTo("earliest")
            }
    }

    @Test
    fun `consumer beans require global notifications and Kafka enabled`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=false",
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
    fun `listener container factory uses notification error handler identity`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val factory =
                    context.getBean(
                        "notificationKafkaListenerContainerFactory",
                        ConcurrentKafkaListenerContainerFactory::class.java,
                    ) as ConcurrentKafkaListenerContainerFactory<String, NotificationEventMessage>
                val errorHandler = context.getBean("notificationKafkaErrorHandler", CommonErrorHandler::class.java)

                assertThat(factory.createContainer("readmates.notification.events.v1").commonErrorHandler)
                    .isSameAs(errorHandler)
            }
    }

    @Test
    fun `error handler uses fixed delivery retry interval and max attempts`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val errorHandler = context.getBean("notificationKafkaErrorHandler", DefaultErrorHandler::class.java)
                val backOff = errorHandler.configuredBackOff()

                assertThat(backOff.interval).isEqualTo(Duration.ofMinutes(5).toMillis())
                assertThat(backOff.maxAttempts).isEqualTo(72)
            }
    }

    @Test
    fun `error handler treats delivery failures as retryable and unsupported schema as terminal`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val matcher = context.getBean("notificationKafkaErrorHandler", DefaultErrorHandler::class.java).exceptionMatcher()

                assertThat(matcher.match(NotificationDeliveryRetryableException("email provider unavailable"))).isTrue()
                assertThat(
                    matcher.match(
                        ListenerExecutionFailedException(
                            "listener failed",
                            NotificationDeliveryRetryableException("email provider unavailable"),
                        ),
                    ),
                ).isTrue()
                assertThat(matcher.match(NotificationUnsupportedSchemaVersionException(schemaVersion = 2))).isFalse()
                assertThat(
                    matcher.match(
                        ListenerExecutionFailedException(
                            "listener failed",
                            NotificationUnsupportedSchemaVersionException(schemaVersion = 2),
                        ),
                    ),
                ).isFalse()
            }
    }

    @Test
    fun `dead letter recoverer preserves configured topic and source partition`() {
        val kafkaOperations = Mockito.mock(KafkaOperations::class.java) as KafkaOperations<String, NotificationEventMessage>
        Mockito.`when`(kafkaOperations.isTransactional).thenReturn(false)
        Mockito
            .`when`(kafkaOperations.send(Mockito.any<ProducerRecord<String, NotificationEventMessage>>()))
            .thenReturn(
                CompletableFuture.completedFuture(
                    Mockito.mock(SendResult::class.java) as SendResult<String, NotificationEventMessage>,
                ),
            )
        val recoverer =
            NotificationKafkaConsumerConfiguration().notificationEventDeadLetterPublishingRecoverer(
                kafkaOperations,
                NotificationRuntimeProperties(
                    kafka =
                        NotificationRuntimeProperties.Kafka(
                            bootstrapServers = listOf("kafka-a:9092"),
                            dlqTopic = "custom.notification.dlq.v1",
                        ),
                ),
            )
        val record = ConsumerRecord("readmates.notification.events.v1", 2, 42L, "club-key", notificationEventMessage())
        val consumer = Mockito.mock(Consumer::class.java) as Consumer<String, NotificationEventMessage>
        Mockito
            .`when`(
                consumer.partitionsFor(
                    Mockito.eq("custom.notification.dlq.v1"),
                    Mockito.any(Duration::class.java),
                ),
            ).thenReturn(
                listOf(PartitionInfo("custom.notification.dlq.v1", 2, null, emptyArray(), emptyArray())),
            )

        recoverer.accept(record, consumer, IllegalArgumentException("unsupported schema"))

        val captor =
            ArgumentCaptor.forClass(ProducerRecord::class.java)
                as ArgumentCaptor<ProducerRecord<String, NotificationEventMessage>>
        Mockito.verify(kafkaOperations).send(captor.capture())
        assertThat(captor.value.topic()).isEqualTo("custom.notification.dlq.v1")
        assertThat(captor.value.partition()).isEqualTo(2)
        assertThat(captor.value.key()).isEqualTo("club-key")
        assertThat(captor.value.value()).isEqualTo(record.value())
    }

    @Test
    fun `retryable delivery is retried before exhaustion publishes to the configured DLT`() {
        val kafkaOperations = Mockito.mock(KafkaOperations::class.java) as KafkaOperations<String, NotificationEventMessage>
        Mockito.`when`(kafkaOperations.isTransactional).thenReturn(false)
        Mockito
            .`when`(kafkaOperations.send(Mockito.any<ProducerRecord<String, NotificationEventMessage>>()))
            .thenReturn(
                CompletableFuture.completedFuture(
                    Mockito.mock(SendResult::class.java) as SendResult<String, NotificationEventMessage>,
                ),
            )
        val properties =
            NotificationRuntimeProperties(
                kafka =
                    NotificationRuntimeProperties.Kafka(
                        bootstrapServers = listOf("kafka-a:9092"),
                        dlqTopic = "custom.notification.dlq.v1",
                        deliveryRetryBackoff = Duration.ofMillis(1),
                        deliveryRetryMaxAttempts = 1,
                    ),
            )
        val configuration = NotificationKafkaConsumerConfiguration()
        val recoverer = configuration.notificationEventDeadLetterPublishingRecoverer(kafkaOperations, properties)
        val errorHandler = configuration.notificationKafkaErrorHandler(recoverer, properties) as DefaultErrorHandler
        val record = ConsumerRecord("readmates.notification.events.v1", 2, 42L, "club-key", notificationEventMessage())
        val consumer = Mockito.mock(Consumer::class.java) as Consumer<String, NotificationEventMessage>
        Mockito
            .`when`(
                consumer.partitionsFor(
                    Mockito.eq("custom.notification.dlq.v1"),
                    Mockito.any(Duration::class.java),
                ),
            ).thenReturn(
                listOf(PartitionInfo("custom.notification.dlq.v1", 2, null, emptyArray(), emptyArray())),
            )
        val container = Mockito.mock(MessageListenerContainer::class.java)
        val failure = NotificationDeliveryRetryableException("email provider unavailable")

        assertThat(errorHandler.handleOne(failure, record, consumer, container)).isFalse()
        assertThat(errorHandler.handleOne(failure, record, consumer, container)).isTrue()

        val captor =
            ArgumentCaptor.forClass(ProducerRecord::class.java)
                as ArgumentCaptor<ProducerRecord<String, NotificationEventMessage>>
        Mockito.verify(kafkaOperations).send(captor.capture())
        assertThat(captor.value.topic()).isEqualTo("custom.notification.dlq.v1")
        assertThat(captor.value.partition()).isEqualTo(2)
        assertThat(captor.value.value()).isEqualTo(record.value())
    }

    @Test
    fun `consumer value deserializer accepts legacy JSON without club slug and wraps malformed JSON`() {
        contextRunner
            .withPropertyValues(
                "readmates.notifications.enabled=true",
                "readmates.notifications.kafka.enabled=true",
                "readmates.notifications.kafka.bootstrap-servers=kafka-a:9092",
            ).run { context ->
                val factory =
                    context.getBean(
                        "notificationEventConsumerFactory",
                        DefaultKafkaConsumerFactory::class.java,
                    ) as DefaultKafkaConsumerFactory<String, NotificationEventMessage>
                val result =
                    factory.valueDeserializer!!.deserialize(
                        "readmates.notification.events.v1",
                        """
                        {"schemaVersion":1,"eventId":"00000000-0000-0000-0000-000000000001","clubId":"00000000-0000-0000-0000-000000000002","eventType":"NEXT_BOOK_PUBLISHED","aggregateType":"SESSION","aggregateId":"00000000-0000-0000-0000-000000000003","occurredAt":"2026-04-29T00:00:00Z","payload":{"sessionId":"00000000-0000-0000-0000-000000000003"}}
                        """.trimIndent().toByteArray(StandardCharsets.UTF_8),
                    )
                val headers = RecordHeaders()
                val malformed =
                    factory.valueDeserializer!!.deserialize(
                        "readmates.notification.events.v1",
                        headers,
                        "{\"schemaVersion\":".toByteArray(StandardCharsets.UTF_8),
                    )

                assertThat(result).isNotNull
                assertThat(result!!.clubSlug).isNull()
                assertThat(result.clubId).isEqualTo(UUID.fromString("00000000-0000-0000-0000-000000000002"))
                assertThat(factory.valueDeserializer).isInstanceOf(ErrorHandlingDeserializer::class.java)
                assertThat(malformed).isNull()
                assertThat(headers.lastHeader(SerializationUtils.VALUE_DESERIALIZER_EXCEPTION_HEADER)).isNotNull
            }
    }
}

@TestConfiguration
private class NotificationKafkaConsumerConfigurationTestSupport {
    @Bean("notificationEventKafkaTemplate")
    fun notificationEventKafkaTemplate(): KafkaTemplate<String, NotificationEventMessage> =
        Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, NotificationEventMessage>
}

private fun DefaultErrorHandler.exceptionMatcher(): ExceptionMatcher {
    val method = ExceptionClassifier::class.java.getDeclaredMethod("getExceptionMatcher")
    method.isAccessible = true
    return method.invoke(this) as ExceptionMatcher
}

private fun DefaultErrorHandler.configuredBackOff(): org.springframework.util.backoff.FixedBackOff {
    val trackerField = org.springframework.kafka.listener.FailedRecordProcessor::class.java.getDeclaredField("failureTracker")
    trackerField.isAccessible = true
    val tracker = trackerField.get(this)
    val backOffField = tracker.javaClass.getDeclaredField("backOff")
    backOffField.isAccessible = true
    return backOffField.get(tracker) as org.springframework.util.backoff.FixedBackOff
}

private fun notificationEventMessage(): NotificationEventMessage =
    NotificationEventMessage(
        eventId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
        clubId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
        eventType = NotificationEventType.NEXT_BOOK_PUBLISHED,
        aggregateType = "SESSION",
        aggregateId = UUID.fromString("00000000-0000-0000-0000-000000000003"),
        occurredAt = OffsetDateTime.of(2026, 4, 29, 0, 0, 0, 0, ZoneOffset.UTC),
        payload = NotificationEventPayload(sessionId = UUID.fromString("00000000-0000-0000-0000-000000000003")),
    )
