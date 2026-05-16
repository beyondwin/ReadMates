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
)

enum class AuditKind { FULL, REGENERATE, COMMIT, CANCEL }

enum class AuditStatus { SUCCESS, FAILED, CANCELLED }
