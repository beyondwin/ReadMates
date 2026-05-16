package com.readmates.aigen.adapter.`in`.messaging

import com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessage
import com.readmates.aigen.adapter.out.messaging.AiGenerationJobProducer
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.service.AiGenerationWorker
import com.readmates.aigen.config.AiGenerationKafkaConfig
import com.readmates.aigen.config.AiGenerationKafkaProperties
import com.readmates.support.KafkaTestContainer
import org.apache.kafka.clients.admin.AdminClient
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.admin.NewTopic
import org.assertj.core.api.Assertions.assertThat
import org.awaitility.Awaitility.await
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.SpringBootConfiguration
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.kafka.annotation.EnableKafka
import org.springframework.kafka.config.KafkaListenerEndpointRegistry
import org.springframework.kafka.test.utils.ContainerTestUtils
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import java.time.Duration
import java.util.UUID
import java.util.concurrent.TimeUnit

@SpringBootTest(
    classes = [
        AiGenerationJobConsumerIntegrationTest.TestApplication::class,
        AiGenerationKafkaConfig::class,
        AiGenerationJobProducer::class,
        AiGenerationJobConsumer::class,
        AiGenerationJobConsumerIntegrationTest.TestWorkerConfiguration::class,
    ],
    properties = [
        "readmates.aigen.enabled=true",
        "readmates.aigen.kafka.enabled=true",
    ],
)
@Tag("integration")
@Tag("container")
class AiGenerationJobConsumerIntegrationTest(
    @param:Autowired private val producer: AiGenerationJobProducer,
    @param:Autowired private val worker: AiGenerationWorker,
    @param:Autowired private val kafkaListenerEndpointRegistry: KafkaListenerEndpointRegistry,
) {
    @Test
    fun `producer publishes a job-routing message that the consumer dispatches to the worker`() {
        waitForListenerAssignment()
        val jobId = UUID.randomUUID()
        val sessionId = UUID.randomUUID()
        val clubId = UUID.randomUUID()
        val hostUserId = UUID.randomUUID()
        Mockito.doNothing().`when`(worker).process(jobId)

        producer.publish(
            jobId = jobId,
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = hostUserId,
            provider = Provider.CLAUDE,
            model = "claude-sonnet-4-6",
            kind = JobKind.FULL,
        )

        await()
            .atMost(Duration.ofSeconds(20))
            .untilAsserted {
                Mockito.verify(worker).process(jobId)
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
        Mockito.doThrow(RuntimeException("first attempt fails"))
            .doNothing()
            .`when`(worker).process(jobId)

        producer.publish(
            jobId = jobId,
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = hostUserId,
            provider = Provider.CLAUDE,
            model = "claude-sonnet-4-6",
            kind = JobKind.FULL,
        )

        await()
            .atMost(Duration.ofSeconds(30))
            .untilAsserted {
                Mockito.verify(worker, Mockito.atLeast(2)).process(jobId)
            }
    }

    @Test
    fun `AiGenerationJobMessage payload has no transcript field as a structural PII guarantee`() {
        val fields =
            AiGenerationJobMessage::class.java.declaredFields.map { it.name }

        assertThat(fields).doesNotContain("transcript")
    }

    private fun waitForListenerAssignment() {
        val listenerContainers = kafkaListenerEndpointRegistry.listenerContainers
        assertThat(listenerContainers).hasSize(1)
        ContainerTestUtils.waitForAssignment(listenerContainers.single(), 1)
    }

    @SpringBootConfiguration
    @EnableKafka
    class TestApplication

    @TestConfiguration(proxyBeanMethods = false)
    class TestWorkerConfiguration {
        @Bean
        fun aiGenerationWorker(): AiGenerationWorker = Mockito.mock(AiGenerationWorker::class.java)
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
