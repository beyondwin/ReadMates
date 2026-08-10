package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.JobRecord
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration
import java.util.UUID

internal fun providerAttemptsKey(jobId: UUID) = "aigen:job:$jobId:provider-attempts"

internal const val ACTIVE_JOBS_KEY = "aigen:jobs:active"
internal const val ACTIVE_INDEX_EPOCH_KEY = "aigen:jobs:active:epoch"
internal const val PROCESSING_RECOVERY_KEY = "aigen:jobs:processing-recovery"
internal const val PROCESSING_QUARANTINE_KEY = "aigen:jobs:processing-recovery:quarantine"
internal const val PROCESSING_REPAIR_STATE_KEY = "aigen:jobs:processing-recovery:repair-state"
internal const val COMMIT_RECOVERY_JOBS_KEY = "aigen:jobs:commit-recovery"

internal fun activeClubJobsKey(clubId: UUID) = "aigen:club:$clubId:jobs:active"

internal fun sessionRecentKey(sessionId: UUID) = "aigen:session:$sessionId:jobs"

@Suppress("TooManyFunctions")
internal class AiGenerationRedisIndexes(
    private val redisTemplate: StringRedisTemplate,
    private val ttl: Duration,
) {
    fun recentIds(
        sessionId: UUID,
        limit: Int,
    ): Set<String> =
        redisTemplate
            .opsForZSet()
            .reverseRange(sessionRecentKey(sessionId), 0, (limit - 1).coerceAtLeast(0).toLong())
            .orEmpty()

    fun activeIds(limit: Int): Set<String> =
        redisTemplate
            .opsForZSet()
            .reverseRange(ACTIVE_JOBS_KEY, 0, (limit - 1).coerceAtLeast(0).toLong())
            .orEmpty()

    fun commitRecoveryIds(limit: Int): Set<String> =
        redisTemplate.opsForZSet().range(COMMIT_RECOVERY_JOBS_KEY, 0, (limit - 1).coerceAtLeast(0).toLong()).orEmpty()

    fun isActive(job: JobRecord): Boolean = job.status in ACTIVE_INDEX_STATUSES

    fun removeActive(job: JobRecord) {
        remove(job.jobId, sessionId = null, clubId = job.clubId)
    }

    fun remove(
        jobId: UUID,
        sessionId: UUID?,
        clubId: UUID?,
    ) {
        val id = jobId.toString()
        val zSet = redisTemplate.opsForZSet()
        zSet.remove(ACTIVE_JOBS_KEY, id)
        zSet.remove(COMMIT_RECOVERY_JOBS_KEY, id)
        zSet.remove(PROCESSING_RECOVERY_KEY, id)
        zSet.remove(PROCESSING_QUARANTINE_KEY, id)
        sessionId?.let { zSet.remove(sessionRecentKey(it), id) }
        clubId?.let { zSet.remove(activeClubJobsKey(it), id) }
    }

    fun removeRecent(
        sessionId: UUID,
        id: String,
    ) {
        redisTemplate.opsForZSet().remove(sessionRecentKey(sessionId), id)
    }

    fun removeActiveId(id: String) {
        redisTemplate.opsForZSet().remove(ACTIVE_JOBS_KEY, id)
    }

    fun removeCommitRecoveryId(id: String) {
        redisTemplate.opsForZSet().remove(COMMIT_RECOVERY_JOBS_KEY, id)
    }

    private companion object {
        val ACTIVE_INDEX_STATUSES =
            setOf(
                JobStatus.PENDING,
                JobStatus.RUNNING,
                JobStatus.SUCCEEDED,
                JobStatus.COMMITTING,
                JobStatus.COMMIT_RETRY,
            )
    }
}
