package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AiGenerationJobTransitionPort
import com.readmates.aigen.application.port.out.GroundedResultPayload
import com.readmates.aigen.application.port.out.SaveGroundedResultCommand
import java.math.BigDecimal
import java.util.UUID

internal class RedisAiGenerationTransitionStore(
    private val context: AiGenerationRedisContext,
) : AiGenerationJobTransitionPort {
    private val redisTemplate = context.redisTemplate
    private val properties = context.properties
    private val clock = context.clock
    private val objectMapper = context.objectMapper
    private val keyspace = context.keyspace

    override fun updateStatus(
        jobId: UUID,
        status: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
    ) {
        runCatching {
            val lastUpdatedAt = clock.instant()
            redisTemplate.execute(
                AiGenerationRedisScripts.updateStatus,
                listOf(
                    keyspace.hash(jobId),
                    keyspace.activeJobs,
                    keyspace.processingRecovery,
                    keyspace.processingQuarantine,
                    keyspace.activeIndexEpoch,
                    keyspace.commitRecoveryJobs,
                ),
                status.name,
                stage?.name.orEmpty(),
                progressPct.toString(),
                error?.code?.name.orEmpty(),
                error?.message?.take(MAX_ERROR_MESSAGE_LEN).orEmpty(),
                lastUpdatedAt.toString(),
                lastUpdatedAt.epochSecond.toString(),
                lastUpdatedAt.nano.toString(),
                properties.job.redisTtl.seconds
                    .toString(),
                jobId.toString(),
                lastUpdatedAt.toEpochMilli().toString(),
                UUID.randomUUID().toString(),
            )
            refreshTransientPayloadTtls(jobId)
        }.onFailure { context.recordFailure("updateStatus") }.getOrThrow()
    }

    override fun transitionStatus(
        jobId: UUID,
        expected: Set<JobStatus>,
        next: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
        groundingStatus: GroundingStatus?,
    ): Boolean =
        runCatching {
            val lastUpdatedAt = clock.instant()
            val result =
                redisTemplate.execute(
                    AiGenerationJobMutationRedisScripts.transitionStatus,
                    listOf(
                        keyspace.hash(jobId),
                        keyspace.activeJobs,
                        keyspace.processingRecovery,
                        keyspace.processingQuarantine,
                        keyspace.activeIndexEpoch,
                        keyspace.commitRecoveryJobs,
                    ),
                    expected.joinToString(",") { it.name },
                    next.name,
                    stage?.name.orEmpty(),
                    progressPct.toString(),
                    error?.code?.name.orEmpty(),
                    error?.message?.take(MAX_ERROR_MESSAGE_LEN).orEmpty(),
                    lastUpdatedAt.toString(),
                    properties.job.redisTtl.seconds
                        .toString(),
                    groundingStatus?.name.orEmpty(),
                    lastUpdatedAt.epochSecond.toString(),
                    lastUpdatedAt.nano.toString(),
                    jobId.toString(),
                    lastUpdatedAt.toEpochMilli().toString(),
                    UUID.randomUUID().toString(),
                )
            val changed = result == 1L
            if (changed) {
                refreshTransientPayloadTtls(jobId)
            }
            changed
        }.onFailure { context.recordFailure("transitionStatus") }.getOrThrow()

    override fun saveResultIfStatus(
        jobId: UUID,
        expected: JobStatus,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
        actualModel: ModelId?,
    ): Boolean =
        runCatching {
            val ttlSeconds = properties.job.redisTtl.seconds
            val lastUpdatedAt = clock.instant()
            val resultJson = objectMapper.writeValueAsString(result)
            val saved =
                redisTemplate.execute(
                    AiGenerationJobMutationRedisScripts.saveResultIfStatus,
                    listOf(
                        keyspace.hash(jobId),
                        keyspace.result(jobId),
                        keyspace.transcript(jobId),
                        keyspace.turns(jobId),
                        keyspace.activeJobs,
                        keyspace.processingRecovery,
                        keyspace.processingQuarantine,
                        keyspace.activeIndexEpoch,
                    ),
                    expected.name,
                    resultJson,
                    usage.nonCachedInputTokens.toString(),
                    usage.cacheWriteInputTokens.toString(),
                    usage.cacheReadInputTokens.toString(),
                    usage.outputTokens.toString(),
                    cost.toPlainString(),
                    lastUpdatedAt.toString(),
                    ttlSeconds.toString(),
                    actualModel?.provider?.name.orEmpty(),
                    actualModel?.name.orEmpty(),
                    lastUpdatedAt.epochSecond.toString(),
                    lastUpdatedAt.nano.toString(),
                    jobId.toString(),
                    lastUpdatedAt.toEpochMilli().toString(),
                    UUID.randomUUID().toString(),
                )
            saved == 1L
        }.onFailure { context.recordFailure("saveResultIfStatus") }.getOrThrow()

    override fun saveGroundedResult(command: SaveGroundedResultCommand): Boolean =
        runCatching {
            val now = clock.instant()
            require(command.evidence.revision == command.expectedRevision + 1) {
                "Grounded evidence revision must be the next expected revision"
            }
            val saved =
                redisTemplate.execute(
                    GroundedAiGenerationRedisScripts.saveResult,
                    listOf(
                        keyspace.hash(command.jobId),
                        keyspace.result(command.jobId),
                        keyspace.evidence(command.jobId),
                        keyspace.transcript(command.jobId),
                        keyspace.turns(command.jobId),
                        keyspace.activeJobs,
                        keyspace.processingRecovery,
                        keyspace.processingQuarantine,
                        keyspace.activeIndexEpoch,
                        keyspace.commitRecoveryJobs,
                    ),
                    command.expectedStatus.name,
                    command.expectedRevision.toString(),
                    objectMapper.writeValueAsString(GroundedResultPayload(command.result, command.draft)),
                    objectMapper.writeValueAsString(command.evidence),
                    command.usage.nonCachedInputTokens.toString(),
                    command.usage.cacheWriteInputTokens.toString(),
                    command.usage.cacheReadInputTokens.toString(),
                    command.usage.outputTokens.toString(),
                    command.cost.toPlainString(),
                    now.toString(),
                    properties.job.redisTtl.seconds
                        .toString(),
                    command.actualModel.provider.name,
                    command.actualModel.name,
                    now.epochSecond.toString(),
                    now.nano.toString(),
                    command.jobId.toString(),
                    now.toEpochMilli().toString(),
                    UUID.randomUUID().toString(),
                ) == 1L
            saved
        }.onFailure { context.recordFailure("saveGroundedResult") }.getOrThrow()

    private fun refreshTransientPayloadTtls(jobId: UUID) {
        val ttl = properties.job.redisTtl
        redisTemplate.expire(keyspace.transcript(jobId), ttl)
        redisTemplate.expire(keyspace.turns(jobId), ttl)
        redisTemplate.expire(keyspace.result(jobId), ttl)
        redisTemplate.expire(keyspace.evidence(jobId), ttl)
    }

    private companion object {
        const val MAX_ERROR_MESSAGE_LEN = 512
    }
}
