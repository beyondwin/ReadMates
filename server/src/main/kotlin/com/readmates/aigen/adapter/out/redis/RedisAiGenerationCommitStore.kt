package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.port.out.AiGenerationCommitStatePort
import com.readmates.aigen.application.port.out.CommitLeaseResult
import java.time.Duration
import java.time.Instant
import java.util.UUID

internal class RedisAiGenerationCommitStore(
    private val context: AiGenerationRedisContext,
) : AiGenerationCommitStatePort {
    private val redisTemplate = context.redisTemplate
    private val properties = context.properties
    private val clock = context.clock
    private val keyspace = context.keyspace

    override fun acquireCommitLease(
        jobId: UUID,
        expectedRevision: Long,
        now: Instant,
        leaseDuration: Duration,
    ): CommitLeaseResult =
        runCatching {
            require(!leaseDuration.isZero && !leaseDuration.isNegative) { "Commit lease duration must be positive" }
            val leaseExpiresAt = now.plus(leaseDuration)
            val response =
                redisTemplate
                    .execute(
                        GroundedAiGenerationRedisScripts.acquireCommitLease,
                        listOf(
                            keyspace.hash(jobId),
                            keyspace.transcript(jobId),
                            keyspace.turns(jobId),
                            keyspace.result(jobId),
                            keyspace.evidence(jobId),
                            keyspace.activeJobs,
                            keyspace.processingRecovery,
                            keyspace.processingQuarantine,
                            keyspace.activeIndexEpoch,
                            keyspace.commitRecoveryJobs,
                        ),
                        expectedRevision.toString(),
                        now.toString(),
                        leaseExpiresAt.toEpochMilli().toString(),
                        properties.job.redisTtl.seconds
                            .toString(),
                        now.epochSecond.toString(),
                        now.nano.toString(),
                        jobId.toString(),
                        now.toEpochMilli().toString(),
                        UUID.randomUUID().toString(),
                    ).orEmpty()
            parseCommitLeaseResult(response)
        }.onFailure { context.recordFailure("acquireCommitLease") }.getOrThrow()

    override fun recoverExpiredCommitLease(
        jobId: UUID,
        now: Instant,
    ): Boolean =
        runCatching {
            redisTemplate.execute(
                GroundedAiGenerationRedisScripts.recoverExpiredCommitLease,
                listOf(
                    keyspace.hash(jobId),
                    keyspace.transcript(jobId),
                    keyspace.turns(jobId),
                    keyspace.result(jobId),
                    keyspace.evidence(jobId),
                    keyspace.activeJobs,
                    keyspace.processingRecovery,
                    keyspace.processingQuarantine,
                    keyspace.activeIndexEpoch,
                    keyspace.commitRecoveryJobs,
                ),
                now.toEpochMilli().toString(),
                now.toString(),
                properties.job.redisTtl.seconds
                    .toString(),
                now.epochSecond.toString(),
                now.nano.toString(),
                jobId.toString(),
                now.toEpochMilli().toString(),
                UUID.randomUUID().toString(),
            ) == 1L
        }.onFailure { context.recordFailure("recoverExpiredCommitLease") }.getOrThrow()

    override fun releaseCommitLeaseForRetry(
        jobId: UUID,
        revision: Long,
    ): Boolean =
        runCatching {
            val now = clock.instant()
            redisTemplate.execute(
                GroundedAiGenerationRedisScripts.releaseCommitLeaseForRetry,
                listOf(
                    keyspace.hash(jobId),
                    keyspace.transcript(jobId),
                    keyspace.turns(jobId),
                    keyspace.result(jobId),
                    keyspace.evidence(jobId),
                    keyspace.activeJobs,
                    keyspace.processingRecovery,
                    keyspace.processingQuarantine,
                    keyspace.activeIndexEpoch,
                    keyspace.commitRecoveryJobs,
                ),
                revision.toString(),
                now.toString(),
                properties.job.redisTtl.seconds
                    .toString(),
                now.epochSecond.toString(),
                now.nano.toString(),
                jobId.toString(),
                now.toEpochMilli().toString(),
                UUID.randomUUID().toString(),
            ) == 1L
        }.onFailure { context.recordFailure("releaseCommitLeaseForRetry") }.getOrThrow()

    override fun markCommittedForCleanup(
        jobId: UUID,
        revision: Long,
    ): Boolean =
        runCatching {
            val now = clock.instant()
            redisTemplate.execute(
                GroundedAiGenerationRedisScripts.markCommittedForCleanup,
                listOf(
                    keyspace.hash(jobId),
                    keyspace.activeJobs,
                    keyspace.processingRecovery,
                    keyspace.processingQuarantine,
                    keyspace.activeIndexEpoch,
                    keyspace.commitRecoveryJobs,
                ),
                revision.toString(),
                now.toString(),
                properties.job.redisTtl.seconds
                    .toString(),
                now.epochSecond.toString(),
                now.nano.toString(),
                jobId.toString(),
                now.toEpochMilli().toString(),
            ) == 1L
        }.onFailure { context.recordFailure("markCommittedForCleanup") }.getOrThrow()

    override fun markCleanupComplete(
        jobId: UUID,
        revision: Long,
    ): Boolean =
        runCatching {
            val now = clock.instant()
            redisTemplate.execute(
                GroundedAiGenerationRedisScripts.markCleanupComplete,
                listOf(
                    keyspace.hash(jobId),
                    keyspace.activeJobs,
                    keyspace.processingRecovery,
                    keyspace.processingQuarantine,
                    keyspace.activeIndexEpoch,
                    keyspace.commitRecoveryJobs,
                ),
                revision.toString(),
                now.toString(),
                properties.job.redisTtl.seconds
                    .toString(),
                now.epochSecond.toString(),
                now.nano.toString(),
                jobId.toString(),
                now.toEpochMilli().toString(),
            ) == 1L
        }.onFailure { context.recordFailure("markCleanupComplete") }.getOrThrow()

    override fun deleteTransientPayload(jobId: UUID) {
        runCatching {
            redisTemplate.execute(
                AiGenerationJobMutationRedisScripts.deleteTransientPayload,
                listOf(
                    keyspace.hash(jobId),
                    keyspace.transcript(jobId),
                    keyspace.result(jobId),
                    keyspace.turns(jobId),
                    keyspace.evidence(jobId),
                ),
            )
        }.onFailure { context.recordFailure("deleteTransientPayload") }.getOrThrow()
    }

    private fun parseCommitLeaseResult(response: String): CommitLeaseResult =
        when {
            response.startsWith("ACQUIRED|") ->
                CommitLeaseResult.Acquired(response.substringAfter('|').toLong())
            response.startsWith("ALREADY_COMMITTING|") ->
                CommitLeaseResult.AlreadyCommitting(Instant.ofEpochMilli(response.substringAfter('|').toLong()))
            response == "REVISION_CONFLICT" -> CommitLeaseResult.RevisionConflict
            response == "EXPIRED" -> CommitLeaseResult.Expired
            else -> CommitLeaseResult.NotReady
        }
}
