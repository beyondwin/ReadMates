package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.Provider
import java.util.UUID

/**
 * Outbound port for publishing AI generation jobs to an async queue (Kafka in production).
 *
 * Per spec §7.1, the start endpoint:
 *  1. Stores the transcript in Redis under `aigen:job:{jobId}:transcript`
 *  2. Publishes ONLY the [AiGenerationJobPublishCommand.jobId] and routing metadata
 *     (sessionId/provider/model/kind) to the queue — the message body MUST NOT
 *     contain the transcript itself.
 *
 * Implementations live in Phase 2 (KafkaAiGenerationJobQueue).
 */
interface AiGenerationJobQueue {
    /**
     * Publishes a job-routing message. Implementations MUST NOT include the transcript body.
     * The worker rehydrates the transcript via [AiGenerationJobStore.load] using the
     * [command]'s `jobId`.
     *
     * [AiGenerationJobPublishCommand.clubId] is used as the partition key so jobs for the
     * same club process in order. [AiGenerationJobPublishCommand.hostUserId] is carried in
     * the payload so downstream observability can correlate.
     */
    fun publish(command: AiGenerationJobPublishCommand)
}

/**
 * Routing payload for [AiGenerationJobQueue.publish]. Pure routing metadata — never carries
 * the transcript body.
 */
data class AiGenerationJobPublishCommand(
    val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val provider: Provider,
    val model: String,
    val kind: JobKind,
)

enum class JobKind {
    FULL,
    REGENERATE_SUMMARY,
    REGENERATE_HIGHLIGHTS,
    REGENERATE_ONE_LINE_REVIEWS,
    REGENERATE_FEEDBACK_DOCUMENT,
}
