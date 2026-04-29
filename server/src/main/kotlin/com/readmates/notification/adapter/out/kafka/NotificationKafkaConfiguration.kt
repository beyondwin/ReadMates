package com.readmates.notification.adapter.out.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.kafka.common.TopicPartition
import org.apache.kafka.common.serialization.Deserializer
import org.apache.kafka.common.serialization.Serializer
import org.apache.kafka.common.serialization.StringDeserializer
import org.apache.kafka.common.serialization.StringSerializer
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory
import org.springframework.kafka.core.ConsumerFactory
import org.springframework.kafka.core.DefaultKafkaConsumerFactory
import org.springframework.kafka.core.DefaultKafkaProducerFactory
import org.springframework.kafka.core.KafkaOperations
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.core.ProducerFactory
import org.springframework.kafka.listener.CommonErrorHandler
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer
import org.springframework.kafka.listener.DefaultErrorHandler
import org.springframework.kafka.support.JacksonMapperUtils
import org.springframework.kafka.support.serializer.JacksonJsonDeserializer
import org.springframework.kafka.support.serializer.JacksonJsonSerializer
import org.springframework.util.backoff.FixedBackOff
import tools.jackson.databind.json.JsonMapper
import java.time.Duration

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
@EnableConfigurationProperties(NotificationKafkaProperties::class)
class NotificationKafkaConfiguration {
    @Bean
    fun notificationEventProducerFactory(
        properties: NotificationKafkaProperties,
    ): ProducerFactory<String, NotificationEventMessage> =
        DefaultKafkaProducerFactory(
            notificationProducerConfigs(properties),
            { StringSerializer() },
            { notificationEventValueSerializer() },
        )

    @Bean
    fun notificationEventKafkaTemplate(
        @Qualifier("notificationEventProducerFactory")
        notificationEventProducerFactory: ProducerFactory<String, NotificationEventMessage>,
    ): KafkaTemplate<String, NotificationEventMessage> =
        KafkaTemplate(notificationEventProducerFactory)

    @Bean
    fun notificationEventConsumerFactory(
        properties: NotificationKafkaProperties,
    ): ConsumerFactory<String, NotificationEventMessage> =
        DefaultKafkaConsumerFactory(
            notificationConsumerConfigs(properties),
            { StringDeserializer() },
            { notificationEventValueDeserializer() },
        )

    @Bean
    fun notificationEventDeadLetterPublishingRecoverer(
        @Qualifier("notificationEventKafkaTemplate")
        kafkaOperations: KafkaOperations<String, NotificationEventMessage>,
        properties: NotificationKafkaProperties,
    ): DeadLetterPublishingRecoverer =
        DeadLetterPublishingRecoverer(kafkaOperations) { _, _ ->
            TopicPartition(properties.dlqTopic, NO_PARTITION)
        }.also {
            it.setVerifyPartition(false)
        }

    @Bean
    fun notificationKafkaErrorHandler(
        @Qualifier("notificationEventDeadLetterPublishingRecoverer")
        recoverer: DeadLetterPublishingRecoverer,
    ): CommonErrorHandler =
        DefaultErrorHandler(recoverer, FixedBackOff(NO_INTERVAL, NO_RETRIES))

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

    private fun notificationProducerConfigs(properties: NotificationKafkaProperties): Map<String, Any> {
        val bootstrapServers = properties.bootstrapServers.map(String::trim).filter(String::isNotEmpty)
        require(bootstrapServers.isNotEmpty()) {
            "readmates.notifications.kafka.bootstrap-servers must be set when readmates.notifications.kafka.enabled=true"
        }

        return mapOf(
            ProducerConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers,
        )
    }

    private fun notificationConsumerConfigs(properties: NotificationKafkaProperties): Map<String, Any> {
        val bootstrapServers = properties.bootstrapServers.map(String::trim).filter(String::isNotEmpty)
        require(bootstrapServers.isNotEmpty()) {
            "readmates.notifications.kafka.bootstrap-servers must be set when readmates.notifications.kafka.enabled=true"
        }
        require(properties.consumerGroup.isNotBlank()) {
            "readmates.notifications.kafka.consumer-group must be set when readmates.notifications.kafka.enabled=true"
        }

        return mapOf(
            ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers,
            ConsumerConfig.GROUP_ID_CONFIG to properties.consumerGroup,
        )
    }

    private fun notificationEventValueSerializer(): Serializer<NotificationEventMessage> =
        JacksonJsonSerializer<NotificationEventMessage>(notificationEventJsonMapper()).noTypeInfo()

    private fun notificationEventValueDeserializer(): Deserializer<NotificationEventMessage> =
        JacksonJsonDeserializer(
            NotificationEventMessage::class.java,
            notificationEventJsonMapper(),
            false,
        )

    private fun notificationEventJsonMapper(): JsonMapper =
        JacksonMapperUtils.enhancedJsonMapper()

    private companion object {
        private const val NO_PARTITION = -1
        private const val NO_INTERVAL = 0L
        private const val NO_RETRIES = 0L
    }
}

@ConfigurationProperties(prefix = "readmates.notifications.kafka")
data class NotificationKafkaProperties(
    val bootstrapServers: List<String> = emptyList(),
    val sendTimeout: Duration = Duration.ofSeconds(10),
    val dlqTopic: String = "readmates.notification.events.dlq.v1",
    val consumerGroup: String = "readmates-notification-dispatcher",
)
