package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationCommitPersistencePort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.time.Clock
import java.util.UUID

data class AiGenerationCommitRecoveryResult(
    val jobId: UUID,
    val status: JobStatus,
    val recovered: Boolean,
)

@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationCommitRecoveryService(
    private val jobStore: AiGenerationJobStore,
    private val persistence: AiGenerationCommitPersistencePort,
    private val cleanupService: AiGenerationPostCommitCleanupService,
    private val clock: Clock,
) {
    @Suppress("ReturnCount")
    fun recover(jobId: UUID): AiGenerationCommitRecoveryResult {
        val record =
            jobStore.loadMetadata(jobId)
                ?: return AiGenerationCommitRecoveryResult(jobId, JobStatus.COMMIT_RETRY, false)
        val receipt = persistence.findReceipt(jobId, record.revision)
        if (receipt != null && receipt.sessionId == record.sessionId && receipt.clubId == record.clubId) {
            if (record.status == JobStatus.COMMITTING || record.status == JobStatus.COMMIT_RETRY) {
                jobStore.markCommittedForCleanup(jobId, record.revision)
            }
            val current = jobStore.loadMetadata(jobId)
            if (current?.status == JobStatus.COMMITTED && current.cleanupPending) {
                cleanupService.cleanup(jobId, record.revision, record.clubId)
            }
            val finalStatus = jobStore.loadMetadata(jobId)?.status ?: record.status
            return AiGenerationCommitRecoveryResult(
                jobId,
                finalStatus,
                recovered = finalStatus == JobStatus.COMMITTED,
            )
        }
        if (record.status == JobStatus.COMMITTING) {
            jobStore.recoverExpiredCommitLease(jobId, clock.instant())
        }
        return AiGenerationCommitRecoveryResult(jobId, jobStore.loadMetadata(jobId)?.status ?: record.status, false)
    }

    fun recoverBatch(limit: Int = 50): List<AiGenerationCommitRecoveryResult> =
        jobStore.loadCommitRecoveryJobs(limit).mapNotNull { record ->
            runCatching { recover(record.jobId) }.getOrNull()
        }
}
