package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.JobView
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.shared.security.CurrentMember
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
    fun get(sessionId: UUID, jobId: UUID): JobView
}

interface RegenerateItemUseCase {
    fun regenerate(
        sessionId: UUID,
        jobId: UUID,
        item: GenerationItem,
        model: String?,
        instructions: String?,
    ): RegenerationResult
}

data class RegenerationResult(
    val item: GenerationItem,
    val value: Any,
    val tokens: TokenUsage,
    val costEstimateUsd: BigDecimal,
    val warnings: List<String>,
)

interface CommitGenerationUseCase {
    fun commit(
        host: CurrentMember,
        sessionId: UUID,
        jobId: UUID,
        recordVisibility: SessionRecordVisibility,
        overrideResult: SessionImportV1Snapshot?,
    ): SessionImportCommitResult
}

interface CancelGenerationUseCase {
    fun cancel(sessionId: UUID, jobId: UUID, hostUserId: UUID)
}

/**
 * Thrown when a job lookup misses (Redis TTL expired or never existed).
 * Phase 2 controllers map this to the `JOB_EXPIRED` HTTP error response.
 */
class JobNotFoundException(val jobId: UUID) : RuntimeException("Job $jobId not found or expired")

/**
 * Thrown when sessionId in the URL path does not match the sessionId stored on the job.
 * Phase 2 controllers map this to 404.
 */
class JobSessionMismatchException(
    val jobId: UUID,
    val expectedSessionId: UUID,
    val actualSessionId: UUID,
) : RuntimeException("Job $jobId belongs to session $actualSessionId, not $expectedSessionId")
