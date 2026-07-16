package com.readmates.aigen.adapter.out.messaging

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.config.AiGenerationKafkaConfig
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.DirectFieldAccessor
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory
import org.springframework.kafka.core.DefaultKafkaConsumerFactory
import org.springframework.kafka.core.DefaultKafkaProducerFactory
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.listener.ContainerProperties
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.UUID

/**
 * Round-trip serialization test for [AiGenerationJobMessage] through the same
 * Jackson 3 producer/consumer factories used in production. Pins:
 *   - UUIDs serialize as strings, not byte arrays
 *   - [Provider] / [JobKind] enums serialize as their names
 *   - No type-info preamble (notification module precedent: `noTypeInfo()`)
 *   - Round-trip via the wire format produces an equal data class
 */
@Suppress("UNCHECKED_CAST")
class AiGenerationJobMessageSerializationTest {
    private val contextRunner =
        ApplicationContextRunner()
            .withUserConfiguration(AiGenerationKafkaConfig::class.java)
            .withPropertyValues(
                "readmates.aigen.enabled=true",
                "readmates.aigen.kafka.enabled=true",
                "readmates.aigen.kafka.bootstrap-servers=kafka-a:9092",
            )

    @Test
    fun `Kafka producer and listener enable native observations while preserving manual ack`() {
        contextRunner.run { context ->
            val template = context.getBean("aiGenerationJobKafkaTemplate", KafkaTemplate::class.java)
            val listenerFactory =
                context.getBean(
                    "aiGenerationKafkaListenerContainerFactory",
                    ConcurrentKafkaListenerContainerFactory::class.java,
                )

            assertThat(DirectFieldAccessor(template).getPropertyValue("observationEnabled")).isEqualTo(true)
            assertThat(listenerFactory.containerProperties.isObservationEnabled).isTrue()
            assertThat(listenerFactory.containerProperties.ackMode).isEqualTo(ContainerProperties.AckMode.MANUAL)
        }
    }

    @Test
    fun `consumer config pins max poll interval to the explicit processing budget`() {
        contextRunner.run { context ->
            val consumerFactory =
                context.getBean(
                    "aiGenerationJobConsumerFactory",
                    DefaultKafkaConsumerFactory::class.java,
                ) as DefaultKafkaConsumerFactory<String, AiGenerationJobMessage>

            assertThat(consumerFactory.configurationProperties[ConsumerConfig.MAX_POLL_INTERVAL_MS_CONFIG])
                .isEqualTo(Duration.ofMinutes(16).toMillis().toInt())
        }
    }

    @Test
    fun `producer value serializer writes JSON with stringified UUIDs and enum names`() {
        contextRunner.run { context ->
            val factory =
                context.getBean(
                    "aiGenerationJobProducerFactory",
                    DefaultKafkaProducerFactory::class.java,
                ) as DefaultKafkaProducerFactory<String, AiGenerationJobMessage>
            val serializer = factory.valueSerializerSupplier!!.get()!!

            val json =
                String(
                    serializer.serialize("readmates.aigen.jobs.v1", sampleMessage()),
                    StandardCharsets.UTF_8,
                )

            assertThat(json).contains(
                """"jobId":"11111111-1111-4111-8111-111111111111"""",
                """"sessionId":"22222222-2222-4222-8222-222222222222"""",
                """"clubId":"33333333-3333-4333-8333-333333333333"""",
                """"hostUserId":"44444444-4444-4444-8444-444444444444"""",
                """"provider":"CLAUDE"""",
                """"model":"claude-sonnet-4-6"""",
                """"kind":"FULL"""",
            )
            assertThat(json).doesNotContain("transcript")
            assertThat(json).doesNotContain("traceparent", "baggage", "traceId", "spanId")
        }
    }

    @Test
    fun `consumer value deserializer round-trips JSON back into AiGenerationJobMessage`() {
        contextRunner.run { context ->
            val producerFactory =
                context.getBean(
                    "aiGenerationJobProducerFactory",
                    DefaultKafkaProducerFactory::class.java,
                ) as DefaultKafkaProducerFactory<String, AiGenerationJobMessage>
            val consumerFactory =
                context.getBean(
                    "aiGenerationJobConsumerFactory",
                    DefaultKafkaConsumerFactory::class.java,
                ) as DefaultKafkaConsumerFactory<String, AiGenerationJobMessage>
            val original = sampleMessage()

            val bytes =
                producerFactory.valueSerializerSupplier!!
                    .get()!!
                    .serialize("readmates.aigen.jobs.v1", original)
            val deserialized =
                consumerFactory.valueDeserializer!!
                    .deserialize("readmates.aigen.jobs.v1", bytes)

            assertThat(deserialized).isEqualTo(original)
        }
    }

    private fun sampleMessage(): AiGenerationJobMessage =
        AiGenerationJobMessage(
            jobId = UUID.fromString("11111111-1111-4111-8111-111111111111"),
            sessionId = UUID.fromString("22222222-2222-4222-8222-222222222222"),
            clubId = UUID.fromString("33333333-3333-4333-8333-333333333333"),
            hostUserId = UUID.fromString("44444444-4444-4444-8444-444444444444"),
            provider = Provider.CLAUDE,
            model = "claude-sonnet-4-6",
            kind = JobKind.FULL,
        )
}
