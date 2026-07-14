package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.model.AiOpsAdminActionResult
import com.readmates.aigen.application.model.AiOpsCostTrend
import com.readmates.aigen.application.model.AiOpsFailureCodeCount
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsProviderCost
import com.readmates.aigen.application.model.AiOpsSummary
import java.util.UUID

data class AiOpsSummaryResponse(
    val activeJobCount: Int,
    val failedLast24h: Long,
    val monthToDateCostEstimateUsd: String,
    val failureCodes: List<AiOpsFailureCodeCountResponse>,
    val providerCosts: List<AiOpsProviderCostResponse>,
    val staleCandidateCount: Int,
    val costTrend: AiOpsCostTrendResponse,
) {
    companion object {
        fun from(summary: AiOpsSummary): AiOpsSummaryResponse =
            AiOpsSummaryResponse(
                activeJobCount = summary.activeJobCount,
                failedLast24h = summary.failedLast24h,
                monthToDateCostEstimateUsd = summary.monthToDateCostEstimateUsd.toPlainString(),
                failureCodes = summary.failureCodes.map(AiOpsFailureCodeCountResponse::from),
                providerCosts = summary.providerCosts.map(AiOpsProviderCostResponse::from),
                staleCandidateCount = summary.staleCandidateCount,
                costTrend = AiOpsCostTrendResponse.from(summary.costTrend),
            )
    }
}

data class AiOpsCostTrendResponse(
    val window: String,
    val currentCostUsd: String,
    val priorCostUsd: String,
    val currentJobCount: Long,
    val priorJobCount: Long,
    val deltaDirection: String,
    val availability: String,
) {
    companion object {
        fun from(trend: AiOpsCostTrend): AiOpsCostTrendResponse =
            AiOpsCostTrendResponse(
                window = trend.window.wire,
                currentCostUsd = trend.currentCostUsd.toPlainString(),
                priorCostUsd = trend.priorCostUsd.toPlainString(),
                currentJobCount = trend.currentJobCount,
                priorJobCount = trend.priorJobCount,
                deltaDirection = trend.deltaDirection.name,
                availability = trend.availability.name,
            )
    }
}

data class AiOpsFailureCodeCountResponse(
    val code: String,
    val count: Long,
) {
    companion object {
        fun from(count: AiOpsFailureCodeCount): AiOpsFailureCodeCountResponse = AiOpsFailureCodeCountResponse(count.code, count.count)
    }
}

data class AiOpsProviderCostResponse(
    val provider: String,
    val model: String,
    val costEstimateUsd: String,
) {
    companion object {
        fun from(cost: AiOpsProviderCost): AiOpsProviderCostResponse =
            AiOpsProviderCostResponse(
                provider = cost.provider.name,
                model = cost.model,
                costEstimateUsd = cost.costEstimateUsd.toPlainString(),
            )
    }
}

data class AiOpsJobListResponse(
    val items: List<AiOpsJobResponse>,
    val nextCursor: String?,
) {
    companion object {
        fun from(list: AiOpsJobList): AiOpsJobListResponse =
            AiOpsJobListResponse(
                items = list.items.map(AiOpsJobResponse::from),
                nextCursor = list.nextCursor,
            )
    }
}

data class AiOpsJobResponse(
    val jobId: UUID,
    val club: AiOpsClubResponse,
    val session: AiOpsSessionResponse,
    val status: String,
    val stage: String?,
    val provider: String,
    val model: String,
    val errorCode: String?,
    val safeErrorMessage: String?,
    val costEstimateUsd: String,
    val createdAt: String,
    val lastUpdatedAt: String,
    val expiresAt: String?,
    val staleCandidate: Boolean,
    val availableActions: List<String>,
    val revision: Long?,
    val cleanupPending: Boolean,
    val commitLeaseExpiresAt: String?,
) {
    companion object {
        fun from(item: AiOpsJobListItem): AiOpsJobResponse =
            AiOpsJobResponse(
                jobId = item.jobId,
                club =
                    AiOpsClubResponse(
                        clubId = item.clubId,
                        slug = item.clubSlug,
                        name = item.clubName,
                    ),
                session =
                    AiOpsSessionResponse(
                        sessionId = item.sessionId,
                        number = item.sessionNumber,
                        bookTitle = item.bookTitle,
                    ),
                status = item.status.name,
                stage = item.stage?.name,
                provider = item.provider.name,
                model = item.model,
                errorCode = item.errorCode,
                safeErrorMessage = item.safeErrorMessage,
                costEstimateUsd = item.costEstimateUsd.toPlainString(),
                createdAt = item.createdAt.toString(),
                lastUpdatedAt = item.lastUpdatedAt.toString(),
                expiresAt = item.expiresAt?.toString(),
                staleCandidate = item.staleCandidate,
                availableActions = item.availableActions.map { it.name }.sorted(),
                revision = item.revision,
                cleanupPending = item.cleanupPending,
                commitLeaseExpiresAt = item.commitLeaseExpiresAt?.toString(),
            )
    }
}

data class AiOpsClubResponse(
    val clubId: UUID,
    val slug: String?,
    val name: String?,
)

data class AiOpsSessionResponse(
    val sessionId: UUID,
    val number: Int?,
    val bookTitle: String?,
)

data class AiOpsAdminActionResponse(
    val jobId: UUID,
    val previousStatus: String,
    val nextStatus: String,
) {
    companion object {
        fun from(result: AiOpsAdminActionResult): AiOpsAdminActionResponse =
            AiOpsAdminActionResponse(
                jobId = result.jobId,
                previousStatus = result.previousStatus.name,
                nextStatus = result.nextStatus.name,
            )
    }
}
