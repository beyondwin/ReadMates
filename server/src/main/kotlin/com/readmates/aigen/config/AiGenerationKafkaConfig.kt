package com.readmates.aigen.config

import com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessage
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.kafka.common.serialization.Deserializer
import org.apache.kafka.common.serialization.Serializer
import org.apache.kafka.common.serialization.StringDeserializer
import org.apache.kafka.common.serialization.StringSerializer
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.kafka.annotation.EnableKafka
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory
import org.springframework.kafka.core.ConsumerFactory
import org.springframework.kafka.core.DefaultKafkaConsumerFactory
import org.springframework.kafka.core.DefaultKafkaProducerFactory
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.core.ProducerFactory
import org.springframework.kafka.listener.ContainerProperties
import org.springframework.kafka.support.JacksonMapperUtils
import org.springframework.kafka.support.serializer.ErrorHandlingDeserializer
import org.springframework.kafka.support.serializer.JacksonJsonDeserializer
import org.springframework.kafka.support.serializer.JacksonJsonSerializer
import tools.jackson.databind.json.JsonMapper

/**
 * Spring Kafka configuration for AI-generation job messaging (spec §8.1).
 *
 * - Producer: idempotent, acks=all, JSON value serializer (Jackson 3 via Spring Kafka).
 * - Consumer: manual ack mode, earliest offset reset, read_committed isolation;
 *   the listener acks only after [com.readmates.aigen.application.service.AiGenerationWorker.process]
 *   returns successfully.
 *
 * Wired only when both `readmates.aigen.enabled=true` and
 * `readmates.aigen.kafka.enabled=true`.
 */
private const val PRODUCER_MAX_IN_FLIGHT_REQUESTS = 5

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.aigen.kafka", name = ["enabled"], havingValue = "true")
@EnableKafka
@EnableConfigurationProperties(AiGenerationKafkaProperties::class)
class AiGenerationKafkaConfig {
    @Suppress("MaxLineLength")
    @Bean
    fun aiGenerationJobProducerFactory(properties: AiGenerationKafkaProperties): ProducerFactory<String, AiGenerationJobMessage> =
        DefaultKafkaProducerFactory(
            aiGenerationProducerConfigs(properties),
            { StringSerializer() },
            { aiGenerationJobValueSerializer() },
        )

    @Bean
    fun aiGenerationJobKafkaTemplate(
        @Qualifier("aiGenerationJobProducerFactory")
        aiGenerationJobProducerFactory: ProducerFactory<String, AiGenerationJobMessage>,
    ): KafkaTemplate<String, AiGenerationJobMessage> = KafkaTemplate(aiGenerationJobProducerFactory)

    @Suppress("MaxLineLength")
    @Bean
    fun aiGenerationJobConsumerFactory(properties: AiGenerationKafkaProperties): ConsumerFactory<String, AiGenerationJobMessage> =
        DefaultKafkaConsumerFactory(
            aiGenerationConsumerConfigs(properties),
            { StringDeserializer() },
            { aiGenerationJobValueDeserializer() },
        )

    @Bean
    fun aiGenerationKafkaListenerContainerFactory(
        @Qualifier("aiGenerationJobConsumerFactory")
        consumerFactory: ConsumerFactory<String, AiGenerationJobMessage>,
    ): ConcurrentKafkaListenerContainerFactory<String, AiGenerationJobMessage> =
        ConcurrentKafkaListenerContainerFactory<String, AiGenerationJobMessage>().also {
            it.setConsumerFactory(consumerFactory)
            // Manual ack: the listener calls Acknowledgment.acknowledge() only after
            // AiGenerationWorker.process(jobId) returns successfully. Throwing skips
            // the ack so the container redelivers per its default error handler.
            it.containerProperties.ackMode = ContainerProperties.AckMode.MANUAL
        }

    private fun aiGenerationProducerConfigs(properties: AiGenerationKafkaProperties): Map<String, Any> {
        val bootstrapServers = properties.bootstrapServers.map(String::trim).filter(String::isNotEmpty)
        require(bootstrapServers.isNotEmpty()) {
            "readmates.aigen.kafka.bootstrap-servers must be set when readmates.aigen.kafka.enabled=true"
        }
        return mapOf(
            ProducerConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers,
            ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG to true,
            ProducerConfig.ACKS_CONFIG to "all",
            ProducerConfig.RETRIES_CONFIG to Int.MAX_VALUE,
            ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION to PRODUCER_MAX_IN_FLIGHT_REQUESTS,
        )
    }

    private fun aiGenerationConsumerConfigs(properties: AiGenerationKafkaProperties): Map<String, Any> {
        val bootstrapServers = properties.bootstrapServers.map(String::trim).filter(String::isNotEmpty)
        require(bootstrapServers.isNotEmpty()) {
            "readmates.aigen.kafka.bootstrap-servers must be set when readmates.aigen.kafka.enabled=true"
        }
        require(properties.consumerGroup.isNotBlank()) {
            "readmates.aigen.kafka.consumer-group must be set when readmates.aigen.kafka.enabled=true"
        }
        return mapOf(
            ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers,
            ConsumerConfig.GROUP_ID_CONFIG to properties.consumerGroup,
            ConsumerConfig.AUTO_OFFSET_RESET_CONFIG to "earliest",
            ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG to false,
            ConsumerConfig.ISOLATION_LEVEL_CONFIG to "read_committed",
        )
    }

    private fun aiGenerationJobValueSerializer(): Serializer<AiGenerationJobMessage> =
        JacksonJsonSerializer<AiGenerationJobMessage>(aiGenerationJobJsonMapper()).noTypeInfo()

    private fun aiGenerationJobValueDeserializer(): Deserializer<AiGenerationJobMessage> =
        ErrorHandlingDeserializer(aiGenerationJobJsonValueDeserializer())

    private fun aiGenerationJobJsonValueDeserializer(): Deserializer<AiGenerationJobMessage> =
        JacksonJsonDeserializer(
            AiGenerationJobMessage::class.java,
            aiGenerationJobJsonMapper(),
            false,
        )

    private fun aiGenerationJobJsonMapper(): JsonMapper = JacksonMapperUtils.enhancedJsonMapper()
}
