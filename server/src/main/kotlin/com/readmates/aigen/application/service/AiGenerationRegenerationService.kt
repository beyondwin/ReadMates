package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.aigen.application.port.`in`.RegenerateItemUseCase
import com.readmates.aigen.application.port.`in`.RegenerationResult
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.util.UUID

/** Grounded-only synchronous section regeneration entry point. */
@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationRegenerationService(
    private val jobStore: AiGenerationJobStore,
    private val transitionPolicy: AiGenerationJobTransitionPolicy,
    private val groundedRegenerationExecutor: GroundedRegenerationExecutor,
) : RegenerateItemUseCase {
    override fun regenerate(
        sessionId: UUID,
        jobId: UUID,
        item: GenerationItem,
        model: String?,
        instructions: String?,
        expectedRevision: Long?,
    ): RegenerationResult {
        val record = jobStore.load(jobId) ?: throw JobNotFoundException(jobId)
        if (record.sessionId != sessionId) {
            throw JobSessionMismatchException(jobId, sessionId, record.sessionId)
        }
        transitionPolicy.requireRegenerate(record.status, record.jobId)
        return groundedRegenerationExecutor.regenerate(
            record,
            item,
            expectedRevision ?: throw AiGenerationException.Coded(ErrorCode.STALE_GENERATION_REVISION),
            model,
            instructions,
        )
    }
}
