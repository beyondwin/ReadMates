package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * Outbound port for storing AI generation jobs.
 * Implementations (Redis adapter) persist job state, transcripts and results
 * with TTL-based cleanup. Transcript body and result JSON live in separate
 * Redis keys per spec §8.1.
 */
interface AiGenerationJobStore {
    fun save(job: JobRecord): Unit

    fun load(jobId: UUID): JobRecord?

    fun findJobById(jobId: UUID): JobRecord? = load(jobId)

    fun loadRecentForSession(
        sessionId: UUID,
        limit: Int = 20,
    ): List<JobRecord>

    fun loadActiveJobs(limit: Int = 100): List<JobRecord>

    fun saveResult(
        jobId: UUID,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
    ): Unit

    /**
     * Atomically replace the full result (caller provides the already-patched snapshot)
     * and accumulate token usage + cost. The [value] parameter records the new value
     * applied for [item] but the source of truth is the full snapshot serialized via
     * [saveResult]-style write under the `:result` key.
     */
    fun patchItem(
        jobId: UUID,
        item: GenerationItem,
        value: Any,
        usage: TokenUsage,
        cost: BigDecimal,
    ): Unit

    fun updateStatus(
        jobId: UUID,
        status: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
    ): Unit

    /**
     * Atomically increment the per-job LLM call counter and return the new value.
     * Used by [com.readmates.aigen.application.service.AiGenerationWorker] and
     * [com.readmates.aigen.application.service.AiGenerationRegenerationService] to
     * enforce the spec §9.2 hard cap (`maxLlmCallsPerJob`).
     *
     * The counter increments per LLM call ATTEMPT — including provider-side retries
     * and validator-driven strengthened-instruction retries — so a job that triggers
     * many retries can still hit the cap mid-flight.
     */
    fun incrementLlmCallCount(jobId: UUID): Int

    /**
     * Atomically change status only when the current status belongs to [expected].
     * Returns false when the job is missing or a competing transition already won.
     */
    fun transitionStatus(
        jobId: UUID,
        expected: Set<JobStatus>,
        next: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
    ): Boolean

    /**
     * Atomically save the full result only when the job is still in [expected].
     * Returns false when commit/cancel/another worker transition already won.
     *
     * Each parameter is one atomic write field of the result commit; grouping
     * into a DTO would only hide the persisted columns behind another type.
     */
    @Suppress("LongParameterList")
    fun saveResultIfStatus(
        jobId: UUID,
        expected: JobStatus,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
        actualModel: ModelId? = null,
    ): Boolean

    /**
     * Delete transient PII/result payload keys while keeping the safe job hash for
     * terminal status reads until the hash TTL expires.
     */
    fun deleteTransientPayload(jobId: UUID): Unit

    /** Delete all 3 job keys (hash, transcript, result) atomically. Used for stale job cleanup. */
    fun delete(jobId: UUID): Unit
}

data class JobRecord(
    val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val model: ModelId,
    val authorNameMode: AuthorNameMode,
    val instructions: String?,
    /** Transcript body. Persisted under the separate `aigen:job:{jobId}:transcript` key, never in the hash. */
    val transcript: String,
    /**
     * The session metadata the host supplied at job start, used by the Worker to drive
     * generator prompts and validation. Persisted as a JSON-serialized hash field on the
     * job record so the async Worker can recover it without re-running authorization.
     */
    val sessionMeta: SessionMeta,
    val status: JobStatus,
    val stage: JobStage?,
    val progressPct: Int,
    val result: SessionImportV1Snapshot?,
    val error: GenerationError?,
    val tokens: TokenUsage,
    val costAccumulatedUsd: BigDecimal,
    val expiresAt: Instant,
    val createdAt: Instant,
    val lastUpdatedAt: Instant,
    /**
     * The model that actually produced the result when cross-provider failover
     * occurred. Null means no failover (actual == [model]). Used so cost/audit/
     * metrics reflect the provider that really ran.
     */
    val actualModel: ModelId? = null,
    /**
     * Running count of LLM calls attempted for this job (start + worker retries +
     * regenerations). Compared against
     * [com.readmates.aigen.config.AiGenerationProperties.Job.maxLlmCallsPerJob]
     * to enforce the spec §9.2 hard cap.
     */
    val llmCallCount: Int = 0,
    val pipelineMode: AiGenerationPipelineMode = AiGenerationPipelineMode.LEGACY,
    val validatedTurns: List<ValidatedTranscriptTurn> = emptyList(),
) {
    /**
     * The [SessionMeta] for downstream generator / regenerator prompts and validator
     * checks. Pulls from the persisted [sessionMeta] (authoritative) and overlays the
     * current [authorNameMode] so the host's REAL vs ALIAS choice always takes effect,
     * even if the original meta was constructed before that distinction existed.
     *
     * Centralizes the worker/regen duplication called out in task_1_7 finding #11.
     * Worker, regeneration, and commit validation all use this metadata as the
     * original trust boundary. User-edited snapshots may change content, but they
     * must not redefine the session identity or expected author list.
     */
    fun toSessionMeta(): SessionMeta = sessionMeta.copy(authorNameMode = authorNameMode)
}
