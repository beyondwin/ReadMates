package com.readmates.notification.adapter.out.kafka

import com.readmates.notification.application.config.NotificationRuntimeProperties
import com.readmates.notification.application.model.NotificationEventMessage
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.kafka.common.serialization.Serializer
import org.apache.kafka.common.serialization.StringSerializer
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.kafka.core.DefaultKafkaProducerFactory
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.core.ProducerFactory
import org.springframework.kafka.support.JacksonMapperUtils
import org.springframework.kafka.support.serializer.JacksonJsonSerializer
import tools.jackson.databind.json.JsonMapper

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "readmates.notifications", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
@EnableConfigurationProperties(NotificationRuntimeProperties::class)
class NotificationKafkaConfiguration {
    @Bean
    fun notificationKafkaProperties(properties: NotificationRuntimeProperties): NotificationKafkaProperties = properties.kafka

    @Bean
    fun notificationEventProducerFactory(properties: NotificationKafkaProperties): ProducerFactory<String, NotificationEventMessage> =
        DefaultKafkaProducerFactory(
            notificationProducerConfigs(properties),
            { StringSerializer() },
            { notificationEventValueSerializer() },
        )

    @Bean
    fun notificationEventKafkaTemplate(
        @Qualifier("notificationEventProducerFactory")
        notificationEventProducerFactory: ProducerFactory<String, NotificationEventMessage>,
    ): KafkaTemplate<String, NotificationEventMessage> = KafkaTemplate(notificationEventProducerFactory)

    private fun notificationProducerConfigs(properties: NotificationKafkaProperties): Map<String, Any> {
        val bootstrapServers = properties.bootstrapServers.map(String::trim).filter(String::isNotEmpty)
        require(bootstrapServers.isNotEmpty()) {
            "readmates.notifications.kafka.bootstrap-servers must be set when readmates.notifications.kafka.enabled=true"
        }

        return mapOf(
            ProducerConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers,
            ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG to true,
            ProducerConfig.ACKS_CONFIG to "all",
            ProducerConfig.RETRIES_CONFIG to Int.MAX_VALUE,
            ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION to 5,
        )
    }

    private fun notificationEventValueSerializer(): Serializer<NotificationEventMessage> =
        JacksonJsonSerializer<NotificationEventMessage>(notificationEventJsonMapper()).noTypeInfo()

    private fun notificationEventJsonMapper(): JsonMapper = JacksonMapperUtils.enhancedJsonMapper()
}

typealias NotificationKafkaProperties = NotificationRuntimeProperties.Kafka
