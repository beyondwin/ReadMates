package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.ExpandGenerationEvidenceUseCase
import com.readmates.aigen.application.port.`in`.ExpandedEvidenceTurn
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.util.UUID

@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationEvidenceService(
    private val jobStore: AiGenerationJobStore,
) : ExpandGenerationEvidenceUseCase {
    @Suppress("ThrowsCount")
    override fun expand(
        sessionId: UUID,
        jobId: UUID,
        turnId: String,
        revision: Long,
    ): ExpandedEvidenceTurn {
        val record = jobStore.load(jobId) ?: throw JobNotFoundException(jobId)
        if (record.sessionId != sessionId) {
            throw JobSessionMismatchException(jobId, sessionId, record.sessionId)
        }
        if (record.revision != revision) {
            throw AiGenerationException.Coded(ErrorCode.STALE_GENERATION_REVISION, currentRevision = record.revision)
        }
        if (
            record.status != JobStatus.SUCCEEDED ||
            record.pipelineMode != AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT ||
            record.groundingStatus != GroundingStatus.VALID
        ) {
            throw AiGenerationException.Coded(ErrorCode.JOB_EXPIRED)
        }
        val evidence = record.evidence ?: throw AiGenerationException.Coded(ErrorCode.JOB_EXPIRED)
        if (evidence.revision != revision || evidence.targets.none { turnId in it.turnIds }) {
            throw AiGenerationException.Coded(ErrorCode.JOB_EXPIRED)
        }
        val turn =
            record.validatedTurns.singleOrNull { it.turnId == turnId }
                ?: throw AiGenerationException.Coded(ErrorCode.JOB_EXPIRED)
        return ExpandedEvidenceTurn(
            turnId = turn.turnId,
            speakerName = turn.speakerName,
            startSeconds = turn.startSeconds,
            text = sanitizeEvidenceText(turn.text),
        )
    }
}
