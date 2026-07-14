package com.readmates.aigen.adapter.out.messaging

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.JobKind
import java.util.UUID

/**
 * Kafka payload for an AI generation job (spec §8.1).
 *
 * IMPORTANT — this class intentionally has NO `transcript` field. The transcript
 * is stored in the Redis adapter's short-lived transcript payload at start-time, and the
 * worker rehydrates it via the job store. The shape of this data class is the
 * structural guarantee that no transcript bytes leave the producer-side memory
 * through Kafka. A reflection-based test pins this invariant.
 */
data class AiGenerationJobMessage(
    val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val provider: Provider,
    val model: String,
    val kind: JobKind,
)
