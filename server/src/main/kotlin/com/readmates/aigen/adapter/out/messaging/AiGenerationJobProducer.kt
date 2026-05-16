package com.readmates.aigen.adapter.out.messaging

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.config.AiGenerationKafkaProperties
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.support.KafkaHeaders
import org.springframework.messaging.support.MessageBuilder
import org.springframework.stereotype.Component
import java.util.UUID
import java.util.concurrent.ExecutionException
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

/**
 * Kafka adapter for [AiGenerationJobQueue] (spec §8.1).
 *
 * - Topic: `readmates.aigen.jobs.v1` (configurable)
 * - Partition key: clubId — so multiple jobs for the same club are processed in
 *   order within the consumer group.
 * - Payload: [AiGenerationJobMessage] — structurally guaranteed not to carry
 *   transcript bytes (a reflection test pins this invariant).
 *
 * Wired only when both `readmates.aigen.enabled=true` and
 * `readmates.aigen.kafka.enabled=true`.
 */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.aigen.kafka", name = ["enabled"], havingValue = "true")
class AiGenerationJobProducer(
    @param:Qualifier("aiGenerationJobKafkaTemplate")
    private val kafkaTemplate: KafkaTemplate<String, AiGenerationJobMessage>,
    private val properties: AiGenerationKafkaProperties,
) : AiGenerationJobQueue {
    override fun publish(
        jobId: UUID,
        sessionId: UUID,
        clubId: UUID,
        hostUserId: UUID,
        provider: Provider,
        model: String,
        kind: JobKind,
    ) {
        val payload =
            AiGenerationJobMessage(
                jobId = jobId,
                sessionId = sessionId,
                clubId = clubId,
                hostUserId = hostUserId,
                provider = provider,
                model = model,
                kind = kind,
            )
        val kafkaMessage =
            MessageBuilder
                .withPayload(payload)
                .setHeader(KafkaHeaders.TOPIC, properties.topicJobs)
                .setHeader(KafkaHeaders.KEY, clubId.toString())
                .setHeader("readmates-aigen-job-id", jobId.toString())
                .setHeader("readmates-aigen-kind", kind.name)
                .build()

        try {
            kafkaTemplate.send(kafkaMessage).get(properties.sendTimeout.toMillis(), TimeUnit.MILLISECONDS)
        } catch (ex: AiGenerationJobPublishException) {
            throw ex
        } catch (ex: InterruptedException) {
            Thread.currentThread().interrupt()
            throw AiGenerationJobPublishException("Interrupted publishing AI generation job $jobId", ex)
        } catch (ex: TimeoutException) {
            throw AiGenerationJobPublishException(
                "Timed out publishing AI generation job $jobId after ${properties.sendTimeout}",
                ex,
            )
        } catch (ex: ExecutionException) {
            throw AiGenerationJobPublishException(
                "Failed publishing AI generation job $jobId",
                ex.cause ?: ex,
            )
        } catch (ex: RuntimeException) {
            throw AiGenerationJobPublishException("Failed publishing AI generation job $jobId", ex)
        }
    }
}

class AiGenerationJobPublishException(
    message: String,
    cause: Throwable,
) : RuntimeException(message, cause)
