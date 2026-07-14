package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.TokenUsage
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

interface AiGenerationAuditPort {
    fun insert(entry: AuditLogEntry)
}

data class AuditLogEntry(
    val jobId: UUID,
    val sessionId: UUID,
    val clubId: UUID,
    val hostUserId: UUID,
    val kind: AuditKind,
    val item: GenerationItem?,
    val provider: Provider,
    val model: String,
    val transcriptSha256: String?,
    val usage: TokenUsage,
    val costEstimateUsd: BigDecimal,
    val status: AuditStatus,
    val errorCode: ErrorCode?,
    val errorMessage: String?,
    val latencyMs: Int,
    val createdAt: Instant,
    val pipelineVersion: String? = null,
    val inputTurnCount: Int? = null,
    val speakerCount: Int? = null,
    val groundingStatus: String? = null,
    val groundingWarningCount: Int = 0,
    val reviewedSectionCount: Int = 0,
    val userEditedSectionCount: Int = 0,
) {
    companion object {
        // Mirrors the cohesive identity/context fields of a failed audit row; collapsing
        // these into a parameter object is out of scope for this behavior-preserving change.
        @Suppress("LongParameterList")
        fun failed(
            jobId: UUID,
            sessionId: UUID,
            clubId: UUID,
            hostUserId: UUID,
            provider: Provider,
            model: String,
            transcriptSha256: String?,
            errorCode: ErrorCode,
            errorMessage: String,
            createdAt: Instant,
        ): AuditLogEntry =
            AuditLogEntry(
                jobId = jobId,
                sessionId = sessionId,
                clubId = clubId,
                hostUserId = hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = provider,
                model = model,
                transcriptSha256 = transcriptSha256,
                usage = TokenUsage(0, 0, 0),
                costEstimateUsd = BigDecimal.ZERO,
                status = AuditStatus.FAILED,
                errorCode = errorCode,
                errorMessage = errorMessage,
                latencyMs = 0,
                createdAt = createdAt,
            )
    }
}

enum class AuditKind { FULL, REGENERATE, COMMIT, CANCEL }

enum class AuditStatus { SUCCESS, FAILED, CANCELLED }
