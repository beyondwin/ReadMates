package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.AiGenerationCommitPersistencePort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import org.slf4j.LoggerFactory
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
    private val metrics: AiGenerationMetrics,
) {
    @Suppress("ReturnCount")
    fun recover(jobId: UUID): AiGenerationCommitRecoveryResult {
        val record =
            jobStore.loadMetadata(jobId)
                ?: return AiGenerationCommitRecoveryResult(jobId, JobStatus.COMMIT_RETRY, false)
        val receipt = persistence.findReceipt(jobId, record.revision)
        if (receipt?.isCompleteFor(record) == true) {
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

    private fun com.readmates.aigen.application.port.out.AiGenerationCommitReceipt.isCompleteFor(
        record: com.readmates.aigen.application.port.out.JobRecord,
    ): Boolean =
        listOf(
            sessionId == record.sessionId,
            clubId == record.clubId,
            draftRevision != null,
            baseLiveRevision != null,
            requestSha256?.length == SHA256_LENGTH,
        ).all { it }

    fun recoverBatch(limit: Int = 50): List<AiGenerationCommitRecoveryResult> =
        jobStore.loadCommitRecoveryJobs(limit).mapNotNull { record ->
            try {
                recover(record.jobId)
            } catch (
                @Suppress("TooGenericExceptionCaught") error: RuntimeException,
            ) {
                metrics.recordCommitRecoveryFailure()
                log.warn(
                    "AI generation commit recovery failed jobId={} status={} errorType={}",
                    record.jobId,
                    record.status,
                    error::class.simpleName ?: "RuntimeException",
                )
                null
            }
        }

    private companion object {
        const val SHA256_LENGTH = 64
        val log = LoggerFactory.getLogger(AiGenerationCommitRecoveryService::class.java)
    }
}
