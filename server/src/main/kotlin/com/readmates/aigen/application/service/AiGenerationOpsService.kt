package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.AiOpsAdminActionResult
import com.readmates.aigen.application.model.AiOpsCostTrend
import com.readmates.aigen.application.model.AiOpsCostWindow
import com.readmates.aigen.application.model.AiOpsDeltaDirection
import com.readmates.aigen.application.model.AiOpsJobFilters
import com.readmates.aigen.application.model.AiOpsJobList
import com.readmates.aigen.application.model.AiOpsJobListItem
import com.readmates.aigen.application.model.AiOpsSummary
import com.readmates.aigen.application.model.AiOpsTrendAvailability
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.ForceCancelAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsJobUseCase
import com.readmates.aigen.application.port.`in`.GetAiOpsSummaryUseCase
import com.readmates.aigen.application.port.`in`.ListAiOpsJobsUseCase
import com.readmates.aigen.application.port.`in`.RetryAiOpsJobCommitUseCase
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditEntry
import com.readmates.aigen.application.port.out.AiGenerationAdminActionAuditPort
import com.readmates.aigen.application.port.out.AiGenerationAuditQueryPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.club.domain.PlatformAdminRole
import com.readmates.shared.security.AccessDeniedException
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.time.Clock
import java.time.Duration
import java.time.ZoneOffset
import java.util.UUID

@Service
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class AiGenerationOpsService(
    private val auditQueryPort: AiGenerationAuditQueryPort,
    private val adminActionAuditPort: AiGenerationAdminActionAuditPort,
    private val jobStore: AiGenerationJobStore,
    private val clock: Clock,
    private val commitRecoveryService: AiGenerationCommitRecoveryService? = null,
) : GetAiOpsSummaryUseCase,
    ListAiOpsJobsUseCase,
    GetAiOpsJobUseCase,
    ForceCancelAiOpsJobUseCase,
    RetryAiOpsJobCommitUseCase {
    override fun summary(
        admin: CurrentPlatformAdmin,
        window: AiOpsCostWindow,
    ): AiOpsSummary {
        val now = clock.instant()
        val activeJobs = jobStore.loadActiveJobs()
        val monthStart =
            now
                .atZone(ZoneOffset.UTC)
                .withDayOfMonth(1)
                .toLocalDate()
                .atStartOfDay(ZoneOffset.UTC)
                .toInstant()
        return AiOpsSummary(
            activeJobCount = activeJobs.size,
            failedLast24h = auditQueryPort.countFailuresSince(now.minus(Duration.ofHours(24))),
            monthToDateCostEstimateUsd = auditQueryPort.costSince(monthStart),
            failureCodes = auditQueryPort.failureCodesSince(monthStart),
            providerCosts = auditQueryPort.providerCostsSince(monthStart),
            staleCandidateCount =
                activeJobs.count {
                    it.status in STALE_CANDIDATE_STATUSES &&
                        it.lastUpdatedAt.isBefore(now.minus(STALE_CANDIDATE_AGE))
                },
            costTrend = costTrend(now, window),
        )
    }

    private fun costTrend(
        now: java.time.Instant,
        window: AiOpsCostWindow,
    ): AiOpsCostTrend {
        val windowSeconds = Duration.ofDays(window.days)
        val currentStart = now.minus(windowSeconds)
        val priorStart = now.minus(windowSeconds.multipliedBy(2))
        val current = auditQueryPort.windowUsageBetween(currentStart, now)
        val prior = auditQueryPort.windowUsageBetween(priorStart, currentStart)
        val available = prior.jobCount > 0
        val direction =
            if (!available) {
                AiOpsDeltaDirection.NONE
            } else {
                when (current.costUsd.compareTo(prior.costUsd)) {
                    1 -> AiOpsDeltaDirection.UP
                    -1 -> AiOpsDeltaDirection.DOWN
                    else -> AiOpsDeltaDirection.FLAT
                }
            }
        return AiOpsCostTrend(
            window = window,
            currentCostUsd = current.costUsd,
            priorCostUsd = prior.costUsd,
            currentJobCount = current.jobCount,
            priorJobCount = prior.jobCount,
            deltaDirection = direction,
            availability = if (available) AiOpsTrendAvailability.AVAILABLE else AiOpsTrendAvailability.NOT_ENOUGH_DATA,
        )
    }

    override fun list(
        admin: CurrentPlatformAdmin,
        filters: AiOpsJobFilters,
    ): AiOpsJobList {
        val now = clock.instant()
        val liveItems =
            if (filters.cursor == null) {
                jobStore
                    .loadActiveJobs()
                    .filter { it.matches(filters) }
                    .map { it.toOpsItem(now) }
            } else {
                emptyList()
            }
        val historical = auditQueryPort.listJobs(filters)
        return AiOpsJobList(
            items = (liveItems + historical.items).distinctBy { it.jobId },
            nextCursor = historical.nextCursor,
        )
    }

    override fun get(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsJobListItem =
        jobStore.findJobById(jobId)?.toOpsItem(clock.instant())
            ?: auditQueryPort.findJobById(jobId)
            ?: throw AiGenerationException.JobNotFound(jobId)

    override fun forceCancel(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsAdminActionResult {
        if (admin.role !in ACTION_ROLES) {
            throw AccessDeniedException("Platform admin role ${admin.role} cannot force-cancel AI generation jobs")
        }
        val record =
            jobStore.findJobById(jobId)
                ?: throw safeMissingLiveJob(jobId)
        if (record.status !in FORCE_CANCEL_STATUSES) {
            throw AiGenerationException.IllegalGenerationState(jobId, record.status.name, "admin force-cancel")
        }
        val cancelled =
            jobStore.transitionStatus(
                jobId = jobId,
                expected = FORCE_CANCEL_STATUSES,
                next = JobStatus.CANCELLED,
                stage = null,
                progressPct = 0,
                error = null,
            )
        if (!cancelled) {
            throw AiGenerationException.IllegalGenerationState(
                jobId = jobId,
                currentStatus = jobStore.load(jobId)?.status?.name ?: "MISSING",
                attemptedAction = "admin force-cancel",
            )
        }
        jobStore.deleteTransientPayload(jobId)
        adminActionAuditPort.record(
            AiGenerationAdminActionAuditEntry(
                jobId = jobId,
                clubId = record.clubId,
                sessionId = record.sessionId,
                adminUserId = admin.userId,
                adminRole = admin.role,
                action = AiOpsAction.FORCE_CANCEL.name,
                previousStatus = record.status.name,
                nextStatus = JobStatus.CANCELLED.name,
                result = "SUCCESS",
                safeErrorCode = null,
                createdAt = clock.instant(),
            ),
        )
        return AiOpsAdminActionResult(jobId, record.status, JobStatus.CANCELLED)
    }

    override fun retryCommit(
        admin: CurrentPlatformAdmin,
        jobId: UUID,
    ): AiOpsAdminActionResult {
        if (admin.role !in ACTION_ROLES) {
            throw AccessDeniedException("Platform admin role ${admin.role} cannot retry AI generation commits")
        }
        val record =
            jobStore.findJobById(jobId)
                ?: throw safeMissingLiveJob(jobId)
        if (record.status !in RETRY_COMMIT_STATUSES) {
            throw AiGenerationException.IllegalGenerationState(jobId, record.status.name, "admin retry-commit")
        }
        val recovered = requireNotNull(commitRecoveryService) { "AI commit recovery is unavailable" }.recover(jobId)
        adminActionAuditPort.record(
            AiGenerationAdminActionAuditEntry(
                jobId = jobId,
                clubId = record.clubId,
                sessionId = record.sessionId,
                adminUserId = admin.userId,
                adminRole = admin.role,
                action = AiOpsAction.RETRY_COMMIT.name,
                previousStatus = record.status.name,
                nextStatus = recovered.status.name,
                result = "SUCCESS",
                safeErrorCode = null,
                createdAt = clock.instant(),
            ),
        )
        return AiOpsAdminActionResult(jobId, record.status, recovered.status)
    }

    private fun safeMissingLiveJob(jobId: UUID): AiGenerationException {
        val historical = auditQueryPort.findJobById(jobId) ?: return AiGenerationException.JobNotFound(jobId)
        val safeCode = if (historical.status in TERMINAL_STATUSES) "JOB_NOT_LIVE" else "JOB_EXPIRED"
        return AiGenerationException.SafeOpsError(jobId, safeCode)
    }

    private fun JobRecord.matches(filters: AiOpsJobFilters): Boolean =
        (filters.status == null || status == filters.status) &&
            (filters.clubId == null || clubId == filters.clubId) &&
            (filters.errorCode == null || error?.code?.name == filters.errorCode)

    private fun JobRecord.toOpsItem(now: java.time.Instant): AiOpsJobListItem =
        AiOpsJobListItem(
            jobId = jobId,
            clubId = clubId,
            clubSlug = null,
            clubName = null,
            sessionId = sessionId,
            sessionNumber = sessionMeta.sessionNumber,
            bookTitle = sessionMeta.bookTitle,
            status = status,
            stage = stage,
            provider = model.provider,
            model = model.name,
            errorCode = error?.code?.name,
            safeErrorMessage = null,
            costEstimateUsd = costAccumulatedUsd,
            createdAt = createdAt,
            lastUpdatedAt = lastUpdatedAt,
            expiresAt = expiresAt,
            staleCandidate = status in STALE_CANDIDATE_STATUSES && lastUpdatedAt.isBefore(now.minus(STALE_CANDIDATE_AGE)),
            availableActions =
                buildSet {
                    if (status in FORCE_CANCEL_STATUSES) add(AiOpsAction.FORCE_CANCEL)
                    if (status in RETRY_COMMIT_STATUSES) add(AiOpsAction.RETRY_COMMIT)
                },
            revision =
                revision.takeIf {
                    pipelineMode ==
                        com.readmates.aigen.application.model.AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT
                },
            cleanupPending = cleanupPending,
            commitLeaseExpiresAt = commitLeaseExpiresAt,
        )

    private companion object {
        val ACTION_ROLES = setOf(PlatformAdminRole.OWNER, PlatformAdminRole.OPERATOR)
        val FORCE_CANCEL_STATUSES =
            setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED)
        val RETRY_COMMIT_STATUSES = setOf(JobStatus.COMMIT_RETRY)
        val STALE_CANDIDATE_STATUSES =
            setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.COMMITTING, JobStatus.COMMIT_RETRY)
        val TERMINAL_STATUSES = setOf(JobStatus.COMMITTED, JobStatus.CANCELLED, JobStatus.FAILED)
        val STALE_CANDIDATE_AGE: Duration = Duration.ofMinutes(15)
    }
}
