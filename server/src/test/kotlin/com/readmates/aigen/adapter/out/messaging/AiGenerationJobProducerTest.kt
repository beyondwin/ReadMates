@file:Suppress("UNCHECKED_CAST")

package com.readmates.aigen.adapter.out.messaging

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.config.AiGenerationKafkaProperties
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.support.KafkaHeaders
import org.springframework.kafka.support.SendResult
import org.springframework.messaging.Message
import java.time.Duration
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlin.reflect.full.memberProperties

class AiGenerationJobProducerTest {
    @AfterEach
    fun clearInterrupt() {
        Thread.interrupted()
    }

    @Test
    fun `AiGenerationJobMessage data class has no transcript field`() {
        val fieldNames =
            AiGenerationJobMessage::class.memberProperties.map { it.name }

        assertThat(fieldNames).doesNotContain("transcript")
        assertThat(fieldNames).containsExactlyInAnyOrder(
            "jobId",
            "sessionId",
            "clubId",
            "hostUserId",
            "provider",
            "model",
            "kind",
        )
    }

    @Test
    fun `publish sends to configured topic with clubId as partition key`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, AiGenerationJobMessage>
        Mockito
            .`when`(kafkaTemplate.send(Mockito.any<Message<AiGenerationJobMessage>>()))
            .thenReturn(RecordingKafkaSendFuture())

        val properties =
            AiGenerationKafkaProperties(
                bootstrapServers = listOf("kafka-a:9092"),
                topicJobs = "readmates.aigen.jobs.v1",
                sendTimeout = Duration.ofMillis(250),
            )
        val producer = AiGenerationJobProducer(kafkaTemplate, properties)
        val jobId = UUID.fromString("11111111-1111-4111-8111-111111111111")
        val sessionId = UUID.fromString("22222222-2222-4222-8222-222222222222")
        val clubId = UUID.fromString("33333333-3333-4333-8333-333333333333")
        val hostUserId = UUID.fromString("44444444-4444-4444-8444-444444444444")

        producer.publish(
            jobId = jobId,
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = hostUserId,
            provider = Provider.CLAUDE,
            model = "claude-sonnet-4-6",
            kind = JobKind.FULL,
        )

        val captor =
            ArgumentCaptor.forClass(Message::class.java)
                as ArgumentCaptor<Message<AiGenerationJobMessage>>
        Mockito.verify(kafkaTemplate).send(captor.capture())
        val sent = captor.value
        assertThat(sent.headers[KafkaHeaders.TOPIC]).isEqualTo("readmates.aigen.jobs.v1")
        assertThat(sent.headers[KafkaHeaders.KEY]).isEqualTo(clubId.toString())
        assertThat(sent.payload).isEqualTo(
            AiGenerationJobMessage(
                jobId = jobId,
                sessionId = sessionId,
                clubId = clubId,
                hostUserId = hostUserId,
                provider = Provider.CLAUDE,
                model = "claude-sonnet-4-6",
                kind = JobKind.FULL,
            ),
        )
    }

    @Test
    fun `publish wraps timeout failure in meaningful exception`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, AiGenerationJobMessage>
        Mockito
            .`when`(kafkaTemplate.send(Mockito.any<Message<AiGenerationJobMessage>>()))
            .thenReturn(RecordingKafkaSendFuture(timeoutFailure = TimeoutException("timed out")))
        val producer =
            AiGenerationJobProducer(
                kafkaTemplate,
                AiGenerationKafkaProperties(sendTimeout = Duration.ofMillis(10)),
            )

        assertThatThrownBy {
            producer.publish(
                jobId = UUID.randomUUID(),
                sessionId = UUID.randomUUID(),
                clubId = UUID.randomUUID(),
                hostUserId = UUID.randomUUID(),
                provider = Provider.CLAUDE,
                model = "claude-sonnet-4-6",
                kind = JobKind.FULL,
            )
        }.isInstanceOf(AiGenerationJobPublishException::class.java)
            .hasMessageContaining("Timed out publishing AI generation job")
            .hasCauseInstanceOf(TimeoutException::class.java)
    }

    @Test
    fun `publish wraps synchronous send failure in meaningful exception`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, AiGenerationJobMessage>
        Mockito
            .`when`(kafkaTemplate.send(Mockito.any<Message<AiGenerationJobMessage>>()))
            .thenThrow(IllegalStateException("producer closed"))
        val producer =
            AiGenerationJobProducer(
                kafkaTemplate,
                AiGenerationKafkaProperties(sendTimeout = Duration.ofMillis(10)),
            )

        assertThatThrownBy {
            producer.publish(
                jobId = UUID.randomUUID(),
                sessionId = UUID.randomUUID(),
                clubId = UUID.randomUUID(),
                hostUserId = UUID.randomUUID(),
                provider = Provider.CLAUDE,
                model = "claude-sonnet-4-6",
                kind = JobKind.FULL,
            )
        }.isInstanceOf(AiGenerationJobPublishException::class.java)
            .hasMessageContaining("Failed publishing AI generation job")
            .hasCauseInstanceOf(IllegalStateException::class.java)
    }

    @Test
    fun `publish preserves interrupt status when interrupted`() {
        val kafkaTemplate = Mockito.mock(KafkaTemplate::class.java) as KafkaTemplate<String, AiGenerationJobMessage>
        Mockito
            .`when`(kafkaTemplate.send(Mockito.any<Message<AiGenerationJobMessage>>()))
            .thenReturn(RecordingKafkaSendFuture(interruptFailure = InterruptedException("interrupted")))
        val producer =
            AiGenerationJobProducer(
                kafkaTemplate,
                AiGenerationKafkaProperties(sendTimeout = Duration.ofMillis(10)),
            )

        assertThatThrownBy {
            producer.publish(
                jobId = UUID.randomUUID(),
                sessionId = UUID.randomUUID(),
                clubId = UUID.randomUUID(),
                hostUserId = UUID.randomUUID(),
                provider = Provider.CLAUDE,
                model = "claude-sonnet-4-6",
                kind = JobKind.FULL,
            )
        }.isInstanceOf(AiGenerationJobPublishException::class.java)
            .hasMessageContaining("Interrupted publishing AI generation job")
            .hasCauseInstanceOf(InterruptedException::class.java)

        assertThat(Thread.currentThread().isInterrupted).isTrue()
    }
}

private class RecordingKafkaSendFuture(
    private val timeoutFailure: TimeoutException? = null,
    private val interruptFailure: InterruptedException? = null,
) : CompletableFuture<SendResult<String, AiGenerationJobMessage>>() {
    override fun get(
        timeout: Long,
        unit: TimeUnit,
    ): SendResult<String, AiGenerationJobMessage> {
        timeoutFailure?.let { throw it }
        interruptFailure?.let { throw it }
        @Suppress("UNCHECKED_CAST")
        return Mockito.mock(SendResult::class.java) as SendResult<String, AiGenerationJobMessage>
    }
}
