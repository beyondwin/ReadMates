package com.readmates.aigen.application.model

import com.readmates.club.domain.PlatformAdminRole
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class AiOpsSummary(
    val activeJobCount: Int,
    val failedLast24h: Long,
    val monthToDateCostEstimateUsd: BigDecimal,
    val failureCodes: List<AiOpsFailureCodeCount>,
    val providerCosts: List<AiOpsProviderCost>,
    val staleCandidateCount: Int,
)

data class AiOpsFailureCodeCount(
    val code: String,
    val count: Long,
)

data class AiOpsProviderCost(
    val provider: Provider,
    val model: String,
    val costEstimateUsd: BigDecimal,
)

data class AiOpsJobList(
    val items: List<AiOpsJobListItem>,
    val nextCursor: String?,
)

data class AiOpsJobListItem(
    val jobId: UUID,
    val clubId: UUID,
    val clubSlug: String?,
    val clubName: String?,
    val sessionId: UUID,
    val sessionNumber: Int?,
    val bookTitle: String?,
    val status: JobStatus,
    val stage: JobStage?,
    val provider: Provider,
    val model: String,
    val errorCode: String?,
    val safeErrorMessage: String?,
    val costEstimateUsd: BigDecimal,
    val createdAt: Instant,
    val lastUpdatedAt: Instant,
    val expiresAt: Instant?,
    val staleCandidate: Boolean,
    val availableActions: Set<AiOpsAction>,
)

enum class AiOpsAction { FORCE_CANCEL }

data class AiOpsJobFilters(
    val status: JobStatus?,
    val clubId: UUID?,
    val errorCode: String?,
    val cursor: String?,
)

data class AiOpsAdminActionResult(
    val jobId: UUID,
    val previousStatus: JobStatus,
    val nextStatus: JobStatus,
)

data class AiOpsAdminActor(
    val userId: UUID,
    val role: PlatformAdminRole,
)
