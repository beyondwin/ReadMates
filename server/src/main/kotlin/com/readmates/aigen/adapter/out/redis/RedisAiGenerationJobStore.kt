package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.CommitLeaseResult
import com.readmates.aigen.application.port.out.GroundedResultPayload
import com.readmates.aigen.application.port.out.GroundedSourceContext
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.SaveGroundedResultCommand
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import tools.jackson.core.JacksonException
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

private class MissingGroundedPayloadException : RuntimeException("Grounded job payload is unavailable")

/**
 * Redis-backed implementation of the AI generation job store.
 * Persists a metadata hash plus transcript, source turns, result, and evidence payload keys
 * with TTL from [AiGenerationProperties.Job.redisTtl] (default 6h). Atomic operations
 * (patchItem, delete) use Lua scripts so callers see consistent state.
 *
 * Conditional on `readmates.redis.enabled=true` and `readmates.aigen.enabled=true`.
 * When disabled, no bean is loaded; the orchestrator's API surface should return 503.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "aigen.enabled"], havingValue = "true")
@Suppress("LargeClass", "TooManyFunctions")
class RedisAiGenerationJobStore(
    private val redisTemplate: StringRedisTemplate,
    private val properties: AiGenerationProperties,
    private val metrics: RedisCacheMetrics,
) : AiGenerationJobStore {
    private val objectMapper: ObjectMapper = JsonMapper.builder().findAndAddModules().build()
    private val recordCodec = AiGenerationRedisRecordCodec(objectMapper, properties.job.redisTtl)
    private val indexes = AiGenerationRedisIndexes(redisTemplate, properties.job.redisTtl)

    override fun save(job: JobRecord) {
        runCatching {
            val ttlSeconds = properties.job.redisTtl.seconds
            val hashKey = hashKey(job.jobId)
            val transcriptKey = transcriptKey(job.jobId)
            val turnsKey = turnsKey(job.jobId)
            val resultKey = resultKey(job.jobId)
            val evidenceKey = evidenceKey(job.jobId)

            val hash = recordCodec.toHash(job)
            redisTemplate.opsForHash<String, String>().putAll(hashKey, hash)
            redisTemplate.expire(hashKey, java.time.Duration.ofSeconds(ttlSeconds))

            redisTemplate.opsForValue().set(transcriptKey, job.transcript, java.time.Duration.ofSeconds(ttlSeconds))
            require(job.validatedTurns.isNotEmpty()) { "Grounded job requires validated transcript turns" }
            redisTemplate
                .opsForValue()
                .set(
                    turnsKey,
                    objectMapper.writeValueAsString(
                        GroundedSourceContext(job.validatedTurns, job.sessionMeta, job.instructions),
                    ),
                    java.time.Duration.ofSeconds(ttlSeconds),
                )

            if (job.result != null) {
                val payload = GroundedResultPayload(job.result, requireNotNull(job.groundedDraft))
                redisTemplate
                    .opsForValue()
                    .set(
                        resultKey,
                        objectMapper.writeValueAsString(payload),
                        java.time.Duration.ofSeconds(ttlSeconds),
                    )
            }
            if (job.evidence != null) {
                redisTemplate
                    .opsForValue()
                    .set(
                        evidenceKey,
                        objectMapper.writeValueAsString(job.evidence),
                        java.time.Duration.ofSeconds(ttlSeconds),
                    )
            }
            indexes.index(job)
        }.onFailure { recordFailure("save") }.getOrThrow()
    }

    override fun load(jobId: UUID): JobRecord? =
        runCatching {
            val hashKey = hashKey(jobId)
            val hash = redisTemplate.opsForHash<String, String>().entries(hashKey)
            if (hash.isEmpty()) return@runCatching null

            val status = hash["status"]?.let { JobStatus.valueOf(it) }
            loadGrounded(jobId, hash, requireNotNull(status))
        }.onFailure { recordFailure("load") }.getOrThrow()

    override fun loadMetadata(jobId: UUID): JobRecord? =
        runCatching {
            val hash = redisTemplate.opsForHash<String, String>().entries(hashKey(jobId))
            if (hash.isEmpty()) return@runCatching null
            val status = hash["status"]?.let(JobStatus::valueOf)
            if (!requiredGroundedPayloadsExist(jobId, requireNotNull(status))) {
                return@runCatching deleteStaleJob(jobId)
            }
            recordCodec.fromHash(
                jobId = jobId,
                hash = hash,
                transcript = "",
                result = null,
                groundedDraft = null,
                sourceContext = null,
                evidence = null,
            )
        }.onFailure { recordFailure("loadMetadata") }.getOrThrow()

    private fun requiredGroundedPayloadsExist(
        jobId: UUID,
        status: JobStatus,
    ): Boolean {
        val requiredKeys =
            when (status) {
                JobStatus.PENDING,
                JobStatus.RUNNING,
                -> listOf(transcriptKey(jobId), turnsKey(jobId))
                JobStatus.SUCCEEDED ->
                    listOf(transcriptKey(jobId), turnsKey(jobId), resultKey(jobId), evidenceKey(jobId))
                JobStatus.COMMITTING,
                JobStatus.COMMIT_RETRY,
                -> listOf(transcriptKey(jobId), turnsKey(jobId), resultKey(jobId), evidenceKey(jobId))
                JobStatus.COMMITTED,
                JobStatus.CANCELLED,
                JobStatus.FAILED,
                -> emptyList()
            }
        return requiredKeys.all(redisTemplate::hasKey)
    }

    private fun loadGrounded(
        jobId: UUID,
        hash: Map<String, String>,
        status: JobStatus,
    ): JobRecord? =
        try {
            loadGroundedPayloads(jobId, hash, status)
        } catch (_: MissingGroundedPayloadException) {
            deleteStaleJob(jobId)
        } catch (_: JacksonException) {
            deleteStaleJob(jobId)
        }

    private fun loadGroundedPayloads(
        jobId: UUID,
        hash: Map<String, String>,
        status: JobStatus,
    ): JobRecord? {
        val transcript =
            if (status in GROUNDED_TRANSCRIPT_STATUSES) {
                requirePayload(transcriptKey(jobId))
            } else {
                ""
            }
        val sourceContext =
            if (status in GROUNDED_SOURCE_CONTEXT_STATUSES) {
                val sourceJson = requirePayload(turnsKey(jobId))
                objectMapper.readValue(sourceJson, GroundedSourceContext::class.java)
            } else {
                null
            }
        val resultPayload =
            if (status in GROUNDED_REVIEW_PAYLOAD_STATUSES) {
                val resultJson = requirePayload(resultKey(jobId))
                objectMapper.readValue(resultJson, GroundedResultPayload::class.java)
            } else {
                null
            }
        val evidence =
            if (status in GROUNDED_REVIEW_PAYLOAD_STATUSES) {
                val evidenceJson = requirePayload(evidenceKey(jobId))
                objectMapper.readValue(evidenceJson, GroundedEvidenceBundle::class.java)
            } else {
                null
            }
        return recordCodec.fromHash(
            jobId,
            hash,
            transcript,
            resultPayload?.result,
            resultPayload?.draft,
            sourceContext,
            evidence,
        )
    }

    private fun requirePayload(key: String): String =
        redisTemplate
            .opsForValue()
            .get(key)
            ?: throw MissingGroundedPayloadException()

    override fun loadRecentForSession(
        sessionId: UUID,
        limit: Int,
    ): List<JobRecord> =
        runCatching {
            if (limit <= 0) return@runCatching emptyList()
            val ids = indexes.recentIds(sessionId, limit)
            ids.mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = loadMetadata(jobId)
                when {
                    record == null -> {
                        indexes.removeRecent(sessionId, id)
                        null
                    }
                    record.sessionId != sessionId -> {
                        indexes.removeRecent(sessionId, id)
                        null
                    }
                    else -> record
                }
            }
        }.onFailure { recordFailure("loadRecentForSession") }.getOrDefault(emptyList())

    override fun loadActiveJobs(limit: Int): List<JobRecord> =
        runCatching {
            if (limit <= 0) return@runCatching emptyList()
            val ids = indexes.activeIds(limit)
            ids.mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = loadMetadata(jobId)
                when {
                    record == null -> {
                        indexes.removeActiveId(id)
                        null
                    }
                    !indexes.isActive(record) -> {
                        indexes.removeActive(record)
                        null
                    }
                    else -> record
                }
            }
        }.onFailure { recordFailure("loadActiveJobs") }.getOrDefault(emptyList())

    @Suppress("ComplexCondition")
    override fun loadCommitRecoveryJobs(limit: Int): List<JobRecord> =
        runCatching {
            if (limit <= 0) return@runCatching emptyList()
            indexes.commitRecoveryIds(limit).mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = loadMetadata(jobId)
                if (record == null ||
                    (
                        record.status != JobStatus.COMMITTING && record.status != JobStatus.COMMIT_RETRY &&
                            !(record.status == JobStatus.COMMITTED && record.cleanupPending)
                    )
                ) {
                    indexes.removeCommitRecoveryId(id)
                    null
                } else {
                    record
                }
            }
        }.onFailure { recordFailure("loadCommitRecoveryJobs") }.getOrDefault(emptyList())

    override fun updateStatus(
        jobId: UUID,
        status: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
    ) {
        runCatching {
            val hashKey = hashKey(jobId)
            val ops = redisTemplate.opsForHash<String, String>()
            val lastUpdatedAt = Instant.now()
            ops.put(hashKey, "status", status.name)
            if (stage != null) ops.put(hashKey, "stage", stage.name) else ops.delete(hashKey, "stage")
            ops.put(hashKey, "progressPct", progressPct.toString())
            ops.put(hashKey, "lastUpdatedAt", lastUpdatedAt.toString())
            if (error != null) {
                ops.put(hashKey, "errorCode", error.code.name)
                ops.put(hashKey, "errorMessage", error.message.take(MAX_ERROR_MESSAGE_LEN))
            } else {
                ops.delete(hashKey, "errorCode", "errorMessage")
            }
            redisTemplate.expire(hashKey, properties.job.redisTtl)
            refreshTransientPayloadTtls(jobId)
            refreshIndexes(jobId)
        }.onFailure { recordFailure("updateStatus") }.getOrThrow()
    }

    override fun transitionStatus(
        jobId: UUID,
        expected: Set<JobStatus>,
        next: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
        groundingStatus: com.readmates.aigen.application.model.GroundingStatus?,
    ): Boolean =
        runCatching {
            val lastUpdatedAt = Instant.now()
            val result =
                redisTemplate.execute(
                    AiGenerationRedisScripts.transitionStatus,
                    listOf(hashKey(jobId)),
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
                )
            val changed = result == 1L
            if (changed) {
                refreshTransientPayloadTtls(jobId)
                refreshIndexes(jobId)
            }
            changed
        }.onFailure { recordFailure("transitionStatus") }.getOrThrow()

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
            val lastUpdatedAt = Instant.now()
            val resultJson = objectMapper.writeValueAsString(result)
            val saved =
                redisTemplate.execute(
                    AiGenerationRedisScripts.saveResultIfStatus,
                    listOf(hashKey(jobId), resultKey(jobId), transcriptKey(jobId), turnsKey(jobId)),
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
                )
            val changed = saved == 1L
            if (changed) {
                refreshIndexes(jobId)
            }
            changed
        }.onFailure { recordFailure("saveResultIfStatus") }.getOrThrow()

    override fun saveGroundedResult(command: SaveGroundedResultCommand): Boolean =
        runCatching {
            require(command.evidence.revision == command.expectedRevision + 1) {
                "Grounded evidence revision must be the next expected revision"
            }
            val saved =
                redisTemplate.execute(
                    GroundedAiGenerationRedisScripts.saveResult,
                    listOf(
                        hashKey(command.jobId),
                        resultKey(command.jobId),
                        evidenceKey(command.jobId),
                        transcriptKey(command.jobId),
                        turnsKey(command.jobId),
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
                    Instant.now().toString(),
                    properties.job.redisTtl.seconds
                        .toString(),
                    command.actualModel.provider.name,
                    command.actualModel.name,
                ) == 1L
            if (saved) refreshIndexes(command.jobId)
            saved
        }.onFailure { recordFailure("saveGroundedResult") }.getOrThrow()

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
                            hashKey(jobId),
                            transcriptKey(jobId),
                            turnsKey(jobId),
                            resultKey(jobId),
                            evidenceKey(jobId),
                        ),
                        expectedRevision.toString(),
                        now.toString(),
                        leaseExpiresAt.toEpochMilli().toString(),
                        properties.job.redisTtl.seconds
                            .toString(),
                    ).orEmpty()
            val result = parseCommitLeaseResult(response)
            if (result is CommitLeaseResult.Acquired) refreshIndexes(jobId)
            result
        }.onFailure { recordFailure("acquireCommitLease") }.getOrThrow()

    override fun recoverExpiredCommitLease(
        jobId: UUID,
        now: Instant,
    ): Boolean =
        runCatching {
            val recovered =
                redisTemplate.execute(
                    GroundedAiGenerationRedisScripts.recoverExpiredCommitLease,
                    listOf(
                        hashKey(jobId),
                        transcriptKey(jobId),
                        turnsKey(jobId),
                        resultKey(jobId),
                        evidenceKey(jobId),
                    ),
                    now.toEpochMilli().toString(),
                    now.toString(),
                    properties.job.redisTtl.seconds
                        .toString(),
                ) == 1L
            if (recovered) refreshIndexes(jobId)
            recovered
        }.onFailure { recordFailure("recoverExpiredCommitLease") }.getOrThrow()

    override fun releaseCommitLeaseForRetry(
        jobId: UUID,
        revision: Long,
    ): Boolean =
        runCatching {
            val changed =
                redisTemplate.execute(
                    GroundedAiGenerationRedisScripts.releaseCommitLeaseForRetry,
                    listOf(
                        hashKey(jobId),
                        transcriptKey(jobId),
                        turnsKey(jobId),
                        resultKey(jobId),
                        evidenceKey(jobId),
                    ),
                    revision.toString(),
                    Instant.now().toString(),
                    properties.job.redisTtl.seconds
                        .toString(),
                ) == 1L
            if (changed) refreshIndexes(jobId)
            changed
        }.onFailure { recordFailure("releaseCommitLeaseForRetry") }.getOrThrow()

    override fun markCommittedForCleanup(
        jobId: UUID,
        revision: Long,
    ): Boolean =
        runCatching {
            val changed =
                redisTemplate.execute(
                    GroundedAiGenerationRedisScripts.markCommittedForCleanup,
                    listOf(hashKey(jobId)),
                    revision.toString(),
                    Instant.now().toString(),
                    properties.job.redisTtl.seconds
                        .toString(),
                ) == 1L
            if (changed) refreshIndexes(jobId)
            changed
        }.onFailure { recordFailure("markCommittedForCleanup") }.getOrThrow()

    override fun markCleanupComplete(
        jobId: UUID,
        revision: Long,
    ): Boolean =
        runCatching {
            val changed =
                redisTemplate.execute(
                    GroundedAiGenerationRedisScripts.markCleanupComplete,
                    listOf(hashKey(jobId)),
                    revision.toString(),
                    Instant.now().toString(),
                    properties.job.redisTtl.seconds
                        .toString(),
                ) == 1L
            if (changed) refreshIndexes(jobId)
            changed
        }.onFailure { recordFailure("markCleanupComplete") }.getOrThrow()

    override fun deleteTransientPayload(jobId: UUID) {
        runCatching {
            redisTemplate.execute(
                AiGenerationRedisScripts.deleteTransientPayload,
                listOf(
                    hashKey(jobId),
                    transcriptKey(jobId),
                    resultKey(jobId),
                    turnsKey(jobId),
                    evidenceKey(jobId),
                ),
            )
        }.onFailure { recordFailure("deleteTransientPayload") }.getOrThrow()
    }

    private fun deleteStaleJob(jobId: UUID): JobRecord? {
        delete(jobId)
        return null
    }

    private fun refreshTransientPayloadTtls(jobId: UUID) {
        val ttl = properties.job.redisTtl
        redisTemplate.expire(transcriptKey(jobId), ttl)
        redisTemplate.expire(turnsKey(jobId), ttl)
        redisTemplate.expire(resultKey(jobId), ttl)
        redisTemplate.expire(evidenceKey(jobId), ttl)
    }

    override fun delete(jobId: UUID) {
        runCatching {
            val hash = redisTemplate.opsForHash<String, String>().entries(hashKey(jobId))
            redisTemplate.execute(
                AiGenerationRedisScripts.deleteJob,
                listOf(
                    hashKey(jobId),
                    transcriptKey(jobId),
                    resultKey(jobId),
                    turnsKey(jobId),
                    evidenceKey(jobId),
                    providerAttemptsKey(jobId),
                ),
            )
            indexes.remove(
                jobId = jobId,
                sessionId = hash["sessionId"]?.let(UUID::fromString),
                clubId = hash["clubId"]?.let(UUID::fromString),
            )
        }.onFailure { recordFailure("delete") }.getOrThrow()
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

    private fun refreshIndexes(jobId: UUID) {
        val record = loadMetadata(jobId) ?: return
        indexes.index(record)
    }

    private fun String.toUuidOrNull(): UUID? =
        runCatching {
            UUID.fromString(this)
        }.getOrNull()

    private fun recordFailure(operation: String) {
        metrics.increment("readmates.redis.fallbacks", "feature", "aigen.job-store")
        metrics.increment(
            "readmates.redis.operation.errors",
            "feature",
            "aigen.job-store",
            "operation",
            operation,
        )
    }

    private fun hashKey(jobId: UUID) = "aigen:job:$jobId"

    private fun transcriptKey(jobId: UUID) = "aigen:job:$jobId:transcript"

    private fun turnsKey(jobId: UUID) = "aigen:job:$jobId:turns"

    private fun resultKey(jobId: UUID) = "aigen:job:$jobId:result"

    private fun evidenceKey(jobId: UUID) = "aigen:job:$jobId:evidence"

    private companion object {
        const val MAX_ERROR_MESSAGE_LEN = 512

        val GROUNDED_TRANSCRIPT_STATUSES = setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED)

        val GROUNDED_SOURCE_CONTEXT_STATUSES =
            setOf(
                JobStatus.PENDING,
                JobStatus.RUNNING,
                JobStatus.SUCCEEDED,
                JobStatus.COMMITTING,
                JobStatus.COMMIT_RETRY,
            )

        val GROUNDED_REVIEW_PAYLOAD_STATUSES =
            setOf(JobStatus.SUCCEEDED, JobStatus.COMMITTING, JobStatus.COMMIT_RETRY)
    }
}
