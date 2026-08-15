package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.JobRecord
import org.springframework.data.redis.core.StringRedisTemplate
import java.util.UUID

internal class AiGenerationRedisIndexes(
    private val redisTemplate: StringRedisTemplate,
    private val keyspace: AiGenerationRedisKeyspace,
) {
    fun recentIds(
        sessionId: UUID,
        limit: Int,
    ): Set<String> =
        redisTemplate
            .opsForZSet()
            .reverseRange(keyspace.sessionRecent(sessionId), 0, (limit - 1).coerceAtLeast(0).toLong())
            .orEmpty()

    fun activeIds(limit: Int): Set<String> =
        redisTemplate
            .opsForZSet()
            .reverseRange(keyspace.activeJobs, 0, (limit - 1).coerceAtLeast(0).toLong())
            .orEmpty()

    fun commitRecoveryIds(limit: Int): Set<String> =
        redisTemplate
            .opsForZSet()
            .range(keyspace.commitRecoveryJobs, 0, (limit - 1).coerceAtLeast(0).toLong())
            .orEmpty()

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
        zSet.remove(keyspace.activeJobs, id)
        zSet.remove(keyspace.commitRecoveryJobs, id)
        zSet.remove(keyspace.processingRecovery, id)
        zSet.remove(keyspace.processingQuarantine, id)
        sessionId?.let { zSet.remove(keyspace.sessionRecent(it), id) }
        clubId?.let { zSet.remove(keyspace.activeClubJobs(it), id) }
    }

    fun removeRecent(
        sessionId: UUID,
        id: String,
    ) {
        redisTemplate.opsForZSet().remove(keyspace.sessionRecent(sessionId), id)
    }

    fun removeActiveId(id: String) {
        redisTemplate.opsForZSet().remove(keyspace.activeJobs, id)
    }

    fun removeCommitRecoveryId(id: String) {
        redisTemplate.opsForZSet().remove(keyspace.commitRecoveryJobs, id)
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
