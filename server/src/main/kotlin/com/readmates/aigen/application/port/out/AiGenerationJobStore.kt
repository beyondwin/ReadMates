package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
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

    /** Delete all 3 job keys (hash, transcript, result) atomically. Used on commit/cancel. */
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
    val status: JobStatus,
    val stage: JobStage?,
    val progressPct: Int,
    val result: SessionImportV1Snapshot?,
    val error: GenerationError?,
    val tokens: TokenUsage,
    val costAccumulatedUsd: BigDecimal,
    val expiresAt: Instant,
)
