package com.readmates.admin.operations.adapter.out.source

import com.readmates.admin.operations.application.model.AdminOperationSeverity
import com.readmates.admin.operations.application.model.AdminOperationSignal
import com.readmates.admin.operations.application.model.AdminOperationSignalBatch
import com.readmates.admin.operations.application.model.AdminOperationSourceStatus
import com.readmates.admin.operations.application.model.AdminOperationSourceType
import com.readmates.admin.operations.application.port.out.AdminOperationSignalProvider
import com.readmates.admin.operations.application.port.out.AdminOperationSignalVerification
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.GetAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.ListAiOpsJobsUseCase
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.OffsetDateTime
import java.util.UUID

@Component
class AiOperationSignalProvider(
    private val properties: AiGenerationProperties,
    private val listJobsUseCase: ListAiOpsJobsUseCase? = null,
    private val getJobUseCase: GetAiOpsJobUseCase? = null,
    private val clock: Clock,
) : AdminOperationSignalProvider {
    override val sourceType = AdminOperationSourceType.AI_JOB

    override fun collect(admin: CurrentPlatformAdmin): AdminOperationSignalBatch {
        val generatedAt = OffsetDateTime.now(clock)
        if (!properties.enabled) {
            return AdminOperationSignalBatch(
                sourceType = sourceType,
                status = AdminOperationSourceStatus.DISABLED,
                generatedAt = generatedAt,
                authoritative = false,
                signals = emptyList(),
            )
        }
        val jobs = requireNotNull(listJobsUseCase) { "AI Ops job list is unavailable" }.list(admin, EMPTY_FILTERS)
        val authoritative = jobs.nextCursor == null
        return AdminOperationSignalBatch(
            sourceType = sourceType,
            status = if (authoritative) AdminOperationSourceStatus.AVAILABLE else AdminOperationSourceStatus.PARTIAL,
            generatedAt = generatedAt,
            authoritative = authoritative,
            signals = jobs.items.mapNotNull { it.toSignal(generatedAt) },
        )
    }

    @Suppress("ReturnCount")
    override fun verify(
        admin: CurrentPlatformAdmin,
        sourceKey: String,
    ): AdminOperationSignalVerification {
        if (!properties.enabled) return AdminOperationSignalVerification.UNAVAILABLE
        val jobId = sourceKey.aiJobId() ?: return AdminOperationSignalVerification.ABSENT
        val job =
            try {
                requireNotNull(getJobUseCase) { "AI Ops exact job lookup is unavailable" }.get(admin, jobId)
            } catch (_: AiGenerationException.JobNotFound) {
                return AdminOperationSignalVerification.ABSENT
            }
        return if (job.toSignal(OffsetDateTime.now(clock)) == null) {
            AdminOperationSignalVerification.ABSENT
        } else {
            AdminOperationSignalVerification.ACTIVE
        }
    }

    private fun AiOpsJobListItem.toSignal(observedAt: OffsetDateTime): AdminOperationSignal? {
        val failed = status == JobStatus.FAILED
        if (!failed && !staleCandidate) return null
        return AdminOperationSignal(
            sourceType = sourceType,
            sourceKey = "$AI_SOURCE_PREFIX$jobId",
            clubId = clubId,
            severity = if (failed) AdminOperationSeverity.CRITICAL else AdminOperationSeverity.WARNING,
            summaryCode = if (failed) "AI_JOB_FAILED" else "AI_JOB_STALE",
            impactCount = 1,
            detailHref = "/admin/ai-ops?clubId=$clubId",
            observedAt = observedAt,
        )
    }

    private fun String.aiJobId(): UUID? {
        if (!startsWith(AI_SOURCE_PREFIX)) return null
        return runCatching { UUID.fromString(removePrefix(AI_SOURCE_PREFIX)) }.getOrNull()
    }

    private companion object {
        const val AI_SOURCE_PREFIX = "AI_JOB:"
        val EMPTY_FILTERS = AiOpsJobFilters(status = null, clubId = null, errorCode = null, cursor = null)
    }
}
