package com.readmates.aigen.adapter.out.messaging

import com.readmates.aigen.application.model.AiGenerationJobMessage
import com.readmates.aigen.application.model.AiGenerationQueueUnavailableException
import com.readmates.aigen.application.port.out.AiGenerationJobPublishCommand
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import com.readmates.aigen.config.AiGenerationKafkaProperties
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.support.KafkaHeaders
import org.springframework.messaging.support.MessageBuilder
import org.springframework.stereotype.Component
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
    @Suppress("TooGenericExceptionCaught")
    override fun publish(command: AiGenerationJobPublishCommand) {
        val jobId = command.jobId
        val payload =
            AiGenerationJobMessage(
                jobId = jobId,
                sessionId = command.sessionId,
                clubId = command.clubId,
                hostUserId = command.hostUserId,
                provider = command.provider,
                model = command.model,
                kind = command.kind,
            )
        val kafkaMessage =
            MessageBuilder
                .withPayload(payload)
                .setHeader(KafkaHeaders.TOPIC, properties.topicJobs)
                .setHeader(KafkaHeaders.KEY, command.clubId.toString())
                .setHeader("readmates-aigen-job-id", jobId.toString())
                .setHeader("readmates-aigen-kind", command.kind.name)
                .build()

        try {
            kafkaTemplate.send(kafkaMessage).get(properties.sendTimeout.toMillis(), TimeUnit.MILLISECONDS)
        } catch (ex: InterruptedException) {
            Thread.currentThread().interrupt()
            throw AiGenerationQueueUnavailableException(ex)
        } catch (ex: TimeoutException) {
            throw AiGenerationQueueUnavailableException(ex)
        } catch (ex: ExecutionException) {
            throw AiGenerationQueueUnavailableException(ex.cause ?: ex)
        } catch (ex: RuntimeException) {
            throw AiGenerationQueueUnavailableException(ex)
        }
    }
}
