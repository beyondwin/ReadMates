package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.JobView
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionimport.application.model.SessionImportCommitResult
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * Input ports for the AI session generation flow (spec §7).
 *
 * Implementations live in `com.readmates.aigen.application.service`. Phase 2 wires
 * REST controllers to these.
 */
interface StartGenerationUseCase {
    fun start(command: StartGenerationCommand): StartGenerationResult
}

data class AvailableGenerationModel(
    val id: String,
    val provider: Provider,
    val isDefault: Boolean,
)

interface ListGenerationModelsUseCase {
    fun list(
        sessionId: UUID,
        clubId: UUID,
    ): List<AvailableGenerationModel>
}

data class StartGenerationCommand(
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val transcript: String,
    val model: String?,
    val authorNameMode: AuthorNameMode,
    val instructions: String?,
    val sessionMeta: SessionMeta,
)

data class StartGenerationResult(
    val jobId: UUID,
    val status: JobStatus,
    val expiresAt: Instant,
)

interface GetJobUseCase {
    fun get(
        sessionId: UUID,
        jobId: UUID,
    ): JobView
}

interface GetRecentSessionGenerationJobUseCase {
    fun recent(sessionId: UUID): JobView?
}

interface RegenerateItemUseCase {
    fun regenerate(
        sessionId: UUID,
        jobId: UUID,
        item: GenerationItem,
        model: String?,
        instructions: String?,
        expectedRevision: Long? = null,
    ): RegenerationResult
}

data class RegenerationResult(
    val item: GenerationItem,
    val value: Any,
    val tokens: TokenUsage,
    val costEstimateUsd: BigDecimal,
    val warnings: List<String>,
    val revision: Long? = null,
    val result: SessionImportV1Snapshot? = null,
    val evidence: GroundedEvidenceBundle? = null,
)

interface CommitGenerationUseCase {
    fun commit(
        host: AiGenerationActor,
        sessionId: UUID,
        jobId: UUID,
        recordVisibility: SessionRecordVisibility,
        overrideResult: SessionImportV1Snapshot?,
    ): SessionImportCommitResult
}

interface CancelGenerationUseCase {
    fun cancel(
        sessionId: UUID,
        jobId: UUID,
        hostUserId: UUID,
    )
}

/**
 * Backwards-compatible alias for [com.readmates.aigen.application.AiGenerationException.JobNotFound]
 * (task_1_7 finding #9). The new sealed [com.readmates.aigen.application.AiGenerationException]
 * hierarchy is the source of truth — these typealiases let existing callers/tests keep their
 * imports without churn.
 */
typealias JobNotFoundException = com.readmates.aigen.application.AiGenerationException.JobNotFound

/** Backwards-compatible alias for [com.readmates.aigen.application.AiGenerationException.JobSessionMismatch]. */
typealias JobSessionMismatchException = com.readmates.aigen.application.AiGenerationException.JobSessionMismatch
