package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import java.time.Instant
import java.util.UUID

interface AiGenerationCommitPersistencePort {
    fun upsertTranscriptSpeakersAsParticipants(
        clubId: UUID,
        sessionId: UUID,
        validatedTurns: List<ValidatedTranscriptTurn>,
    ): Int

    fun findReceipt(
        jobId: UUID,
        revision: Long,
    ): AiGenerationCommitReceipt?

    /** Returns false when the same job/revision receipt already exists. */
    fun insertReceipt(receipt: AiGenerationCommitReceipt): Boolean
}

data class AiGenerationCommitReceipt(
    val jobId: UUID,
    val revision: Long,
    val sessionId: UUID,
    val clubId: UUID,
    val committedAt: Instant,
)

class AiGenerationMembershipChangedException : RuntimeException("Grounded transcript membership changed")
