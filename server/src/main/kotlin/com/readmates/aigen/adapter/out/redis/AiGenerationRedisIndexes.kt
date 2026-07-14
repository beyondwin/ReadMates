package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.JobRecord
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration
import java.util.UUID

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

    fun index(job: JobRecord) {
        val id = job.jobId.toString()
        val score = job.lastUpdatedAt.toEpochMilli().toDouble()
        val zSet = redisTemplate.opsForZSet()

        val sessionKey = sessionRecentKey(job.sessionId)
        zSet.add(sessionKey, id, score)
        redisTemplate.expire(sessionKey, ttl)

        if (isActive(job)) {
            val clubKey = activeClubJobsKey(job.clubId)
            zSet.add(ACTIVE_JOBS_KEY, id, score)
            zSet.add(clubKey, id, score)
            redisTemplate.expire(ACTIVE_JOBS_KEY, ttl)
            redisTemplate.expire(clubKey, ttl)
        } else {
            removeActive(job)
        }
        if (job.status == JobStatus.COMMITTING || job.status == JobStatus.COMMIT_RETRY ||
            (job.status == JobStatus.COMMITTED && job.cleanupPending)
        ) {
            zSet.add(COMMIT_RECOVERY_JOBS_KEY, id, commitRecoveryScore(job))
            redisTemplate.expire(COMMIT_RECOVERY_JOBS_KEY, ttl)
        } else {
            zSet.remove(COMMIT_RECOVERY_JOBS_KEY, id)
        }
    }

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

    private fun sessionRecentKey(sessionId: UUID) = "aigen:session:$sessionId:jobs"

    private fun activeClubJobsKey(clubId: UUID) = "aigen:club:$clubId:jobs:active"

    private fun commitRecoveryScore(job: JobRecord): Double {
        val priority =
            when (job.status) {
                JobStatus.COMMITTED -> 0.0
                JobStatus.COMMITTING -> COMMITTING_PRIORITY
                else -> COMMIT_RETRY_PRIORITY
            }
        return priority + job.lastUpdatedAt.toEpochMilli().toDouble()
    }

    private companion object {
        const val ACTIVE_JOBS_KEY = "aigen:jobs:active"
        const val COMMIT_RECOVERY_JOBS_KEY = "aigen:jobs:commit-recovery"
        const val COMMITTING_PRIORITY = 1_000_000_000_000_000.0
        const val COMMIT_RETRY_PRIORITY = 2_000_000_000_000_000.0

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
