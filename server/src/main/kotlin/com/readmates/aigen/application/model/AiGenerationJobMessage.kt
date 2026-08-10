package com.readmates.aigen.application.model

import com.readmates.aigen.application.port.out.JobKind
import java.util.UUID

/**
 * Transport-neutral routing envelope for an AI generation job.
 *
 * The transcript is stored in the job store and rehydrated by the worker; it
 * must not be carried by this routing value.
 */
data class AiGenerationJobMessage(
    override val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val provider: Provider,
    val model: String,
    val kind: JobKind,
) : AiGenerationKafkaRoutingValue
