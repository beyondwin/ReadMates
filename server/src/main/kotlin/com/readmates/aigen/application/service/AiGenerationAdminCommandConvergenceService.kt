package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AiOpsAction
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationAdminCancelResult
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceAcquisition
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceLease
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandConvergenceOutcome
import com.readmates.aigen.application.port.out.AiGenerationAdminCommandPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.Clock
import java.time.Duration
import java.util.UUID

@Service
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
@Suppress("MaxLineLength", "ReturnCount")
class AiGenerationAdminCommandConvergenceService(
    private val commandPort: AiGenerationAdminCommandPort,
    private val jobStore: AiGenerationJobStore,
    private val commitRecoveryService: AiGenerationCommitRecoveryService,
    private val clock: Clock,
    private val transactions: TransactionTemplate? = null,
) {
    fun processBatch() {
        commandPort.loadAvailableConvergenceIds(clock.instant(), BATCH_SIZE).forEach(::process)
    }

    fun process(convergenceId: UUID) {
        val leaseOwner = UUID.randomUUID().toString()
        val startedAt = clock.instant()
        val acquire = {
            commandPort.tryAcquireConvergence(
                convergenceId,
                leaseOwner,
                startedAt,
                startedAt.plus(LEASE_DURATION),
            )
        }
        val acquisition = transactions?.execute { acquire() } ?: acquire()
        val lease =
            when (acquisition) {
                is AiGenerationAdminCommandConvergenceAcquisition.Acquired -> acquisition.lease
                AiGenerationAdminCommandConvergenceAcquisition.Terminalized,
                AiGenerationAdminCommandConvergenceAcquisition.Unavailable,
                -> return
            }
        val outcome = safeApply(lease)
        val completedAt = clock.instant()
        val finish = { commandPort.finishConvergence(lease, leaseOwner, outcome, completedAt) }
        transactions?.execute { finish() } ?: finish()
    }

    private fun safeApply(lease: AiGenerationAdminCommandConvergenceLease): AiGenerationAdminCommandConvergenceOutcome =
        try {
            when (lease.action) {
                AiOpsAction.FORCE_CANCEL -> applyCancel(lease)
                AiOpsAction.RETRY_COMMIT -> applyCommitRecovery(lease)
            }
        } catch (_: RuntimeException) {
            retryOrFail(lease, "AI_EFFECT_UNAVAILABLE", "AI_EFFECT_RETRY_EXHAUSTED")
        }

    private fun applyCancel(lease: AiGenerationAdminCommandConvergenceLease): AiGenerationAdminCommandConvergenceOutcome =
        when (val result = jobStore.cancelForAdmin(lease.jobId, lease.expectedJobRevision)) {
            is AiGenerationAdminCancelResult.Cancelled -> succeeded()
            AiGenerationAdminCancelResult.Missing -> failed("JOB_EXPIRED")
            is AiGenerationAdminCancelResult.StateChanged ->
                if (result.status == JobStatus.CANCELLED && result.revision >= lease.expectedJobRevision + 1) {
                    succeeded()
                } else {
                    failed("JOB_STATE_CHANGED")
                }
        }

    private fun applyCommitRecovery(lease: AiGenerationAdminCommandConvergenceLease): AiGenerationAdminCommandConvergenceOutcome {
        val current = jobStore.loadMetadata(lease.jobId) ?: return failed("JOB_EXPIRED")
        if (current.revision != lease.expectedJobRevision ||
            current.status !in setOf(JobStatus.COMMITTING, JobStatus.COMMIT_RETRY, JobStatus.COMMITTED)
        ) {
            return failed("JOB_STATE_CHANGED")
        }
        val recovered = commitRecoveryService.recover(lease.jobId)
        return when (recovered.status) {
            JobStatus.COMMITTED -> succeeded()
            JobStatus.COMMITTING,
            JobStatus.COMMIT_RETRY,
            -> retryOrFail(lease, "COMMIT_PENDING", "COMMIT_RECOVERY_EXHAUSTED")
            else -> failed("JOB_STATE_CHANGED")
        }
    }

    private fun retryOrFail(
        lease: AiGenerationAdminCommandConvergenceLease,
        retryCode: String,
        exhaustedCode: String,
    ): AiGenerationAdminCommandConvergenceOutcome =
        if (lease.attemptNo >= MAX_ATTEMPTS) {
            failed(exhaustedCode)
        } else {
            AiGenerationAdminCommandConvergenceOutcome(
                state = "PENDING",
                safeErrorCode = retryCode,
                availableAt = clock.instant().plus(RETRY_DELAY),
            )
        }

    private fun succeeded() = AiGenerationAdminCommandConvergenceOutcome("SUCCEEDED", null, null)

    private fun failed(code: String) = AiGenerationAdminCommandConvergenceOutcome("FAILED", code, null)

    private companion object {
        const val BATCH_SIZE = 25
        const val MAX_ATTEMPTS = 3
        val LEASE_DURATION: Duration = Duration.ofMinutes(1)
        val RETRY_DELAY: Duration = Duration.ofSeconds(30)
    }
}
