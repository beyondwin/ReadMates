@file:Suppress("ktlint:standard:package-name")

package com.readmates.notification.adapter.`in`.kafka

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.NotificationDeliveryRetryableException
import com.readmates.notification.application.model.NotificationEventMessage
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.common.TopicPartition
import org.apache.kafka.common.serialization.Deserializer
import org.apache.kafka.common.serialization.StringDeserializer
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory
import org.springframework.kafka.core.ConsumerFactory
import org.springframework.kafka.core.DefaultKafkaConsumerFactory
import org.springframework.kafka.core.KafkaOperations
import org.springframework.kafka.listener.CommonErrorHandler
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer
import org.springframework.kafka.listener.DefaultErrorHandler
import org.springframework.kafka.support.JacksonMapperUtils
import org.springframework.kafka.support.serializer.ErrorHandlingDeserializer
import org.springframework.kafka.support.serializer.JacksonJsonDeserializer
import org.springframework.util.backoff.FixedBackOff
import tools.jackson.databind.json.JsonMapper

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
@EnableConfigurationProperties(NotificationRuntimeProperties::class)
class NotificationKafkaConsumerConfiguration {
    @Bean
    fun notificationEventConsumerFactory(properties: NotificationRuntimeProperties): NotificationEventConsumerFactory =
        DefaultKafkaConsumerFactory(
            notificationConsumerConfigs(properties.kafka),
            { StringDeserializer() },
            { notificationEventValueDeserializer() },
        )

    @Bean
    fun notificationEventDeadLetterPublishingRecoverer(
        @Qualifier("notificationEventKafkaTemplate")
        kafkaOperations: KafkaOperations<String, NotificationEventMessage>,
        properties: NotificationRuntimeProperties,
    ): DeadLetterPublishingRecoverer =
        DeadLetterPublishingRecoverer(kafkaOperations) { record, _ ->
            TopicPartition(properties.kafka.dlqTopic, record.partition())
        }

    @Bean
    fun notificationKafkaErrorHandler(
        @Qualifier("notificationEventDeadLetterPublishingRecoverer")
        recoverer: DeadLetterPublishingRecoverer,
        properties: NotificationRuntimeProperties,
    ): CommonErrorHandler =
        DefaultErrorHandler(
            recoverer,
            FixedBackOff(
                properties.kafka.deliveryRetryBackoff.toMillis(),
                properties.kafka.deliveryRetryMaxAttempts,
            ),
        ).also {
            it.addRetryableExceptions(NotificationDeliveryRetryableException::class.java)
            it.addNotRetryableExceptions(NotificationUnsupportedSchemaVersionException::class.java)
        }

    @Bean
    fun notificationKafkaListenerContainerFactory(
        @Qualifier("notificationEventConsumerFactory")
        consumerFactory: ConsumerFactory<String, NotificationEventMessage>,
        @Qualifier("notificationKafkaErrorHandler")
        errorHandler: CommonErrorHandler,
    ): ConcurrentKafkaListenerContainerFactory<String, NotificationEventMessage> =
        ConcurrentKafkaListenerContainerFactory<String, NotificationEventMessage>().also {
            it.setConsumerFactory(consumerFactory)
            it.setCommonErrorHandler(errorHandler)
        }

    private fun notificationConsumerConfigs(properties: NotificationRuntimeProperties.Kafka): Map<String, Any> {
        val bootstrapServers = properties.bootstrapServers.map(String::trim).filter(String::isNotEmpty)
        require(bootstrapServers.isNotEmpty()) {
            "readmates.notifications.kafka.bootstrap-servers must be set " +
                "when readmates.notifications.kafka.enabled=true"
        }
        require(properties.consumerGroup.isNotBlank()) {
            "readmates.notifications.kafka.consumer-group must be set when readmates.notifications.kafka.enabled=true"
        }

        return mapOf(
            ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers,
            ConsumerConfig.GROUP_ID_CONFIG to properties.consumerGroup,
            ConsumerConfig.AUTO_OFFSET_RESET_CONFIG to "earliest",
            ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG to false,
            ConsumerConfig.ISOLATION_LEVEL_CONFIG to "read_committed",
        )
    }

    private fun notificationEventValueDeserializer(): Deserializer<NotificationEventMessage> =
        ErrorHandlingDeserializer(notificationEventJsonValueDeserializer())

    private fun notificationEventJsonValueDeserializer(): Deserializer<NotificationEventMessage> =
        JacksonJsonDeserializer(
            NotificationEventMessage::class.java,
            notificationEventJsonMapper(),
            false,
        )

    private fun notificationEventJsonMapper(): JsonMapper = JacksonMapperUtils.enhancedJsonMapper()
}

private typealias NotificationEventConsumerFactory = ConsumerFactory<String, NotificationEventMessage>
