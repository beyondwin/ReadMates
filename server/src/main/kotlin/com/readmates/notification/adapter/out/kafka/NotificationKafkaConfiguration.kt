@file:Suppress("DEPRECATION")

package com.readmates.notification.adapter.out.kafka

import com.readmates.notification.application.model.NotificationEventMessage
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.kafka.common.serialization.StringSerializer
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.kafka.core.DefaultKafkaProducerFactory
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.core.ProducerFactory
import org.springframework.kafka.support.serializer.JsonSerializer
import java.time.Duration

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "readmates.notifications.kafka", name = ["enabled"], havingValue = "true")
@EnableConfigurationProperties(NotificationKafkaProperties::class)
class NotificationKafkaConfiguration {
    @Bean
    fun notificationEventProducerFactory(
        properties: NotificationKafkaProperties,
    ): ProducerFactory<String, NotificationEventMessage> =
        DefaultKafkaProducerFactory(notificationProducerConfigs(properties))

    @Bean
    fun notificationEventKafkaTemplate(
        @Qualifier("notificationEventProducerFactory")
        notificationEventProducerFactory: ProducerFactory<String, NotificationEventMessage>,
    ): KafkaTemplate<String, NotificationEventMessage> =
        KafkaTemplate(notificationEventProducerFactory)

    private fun notificationProducerConfigs(properties: NotificationKafkaProperties): Map<String, Any> {
        val bootstrapServers = properties.bootstrapServers.map(String::trim).filter(String::isNotEmpty)
        require(bootstrapServers.isNotEmpty()) {
            "readmates.notifications.kafka.bootstrap-servers must be set when readmates.notifications.kafka.enabled=true"
        }

        return mapOf(
            ProducerConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers,
            ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG to StringSerializer::class.java,
            ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG to JsonSerializer::class.java,
            JsonSerializer.ADD_TYPE_INFO_HEADERS to false,
        )
    }
}

@ConfigurationProperties(prefix = "readmates.notifications.kafka")
data class NotificationKafkaProperties(
    val bootstrapServers: List<String> = emptyList(),
    val sendTimeout: Duration = Duration.ofSeconds(10),
)
