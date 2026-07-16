package com.readmates.aigen.adapter.`in`.messaging

import com.readmates.aigen.adapter.out.messaging.AiGenerationJobMessage
import com.readmates.aigen.application.service.AiGenerationWorker
import org.slf4j.LoggerFactory
import org.slf4j.MDC
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
    @Suppress("TooGenericExceptionCaught")
    fun onMessage(
        message: AiGenerationJobMessage,
        acknowledgment: Acknowledgment,
    ) {
        withWorkerMdc(message) {
            try {
                worker.process(message.jobId)
                acknowledgment.acknowledge()
            } catch (ex: RuntimeException) {
                // Do NOT ack — let the container redeliver. Never attach the raw
                // throwable or its message because provider bodies can reach causes.
                log.error(
                    "AI generation worker failed errorCode={} failureClass={}",
                    "UNKNOWN",
                    "INFRASTRUCTURE",
                )
                throw ex
            }
        }
    }

    private fun <T> withWorkerMdc(
        message: AiGenerationJobMessage,
        block: () -> T,
    ): T =
        withMdcValue("jobId", message.jobId.toString()) {
            withMdcValue("provider", message.provider.name.lowercase()) {
                withMdcValue("stage", "worker") { block() }
            }
        }

    private fun <T> withMdcValue(
        key: String,
        value: String,
        block: () -> T,
    ): T {
        val previous = MDC.get(key)
        val closeable = MDC.putCloseable(key, value)
        try {
            return block()
        } finally {
            closeable.close()
            previous?.let { MDC.put(key, it) }
        }
    }
}
