package com.readmates.aigen.adapter.`in`.messaging

import com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessage
import com.readmates.aigen.application.service.AiGenerationWorker
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.kafka.support.Acknowledgment
import org.springframework.stereotype.Component

/**
 * Kafka consumer for AI-generation job-routing messages (spec §8.1).
 *
 * Behavior:
 *  - On each message: invoke [AiGenerationWorker.process] with the [AiGenerationJobMessage.jobId].
 *  - On success: acknowledge the offset (manual ack mode — see [com.readmates.aigen.config.AiGenerationKafkaConfig]).
 *  - On exception: log and rethrow — the container's default error handler then triggers
 *    redelivery. We do NOT call [Acknowledgment.acknowledge] on the failure path; the
 *    worker is responsible for marking the job FAILED in Redis if redelivery exhausts.
 *
 * Wired only when both `readmates.aigen.enabled=true` and
 * `readmates.aigen.kafka.enabled=true`.
 */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.aigen.kafka", name = ["enabled"], havingValue = "true")
class AiGenerationJobConsumer(
    private val worker: AiGenerationWorker,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @KafkaListener(
        topics = ["\${readmates.aigen.kafka.topic-jobs:readmates.aigen.jobs.v1}"],
        groupId = "\${readmates.aigen.kafka.consumer-group:readmates-aigen-worker}",
        containerFactory = "aiGenerationKafkaListenerContainerFactory",
    )
    fun onMessage(
        message: AiGenerationJobMessage,
        acknowledgment: Acknowledgment,
    ) {
        try {
            worker.process(message.jobId)
            acknowledgment.acknowledge()
        } catch (ex: RuntimeException) {
            // Do NOT ack — let the container redeliver. Worker.process is responsible
            // for persisting failure state in Redis when retries are exhausted.
            log.error(
                "AI generation worker failed for jobId={} sessionId={} clubId={}: {}",
                message.jobId,
                message.sessionId,
                message.clubId,
                ex.message,
                ex,
            )
            throw ex
        }
    }
}
