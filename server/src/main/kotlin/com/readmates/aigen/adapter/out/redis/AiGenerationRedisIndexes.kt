package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.JobRecord
import org.springframework.data.redis.core.StringRedisTemplate
import java.time.Duration
import java.util.UUID

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

    private fun sessionRecentKey(sessionId: UUID) = "aigen:session:$sessionId:jobs"

    private fun activeClubJobsKey(clubId: UUID) = "aigen:club:$clubId:jobs:active"

    private companion object {
        const val ACTIVE_JOBS_KEY = "aigen:jobs:active"

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
