package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.AiOpsFailureCodeCount
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsProviderCost
import com.readmates.aigen.application.model.AiOpsWindowUsage
import com.readmates.club.domain.PlatformAdminRole
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

interface AiGenerationAuditQueryPort {
    fun countFailuresSince(since: Instant): Long

    fun costSince(since: Instant): BigDecimal

    fun windowUsageBetween(
        start: Instant,
        endExclusive: Instant,
    ): AiOpsWindowUsage

    fun failureCodesSince(since: Instant): List<AiOpsFailureCodeCount>

    fun providerCostsSince(since: Instant): List<AiOpsProviderCost>

    fun listJobs(filters: AiOpsJobFilters): AiOpsJobList

    fun findJobById(jobId: UUID): AiOpsJobListItem?
}

interface AiGenerationAdminActionAuditPort {
    fun record(entry: AiGenerationAdminActionAuditEntry)
}

data class AiGenerationAdminActionAuditEntry(
    val jobId: UUID,
    val clubId: UUID,
    val sessionId: UUID,
    val adminUserId: UUID,
    val adminRole: PlatformAdminRole,
    val action: String,
    val previousStatus: String?,
    val nextStatus: String?,
    val result: String,
    val safeErrorCode: String?,
    val createdAt: Instant,
)
