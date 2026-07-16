package com.readmates.aigen.adapter.`in`.messaging

import com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessage
import com.readmates.aigen.adapter.out.messaging.AiGenerationJobProducer
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.AiGenerationJobPublishCommand
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.service.AiGenerationMetrics
import com.readmates.aigen.application.service.AiGenerationWorker
import com.readmates.aigen.config.AiGenerationKafkaConfig
import com.readmates.aigen.config.AiGenerationKafkaProperties
import com.readmates.aigen.support.AiGenerationTestModels
import com.readmates.support.KafkaTestContainer
import io.micrometer.observation.Observation
import io.micrometer.observation.ObservationHandler
import io.micrometer.observation.ObservationRegistry
import io.micrometer.observation.transport.ReceiverContext
import io.micrometer.observation.transport.SenderContext
import io.micrometer.tracing.Tracer
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator
import io.opentelemetry.context.propagation.TextMapPropagator
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.common.serialization.ByteArrayDeserializer
import org.apache.kafka.common.serialization.StringDeserializer
import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.SpringBootConfiguration
import org.springframework.boot.autoconfigure.ImportAutoConfiguration
import org.springframework.boot.micrometer.observation.autoconfigure.ObservationAutoConfiguration
import org.springframework.boot.micrometer.tracing.autoconfigure.MicrometerTracingAutoConfiguration
import org.springframework.boot.micrometer.tracing.opentelemetry.autoconfigure.OpenTelemetryTracingAutoConfiguration
import org.springframework.boot.opentelemetry.autoconfigure.OpenTelemetrySdkAutoConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.core.Ordered
import org.springframework.kafka.annotation.EnableKafka
import org.springframework.kafka.config.KafkaListenerEndpointRegistry
import org.springframework.kafka.test.utils.ContainerTestUtils
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.Properties
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit

@SpringBootTest(
    classes = [
        AiGenerationJobConsumerIntegrationTest.TestApplication::class,
        AiGenerationKafkaConfig::class,
        AiGenerationJobProducer::class,
        AiGenerationJobConsumer::class,
        AiGenerationJobConsumerIntegrationTest.TestWorkerConfiguration::class,
        AiGenerationJobConsumerIntegrationTest.TestTracingConfiguration::class,
    ],
    properties = [
        "readmates.aigen.enabled=true",
        "readmates.aigen.kafka.enabled=true",
    ],
)
@Tag("integration")
@Tag("container")
@ImportAutoConfiguration(
    ObservationAutoConfiguration::class,
    MicrometerTracingAutoConfiguration::class,
    OpenTelemetryTracingAutoConfiguration::class,
    OpenTelemetrySdkAutoConfiguration::class,
)
class AiGenerationJobConsumerIntegrationTest(
    @param:Autowired private val producer: AiGenerationJobProducer,
    @param:Autowired private val worker: AiGenerationWorker,
    @param:Autowired private val kafkaListenerEndpointRegistry: KafkaListenerEndpointRegistry,
    @param:Autowired private val observationRegistry: ObservationRegistry,
    @param:Autowired private val tracer: Tracer,
    @param:Autowired private val traceCapture: KafkaTraceObservationCapture,
) {
    @BeforeEach
    fun resetTraceCapture() {
        traceCapture.clear()
    }

    @Test
    fun `native Kafka observations propagate traceparent without changing the routing payload`() {
        waitForListenerAssignment()
        val jobId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val hostUserId = UUID.randomUUID()
        Mockito.doNothing().`when`(worker).process(jobId)

        val traceId =
            publishObserved(
                AiGenerationJobPublishCommand(
                    jobId = jobId,
                    sessionId = sessionId,
                    clubId = clubId,
                    hostUserId = hostUserId,
                    provider = Provider.CLAUDE,
                    model = AiGenerationTestModels.CLAUDE_DEFAULT,
                    kind = JobKind.FULL,
                ),
            )

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                Mockito.verify(worker).process(jobId)
            }

        val record = readRawRecord(jobId)
        val traceparentHeaders = record.headers().headers("traceparent").toList()
        assertThat(traceparentHeaders).hasSize(1)
        assertThat(String(traceparentHeaders.single().value(), StandardCharsets.US_ASCII))
            .matches("00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]")
        assertThat(record.headers().headers("baggage")).isEmpty()
        val payloadJson = String(record.value(), StandardCharsets.UTF_8)
        assertThat(payloadJson).contains(jobId.toString(), clubId.toString())
        assertThat(payloadJson).doesNotContain("traceparent", "baggage", "traceId", "spanId")

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                val kafkaSpans = traceCapture.spansForTrace(traceId)
                val producerSpans = kafkaSpans.filter { it.direction == KafkaTraceDirection.PRODUCER }
                val consumerSpans = kafkaSpans.filter { it.direction == KafkaTraceDirection.CONSUMER }
                assertThat(producerSpans)
                    .describedAs(
                        "trace=%s captured spans: %s",
                        traceId,
                        traceCapture.snapshot(),
                    ).hasSize(1)
                assertThat(consumerSpans).hasSize(1)
                assertThat(producerSpans.single().spanId).isNotEqualTo(consumerSpans.single().spanId)
            }
    }

    @Test
    fun `consumer redelivers when the worker throws so the job is reprocessed`() {
        waitForListenerAssignment()
        val jobId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val hostUserId = UUID.randomUUID()
        // First call throws (consumer skips ack → container redelivers); subsequent calls succeed.
        Mockito
            .doThrow(RuntimeException("first attempt fails"))
            .doNothing()
            .`when`(worker)
            .process(jobId)

        val traceId =
            publishObserved(
                AiGenerationJobPublishCommand(
                    jobId = jobId,
                    sessionId = sessionId,
                    clubId = clubId,
                    hostUserId = hostUserId,
                    provider = Provider.CLAUDE,
                    model = AiGenerationTestModels.CLAUDE_DEFAULT,
                    kind = JobKind.FULL,
                ),
            )

        await()
            .atMost(Duration.ofSeconds(30))
            .untilAsserted {
                Mockito.verify(worker, Mockito.times(2)).process(jobId)
                val consumerSpans =
                    traceCapture
                        .spansForTrace(traceId)
                        .filter { it.direction == KafkaTraceDirection.CONSUMER }
                assertThat(consumerSpans)
                    .describedAs("captured spans: %s", traceCapture.snapshot())
                    .hasSize(2)
                assertThat(consumerSpans.map(CapturedKafkaTrace::spanId)).doesNotHaveDuplicates()
            }
    }

    @Test
    fun `AiGenerationJobMessage payload contains only routing metadata as a structural PII guarantee`() {
        val fields =
            AiGenerationJobMessage::class.java.declaredFields.map { it.name }

        assertThat(fields).containsExactlyInAnyOrder(
            "jobId",
            "sessionId",
            "clubId",
            "hostUserId",
            "provider",
            "model",
            "kind",
        )
        assertThat(fields).doesNotContain(
            "transcript",
            "turns",
            "speakerName",
            "result",
            "evidence",
            "excerpt",
            "instructions",
            "prompt",
            "providerResponse",
        )
    }

    private fun waitForListenerAssignment() {
        val listenerContainers = kafkaListenerEndpointRegistry.listenerContainers
        assertThat(listenerContainers).hasSize(1)
        ContainerTestUtils.waitForAssignment(listenerContainers.single(), 1)
    }

    private fun publishObserved(command: AiGenerationJobPublishCommand): String {
        val observation = Observation.start("readmates.aigen.test.publish", observationRegistry)
        try {
            observation.openScope().use {
                val traceId = checkNotNull(tracer.currentSpan()).context().traceId()
                producer.publish(command)
                return traceId
            }
        } finally {
            observation.stop()
        }
    }

    private fun readRawRecord(jobId: UUID): org.apache.kafka.clients.consumer.ConsumerRecord<String, ByteArray> {
        val properties =
            Properties().also {
                it[ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG] = KafkaTestContainer.container.bootstrapServers
                it[ConsumerConfig.GROUP_ID_CONFIG] = "readmates-aigen-trace-inspector-${UUID.randomUUID()}"
                it[ConsumerConfig.AUTO_OFFSET_RESET_CONFIG] = "earliest"
                it[ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG] = "false"
            }
        KafkaConsumer(properties, StringDeserializer(), ByteArrayDeserializer()).use { consumer ->
            consumer.subscribe(listOf(topicJobs))
            val deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos()
            while (System.nanoTime() < deadline) {
                consumer
                    .poll(Duration.ofMillis(250))
                    .firstOrNull { record ->
                        String(record.value(), StandardCharsets.UTF_8).contains(jobId.toString())
                    }?.let { return it }
            }
        }
        error("Kafka record was not observable for job $jobId")
    }

    @SpringBootConfiguration
    @EnableKafka
    class TestApplication

    @TestConfiguration(proxyBeanMethods = false)
    class TestWorkerConfiguration {
        @Bean
        fun aiGenerationWorker(): AiGenerationWorker = Mockito.mock(AiGenerationWorker::class.java)

        @Bean
        fun aiGenerationMetrics(): AiGenerationMetrics = Mockito.mock(AiGenerationMetrics::class.java)
    }

    @Suppress("MaxLineLength")
    @TestConfiguration(proxyBeanMethods = false)
    class TestTracingConfiguration {
        @Bean
        fun kafkaTraceObservationCapture(tracer: Tracer): KafkaTraceObservationCapture = KafkaTraceObservationCapture(tracer)

        @Bean
        fun traceContextPropagator(): TextMapPropagator = W3CTraceContextPropagator.getInstance()
    }

    companion object {
        private val topicSuffix = UUID.randomUUID().toString()
        private val topicJobs = "readmates.aigen.jobs.test.$topicSuffix"
        private val consumerGroup = "readmates-aigen-worker-test-$topicSuffix"

        @JvmStatic
        @DynamicPropertySource
        fun registerKafkaProperties(registry: DynamicPropertyRegistry) {
            val bootstrapServers = KafkaTestContainer.container.bootstrapServers
            createTopic(bootstrapServers, topicJobs)

            registry.add("readmates.aigen.kafka.bootstrap-servers") { bootstrapServers }
            registry.add("readmates.aigen.kafka.topic-jobs") { topicJobs }
            registry.add("readmates.aigen.kafka.consumer-group") { consumerGroup }
        }

        private fun createTopic(
            bootstrapServers: String,
            topic: String,
        ) {
            AdminClient
                .create(mapOf(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers))
                .use { adminClient ->
                    adminClient
                        .createTopics(listOf(NewTopic(topic, 1, 1.toShort())))
                        .all()
                        .get(10, TimeUnit.SECONDS)
                }
        }
    }
}

enum class KafkaTraceDirection { PRODUCER, CONSUMER }

data class CapturedKafkaTrace(
    val direction: KafkaTraceDirection,
    val traceId: String,
    val spanId: String,
)

@Suppress("MaxLineLength")
class KafkaTraceObservationCapture(
    private val tracer: Tracer,
) : ObservationHandler<Observation.Context>,
    Ordered {
    private val captured = CopyOnWriteArrayList<CapturedKafkaTrace>()

    fun clear() = captured.clear()

    fun spansForTrace(traceId: String): List<CapturedKafkaTrace> = captured.filter { it.traceId == traceId }.distinct()

    fun snapshot(): List<CapturedKafkaTrace> = captured.toList()

    override fun supportsContext(context: Observation.Context): Boolean = context is SenderContext<*> || context is ReceiverContext<*>

    override fun onScopeOpened(context: Observation.Context) {
        val span = checkNotNull(tracer.currentSpan())
        val direction =
            when (context) {
                is SenderContext<*> -> KafkaTraceDirection.PRODUCER
                is ReceiverContext<*> -> KafkaTraceDirection.CONSUMER
                else -> error("Unsupported Kafka observation context")
            }
        captured +=
            CapturedKafkaTrace(
                direction = direction,
                traceId = span.context().traceId(),
                spanId = span.context().spanId(),
            )
    }

    override fun getOrder(): Int = Ordered.LOWEST_PRECEDENCE
}
