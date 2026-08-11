package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.AiGenerationJobListOperation
import com.readmates.aigen.application.model.AiGenerationJobListResult
import com.readmates.aigen.application.model.AiGenerationJobListUnavailableReason
import com.readmates.aigen.application.model.CostBasis
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderAttempt
import com.readmates.aigen.application.model.ProviderAttemptState
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.ActiveAiGenerationJobProbe
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryCommand
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryResult
import com.readmates.aigen.application.port.out.AiGenerationFailureRecoveryPort
import com.readmates.aigen.application.port.out.AiGenerationIndexRepairResult
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AiGenerationProcessingCandidate
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadata
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadataResult
import com.readmates.aigen.application.port.out.AiGenerationRecoveryReclassification
import com.readmates.aigen.application.port.out.CommitLeaseResult
import com.readmates.aigen.application.port.out.GroundedResultPayload
import com.readmates.aigen.application.port.out.GroundedSourceContext
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.SaveGroundedResultCommand
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.DefaultRedisScript
import org.springframework.stereotype.Component
import tools.jackson.core.JacksonException
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import java.math.BigDecimal
import java.time.Clock
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
    private val clock: Clock,
) : AiGenerationJobStore,
    AiGenerationFailureRecoveryPort,
    ActiveAiGenerationJobProbe {
    private val objectMapper: ObjectMapper = JsonMapper.builder().findAndAddModules().build()
    private val recordCodec = AiGenerationRedisRecordCodec(objectMapper)
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
            saveMetadataAndIndexes(job, hashKey, hash, ttlSeconds)

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
        }.onFailure { recordFailure("save") }.getOrThrow()
    }

    private fun saveMetadataAndIndexes(
        job: JobRecord,
        hashKey: String,
        hash: Map<String, String>,
        ttlSeconds: Long,
    ) {
        val metadataArguments =
            buildList {
                add(hash.size.toString())
                hash.forEach { (field, value) ->
                    add(field)
                    add(value)
                }
                add(ttlSeconds.toString())
                add(job.jobId.toString())
                add(job.lastUpdatedAt.toEpochMilli().toString())
                add(UUID.randomUUID().toString())
                add(job.status.name)
            }
        redisTemplate.execute(
            AiGenerationRedisScripts.saveMetadata,
            listOf(
                hashKey,
                ACTIVE_JOBS_KEY,
                activeClubJobsKey(job.clubId),
                PROCESSING_RECOVERY_KEY,
                ACTIVE_INDEX_EPOCH_KEY,
                PROCESSING_QUARANTINE_KEY,
                sessionRecentKey(job.sessionId),
            ),
            *metadataArguments.toTypedArray(),
        )
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

    private fun loadIndexedMetadata(jobId: UUID): JobRecord? {
        val hash = redisTemplate.opsForHash<String, String>().entries(hashKey(jobId))
        if (hash.isEmpty()) return null
        return recordCodec.fromHash(
            jobId = jobId,
            hash = hash,
            transcript = "",
            result = null,
            groundedDraft = null,
            sourceContext = null,
            evidence = null,
        )
    }

    override fun loadRecoveryMetadata(jobId: UUID): AiGenerationRecoveryMetadataResult =
        runCatching {
            val hash = redisTemplate.opsForHash<String, String>().entries(hashKey(jobId))
            if (hash.isEmpty()) return@runCatching AiGenerationRecoveryMetadataResult.Missing
            decodeRecoveryMetadata(jobId, hash)
        }.onFailure { recordFailure("loadRecoveryMetadata") }.getOrThrow()

    private fun decodeRecoveryMetadata(
        jobId: UUID,
        hash: Map<String, String>,
    ): AiGenerationRecoveryMetadataResult =
        try {
            val lastUpdatedAt = Instant.parse(hash.getValue("lastUpdatedAt"))
            val secondRaw = hash["lastUpdatedAtEpochSecond"]
            val nanoRaw = hash["lastUpdatedAtNano"]
            if ((secondRaw == null) != (nanoRaw == null)) return AiGenerationRecoveryMetadataResult.Corrupt
            if (secondRaw != null &&
                (secondRaw.toLongOrNull() != lastUpdatedAt.epochSecond || nanoRaw?.toIntOrNull() != lastUpdatedAt.nano)
            ) {
                return AiGenerationRecoveryMetadataResult.Corrupt
            }
            AiGenerationRecoveryMetadataResult.Valid(
                AiGenerationRecoveryMetadata(
                    jobId = jobId,
                    hostUserId = UUID.fromString(hash.getValue("hostUserId")),
                    clubId = UUID.fromString(hash.getValue("clubId")),
                    sessionId = UUID.fromString(hash.getValue("sessionId")),
                    status = JobStatus.valueOf(hash.getValue("status")),
                    lastUpdatedAt = lastUpdatedAt,
                ),
            )
        } catch (_: RuntimeException) {
            AiGenerationRecoveryMetadataResult.Corrupt
        }

    override fun recover(command: AiGenerationAtomicRecoveryCommand): AiGenerationAtomicRecoveryResult =
        runCatching {
            val response =
                redisTemplate
                    .execute(
                        AiGenerationRecoveryRedisScripts.recoverFailure,
                        listOf(
                            hashKey(command.jobId),
                            providerAttemptsKey(command.jobId),
                            admissionReceiptKey(command.jobId),
                            dailyKey(command.hostUserId),
                            dailyTokenKey(command.hostUserId),
                            minuteKey(command.hostUserId),
                            minuteTokenKey(command.hostUserId),
                            admissionKey(command.clubId),
                            ACTIVE_JOBS_KEY,
                            activeClubJobsKey(command.clubId),
                            PROCESSING_RECOVERY_KEY,
                            PROCESSING_QUARANTINE_KEY,
                            sessionRecentKey(command.sessionId),
                            COMMIT_RECOVERY_JOBS_KEY,
                        ),
                        command.expectedStatus.name,
                        command.observedLastUpdatedAt.toString(),
                        command.observedLastUpdatedAt.epochSecond.toString(),
                        command.observedLastUpdatedAt.nano.toString(),
                        command.scheduledCutoff
                            ?.epochSecond
                            ?.toString()
                            .orEmpty(),
                        command.scheduledCutoff
                            ?.nano
                            ?.toString()
                            .orEmpty(),
                        command.providerStaleBefore.toEpochMilli().toString(),
                        command.error.code.name,
                        command.now.toString(),
                        command.error.message.take(MAX_ERROR_MESSAGE_LEN),
                        command.admissionDisposition.name,
                        properties.job.redisTtl.seconds
                            .toString(),
                        command.now.toEpochMilli().toString(),
                        command.jobId.toString(),
                        command.now.epochSecond.toString(),
                        command.now.nano.toString(),
                        command.providerStaleBefore.epochSecond.toString(),
                        command.providerStaleBefore.nano.toString(),
                        command.hostUserId.toString(),
                        command.clubId.toString(),
                        command.sessionId.toString(),
                    ).orEmpty()
            parseRecoveryResponse(command.jobId, response)
        }.onFailure { recordFailure("recoverFailure") }.getOrThrow()

    private fun parseRecoveryResponse(
        jobId: UUID,
        response: String,
    ): AiGenerationAtomicRecoveryResult {
        val attemptIds =
            response
                .substringAfter('|', "")
                .split(',')
                .filter(String::isNotBlank)
                .map(UUID::fromString)
        val attempts = attemptIds.map { readProviderAttempt(jobId, it) }
        return when (response.substringBefore('|')) {
            "RECOVERED" ->
                if (attempts.isEmpty()) {
                    AiGenerationAtomicRecoveryResult.Recovered
                } else {
                    AiGenerationAtomicRecoveryResult.RecoveredWithAttempts(attempts)
                }
            "RECOVERED_UNACCOUNTED" -> AiGenerationAtomicRecoveryResult.RecoveredUnaccounted
            "STATE_CHANGED" -> AiGenerationAtomicRecoveryResult.StateChanged
            "NOT_STALE" -> AiGenerationAtomicRecoveryResult.NotStale
            "DEFERRED_IN_FLIGHT" ->
                if (attempts.isEmpty()) {
                    AiGenerationAtomicRecoveryResult.DeferredInFlight
                } else {
                    AiGenerationAtomicRecoveryResult.DeferredInFlightWithAttempts(attempts)
                }
            "CORRUPT" -> AiGenerationAtomicRecoveryResult.Corrupt
            "MISSING" -> AiGenerationAtomicRecoveryResult.Missing
            else -> error("Unexpected Redis recovery result")
        }
    }

    override fun reclassify(
        jobId: UUID,
        now: Instant,
    ): AiGenerationRecoveryReclassification =
        runCatching {
            repeat(MAX_RECLASSIFY_RETRIES) {
                val hash = redisTemplate.opsForHash<String, String>().entries(hashKey(jobId))
                val valid =
                    hash.isNotEmpty() &&
                        decodeRecoveryMetadata(jobId, hash) is AiGenerationRecoveryMetadataResult.Valid
                val response =
                    redisTemplate.execute(
                        AiGenerationRecoveryRedisScripts.reclassifyRecovery,
                        listOf(
                            hashKey(jobId),
                            ACTIVE_JOBS_KEY,
                            PROCESSING_RECOVERY_KEY,
                            PROCESSING_QUARANTINE_KEY,
                            ACTIVE_INDEX_EPOCH_KEY,
                        ),
                        jobId.toString(),
                        now.toEpochMilli().toString(),
                        properties.job.redisTtl.seconds
                            .toString(),
                        UUID.randomUUID().toString(),
                        if (valid) "1" else "0",
                        hash["status"].orEmpty(),
                        hash["lastUpdatedAt"].orEmpty(),
                        hash["lastUpdatedAtEpochSecond"].orEmpty(),
                        hash["lastUpdatedAtNano"].orEmpty(),
                        hash["clubId"].orEmpty(),
                        hash["sessionId"].orEmpty(),
                        hash["hostUserId"].orEmpty(),
                        now.toString(),
                    )
                when (response) {
                    "ACTIVE" -> return@runCatching AiGenerationRecoveryReclassification.ACTIVE
                    "TERMINAL" -> return@runCatching AiGenerationRecoveryReclassification.TERMINAL
                    "MISSING" -> return@runCatching AiGenerationRecoveryReclassification.MISSING
                    "CORRUPT" -> return@runCatching AiGenerationRecoveryReclassification.CORRUPT
                    "RETRY" -> Unit
                    else -> error("Unexpected Redis reclassification result")
                }
            }
            error("Redis reclassification changed repeatedly")
        }.onFailure { recordFailure("reclassifyRecovery") }.getOrThrow()

    override fun quarantineCorrupt(
        jobId: UUID,
        now: Instant,
    ) {
        runCatching {
            redisTemplate.execute(
                AiGenerationRecoveryRedisScripts.quarantineRecovery,
                listOf(hashKey(jobId), PROCESSING_RECOVERY_KEY, PROCESSING_QUARANTINE_KEY),
                jobId.toString(),
                now.toEpochMilli().toString(),
                properties.job.redisTtl.seconds
                    .toString(),
                now.toString(),
            )
        }.onFailure { recordFailure("quarantineRecovery") }.getOrThrow()
    }

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
    ): AiGenerationJobListResult =
        readJobList(AiGenerationJobListOperation.RECENT_FOR_SESSION, "loadRecentForSession") {
            if (limit <= 0) return@readJobList emptyList()
            val ids = indexes.recentIds(sessionId, limit)
            ids.mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = loadIndexedMetadata(jobId)
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
        }

    override fun loadActiveJobs(limit: Int): AiGenerationJobListResult =
        readJobList(AiGenerationJobListOperation.ACTIVE, "loadActiveJobs") {
            if (limit <= 0) return@readJobList emptyList()
            val ids = indexes.activeIds(limit)
            ids.mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = loadIndexedMetadata(jobId)
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
        }

    @Suppress("ComplexCondition")
    override fun loadCommitRecoveryJobs(limit: Int): AiGenerationJobListResult =
        readJobList(AiGenerationJobListOperation.COMMIT_RECOVERY, "loadCommitRecoveryJobs") {
            if (limit <= 0) return@readJobList emptyList()
            indexes.commitRecoveryIds(limit).mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = loadIndexedMetadata(jobId)
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
        }

    private inline fun readJobList(
        operation: AiGenerationJobListOperation,
        metricOperation: String,
        read: () -> List<JobRecord>,
    ): AiGenerationJobListResult =
        runCatching { AiGenerationJobListResult.Available(read()) }
            .onFailure { recordFailure(metricOperation) }
            .getOrElse {
                AiGenerationJobListResult.Unavailable(
                    operation,
                    AiGenerationJobListUnavailableReason.STORE_READ_FAILED,
                )
            }

    override fun updateStatus(
        jobId: UUID,
        status: JobStatus,
        stage: JobStage?,
        progressPct: Int,
        error: GenerationError?,
    ) {
        runCatching {
            val hashKey = hashKey(jobId)
            val lastUpdatedAt = clock.instant()
            redisTemplate.execute(
                AiGenerationRedisScripts.updateStatus,
                listOf(
                    hashKey,
                    ACTIVE_JOBS_KEY,
                    PROCESSING_RECOVERY_KEY,
                    PROCESSING_QUARANTINE_KEY,
                    ACTIVE_INDEX_EPOCH_KEY,
                    COMMIT_RECOVERY_JOBS_KEY,
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
            val lastUpdatedAt = clock.instant()
            val result =
                redisTemplate.execute(
                    AiGenerationJobMutationRedisScripts.transitionStatus,
                    listOf(
                        hashKey(jobId),
                        ACTIVE_JOBS_KEY,
                        PROCESSING_RECOVERY_KEY,
                        PROCESSING_QUARANTINE_KEY,
                        ACTIVE_INDEX_EPOCH_KEY,
                        COMMIT_RECOVERY_JOBS_KEY,
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
            val lastUpdatedAt = clock.instant()
            val resultJson = objectMapper.writeValueAsString(result)
            val saved =
                redisTemplate.execute(
                    AiGenerationJobMutationRedisScripts.saveResultIfStatus,
                    listOf(
                        hashKey(jobId),
                        resultKey(jobId),
                        transcriptKey(jobId),
                        turnsKey(jobId),
                        ACTIVE_JOBS_KEY,
                        PROCESSING_RECOVERY_KEY,
                        PROCESSING_QUARANTINE_KEY,
                        ACTIVE_INDEX_EPOCH_KEY,
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
        }.onFailure { recordFailure("saveResultIfStatus") }.getOrThrow()

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
                        hashKey(command.jobId),
                        resultKey(command.jobId),
                        evidenceKey(command.jobId),
                        transcriptKey(command.jobId),
                        turnsKey(command.jobId),
                        ACTIVE_JOBS_KEY,
                        PROCESSING_RECOVERY_KEY,
                        PROCESSING_QUARANTINE_KEY,
                        ACTIVE_INDEX_EPOCH_KEY,
                        COMMIT_RECOVERY_JOBS_KEY,
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
                            ACTIVE_JOBS_KEY,
                            PROCESSING_RECOVERY_KEY,
                            PROCESSING_QUARANTINE_KEY,
                            ACTIVE_INDEX_EPOCH_KEY,
                            COMMIT_RECOVERY_JOBS_KEY,
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
            val result = parseCommitLeaseResult(response)
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
                        ACTIVE_JOBS_KEY,
                        PROCESSING_RECOVERY_KEY,
                        PROCESSING_QUARANTINE_KEY,
                        ACTIVE_INDEX_EPOCH_KEY,
                        COMMIT_RECOVERY_JOBS_KEY,
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
            recovered
        }.onFailure { recordFailure("recoverExpiredCommitLease") }.getOrThrow()

    override fun releaseCommitLeaseForRetry(
        jobId: UUID,
        revision: Long,
    ): Boolean =
        runCatching {
            val now = clock.instant()
            val changed =
                redisTemplate.execute(
                    GroundedAiGenerationRedisScripts.releaseCommitLeaseForRetry,
                    listOf(
                        hashKey(jobId),
                        transcriptKey(jobId),
                        turnsKey(jobId),
                        resultKey(jobId),
                        evidenceKey(jobId),
                        ACTIVE_JOBS_KEY,
                        PROCESSING_RECOVERY_KEY,
                        PROCESSING_QUARANTINE_KEY,
                        ACTIVE_INDEX_EPOCH_KEY,
                        COMMIT_RECOVERY_JOBS_KEY,
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
            changed
        }.onFailure { recordFailure("releaseCommitLeaseForRetry") }.getOrThrow()

    override fun markCommittedForCleanup(
        jobId: UUID,
        revision: Long,
    ): Boolean =
        runCatching {
            val now = clock.instant()
            val changed =
                redisTemplate.execute(
                    GroundedAiGenerationRedisScripts.markCommittedForCleanup,
                    listOf(
                        hashKey(jobId),
                        ACTIVE_JOBS_KEY,
                        PROCESSING_RECOVERY_KEY,
                        PROCESSING_QUARANTINE_KEY,
                        ACTIVE_INDEX_EPOCH_KEY,
                        COMMIT_RECOVERY_JOBS_KEY,
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
            changed
        }.onFailure { recordFailure("markCommittedForCleanup") }.getOrThrow()

    override fun markCleanupComplete(
        jobId: UUID,
        revision: Long,
    ): Boolean =
        runCatching {
            val now = clock.instant()
            val changed =
                redisTemplate.execute(
                    GroundedAiGenerationRedisScripts.markCleanupComplete,
                    listOf(
                        hashKey(jobId),
                        ACTIVE_JOBS_KEY,
                        PROCESSING_RECOVERY_KEY,
                        PROCESSING_QUARANTINE_KEY,
                        ACTIVE_INDEX_EPOCH_KEY,
                        COMMIT_RECOVERY_JOBS_KEY,
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
            changed
        }.onFailure { recordFailure("markCleanupComplete") }.getOrThrow()

    override fun deleteTransientPayload(jobId: UUID) {
        runCatching {
            redisTemplate.execute(
                AiGenerationJobMutationRedisScripts.deleteTransientPayload,
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
            redisTemplate.execute(
                AiGenerationJobMutationRedisScripts.deleteJob,
                listOf(
                    hashKey(jobId),
                    transcriptKey(jobId),
                    resultKey(jobId),
                    turnsKey(jobId),
                    evidenceKey(jobId),
                    providerAttemptsKey(jobId),
                    ACTIVE_JOBS_KEY,
                    COMMIT_RECOVERY_JOBS_KEY,
                    PROCESSING_RECOVERY_KEY,
                    PROCESSING_QUARANTINE_KEY,
                ),
                jobId.toString(),
            )
        }.onFailure { recordFailure("delete") }.getOrThrow()
    }

    override fun loadProcessingRecoveryJobs(
        staleBefore: Instant,
        limit: Int,
    ): List<AiGenerationProcessingCandidate> =
        runCatching {
            if (limit <= 0) return@runCatching emptyList()
            redisTemplate
                .opsForZSet()
                .rangeByScore(
                    PROCESSING_RECOVERY_KEY,
                    Double.NEGATIVE_INFINITY,
                    staleBefore.toEpochMilli().toDouble(),
                    0,
                    limit.toLong(),
                ).orEmpty()
                .mapNotNull { rawId ->
                    val jobId =
                        rawId.toUuidOrNull()
                            ?: run {
                                redisTemplate.opsForZSet().remove(PROCESSING_RECOVERY_KEY, rawId)
                                return@mapNotNull null
                            }
                    when (val loaded = loadRecoveryMetadata(jobId)) {
                        is AiGenerationRecoveryMetadataResult.Valid -> AiGenerationProcessingCandidate(loaded.metadata)
                        AiGenerationRecoveryMetadataResult.Missing ->
                            AiGenerationProcessingCandidate(jobId = jobId, missing = true)
                        AiGenerationRecoveryMetadataResult.Corrupt ->
                            AiGenerationProcessingCandidate(jobId = jobId, corrupt = true)
                    }
                }
        }.onFailure { recordFailure("loadProcessingRecoveryJobs") }.getOrThrow()

    override fun repairProcessingRecoveryIndex(now: Instant): AiGenerationIndexRepairResult =
        runCatching {
            val ttlSeconds =
                properties.job.redisTtl.seconds
                    .toString()
            val start =
                redisTemplate
                    .execute(
                        AiGenerationRecoveryRedisScripts.startProcessingRepairPass,
                        listOf(
                            ACTIVE_JOBS_KEY,
                            ACTIVE_INDEX_EPOCH_KEY,
                            PROCESSING_REPAIR_STATE_KEY,
                            PROCESSING_QUARANTINE_KEY,
                        ),
                        now.toEpochMilli().toString(),
                        properties.job.recoveryIndexRepairMaxMembers.toString(),
                        ttlSeconds,
                        UUID.randomUUID().toString(),
                        UUID.randomUUID().toString(),
                        properties.job.recoveryIndexRepairBatchSize.toString(),
                        REPAIR_WORKLIST_PREFIX,
                    ).orEmpty()
            if (start == "OVER_CAP") return@runCatching AiGenerationIndexRepairResult.OVER_CAP
            if (start == "PASS_COMPLETED") return@runCatching AiGenerationIndexRepairResult.PASS_COMPLETED
            if (start == "EPOCH_RESET_COMPLETE") return@runCatching AiGenerationIndexRepairResult.EPOCH_RESET
            val epochReset = start.startsWith("EPOCH_RESET|")
            val passId = start.substringAfter('|')
            require(passId.isNotBlank()) { "Redis repair pass did not return an identifier" }
            val epoch =
                requireNotNull(redisTemplate.opsForValue().get(ACTIVE_INDEX_EPOCH_KEY)) {
                    "Redis repair epoch disappeared during a wave"
                }
            val worklistKey = repairWorklistKey(passId)
            val members =
                redisTemplate
                    .opsForZSet()
                    .range(worklistKey, 0, (properties.job.recoveryIndexRepairBatchSize - 1).toLong())
                    .orEmpty()
            var quarantined = false
            var passCompleted = false
            var epochChanged = false
            members.forEach { rawId ->
                val result = repairProcessingMember(rawId, epoch, passId, worklistKey, now, ttlSeconds)
                quarantined = result.startsWith("QUARANTINED") || quarantined
                passCompleted = result.endsWith("|PASS_COMPLETED") || passCompleted
                epochChanged = result == "EPOCH_CHANGED" || epochChanged
            }
            when {
                epochReset || epochChanged -> AiGenerationIndexRepairResult.EPOCH_RESET
                quarantined -> AiGenerationIndexRepairResult.QUARANTINED
                passCompleted -> AiGenerationIndexRepairResult.PASS_COMPLETED
                else -> AiGenerationIndexRepairResult.PAGE_COMPLETED
            }
        }.onFailure { recordFailure("repairProcessingRecoveryIndex") }.getOrThrow()

    override fun probe(now: Instant): ActiveAiGenerationJobProbe.Result =
        runCatching {
            val response =
                redisTemplate
                    .execute(
                        activeQueueProbeScript,
                        listOf(
                            ACTIVE_INDEX_EPOCH_KEY,
                            PROCESSING_REPAIR_STATE_KEY,
                            ACTIVE_JOBS_KEY,
                            PROCESSING_RECOVERY_KEY,
                            PROCESSING_QUARANTINE_KEY,
                        ),
                        now.toEpochMilli().toString(),
                        properties.job.recoveryIndexRepairMaxMembers.toString(),
                    ).orEmpty()
            when {
                response.startsWith("AVAILABLE|") ->
                    ActiveAiGenerationJobProbe.Available(response.substringAfter('|').toLong())
                response == "INDEX_NOT_READY" ->
                    ActiveAiGenerationJobProbe.Unavailable(
                        ActiveAiGenerationJobProbe.UnavailableReason.INDEX_NOT_READY,
                    )
                response == "OVER_CAP" ->
                    ActiveAiGenerationJobProbe.Unavailable(
                        ActiveAiGenerationJobProbe.UnavailableReason.OVER_CAP,
                    )
                response == "QUARANTINED" ->
                    ActiveAiGenerationJobProbe.Unavailable(
                        ActiveAiGenerationJobProbe.UnavailableReason.QUARANTINED,
                    )
                else -> error("Unexpected Redis queue probe result")
            }
        }.onFailure { recordFailure("probeProcessingRecoveryQueue") }
            .getOrElse {
                ActiveAiGenerationJobProbe.Unavailable(
                    ActiveAiGenerationJobProbe.UnavailableReason.REDIS_UNAVAILABLE,
                )
            }

    private fun repairProcessingMember(
        rawId: String,
        epoch: String,
        passId: String,
        worklistKey: String,
        now: Instant,
        ttlSeconds: String,
    ): String {
        val jobId = rawId.toUuidOrNull()
        val hash = jobId?.let { redisTemplate.opsForHash<String, String>().entries(hashKey(it)) }.orEmpty()
        val iso = hash["lastUpdatedAt"].orEmpty()
        val instant = runCatching { Instant.parse(iso) }.getOrNull()
        val storedSecond = hash["lastUpdatedAtEpochSecond"]?.toLongOrNull()
        val storedNano = hash["lastUpdatedAtNano"]?.toIntOrNull()
        val status = hash["status"]?.let { runCatching { JobStatus.valueOf(it) }.getOrNull() }
        val clubId = hash["clubId"]?.toUuidOrNull()
        val sessionId = hash["sessionId"]?.toUuidOrNull()
        val hostUserId = hash["hostUserId"]?.toUuidOrNull()
        val exactTupleValid =
            jobId != null && status != null && clubId != null && sessionId != null && hostUserId != null &&
                instant != null &&
                (
                    (storedSecond == null && storedNano == null) ||
                        (storedSecond == instant.epochSecond && storedNano == instant.nano)
                )
        return redisTemplate
            .execute(
                AiGenerationRecoveryRedisScripts.repairProcessingMember,
                listOf(
                    if (jobId == null) "aigen:job:invalid-repair-member" else hashKey(jobId),
                    ACTIVE_JOBS_KEY,
                    PROCESSING_RECOVERY_KEY,
                    PROCESSING_QUARANTINE_KEY,
                    ACTIVE_INDEX_EPOCH_KEY,
                    PROCESSING_REPAIR_STATE_KEY,
                    worklistKey,
                ),
                rawId,
                epoch,
                passId,
                status?.name.orEmpty(),
                now.toEpochMilli().toString(),
                ttlSeconds,
                iso,
                instant?.epochSecond?.toString().orEmpty(),
                instant?.nano?.toString().orEmpty(),
                if (exactTupleValid) "1" else "0",
                UUID.randomUUID().toString(),
                clubId?.toString().orEmpty(),
                sessionId?.toString().orEmpty(),
                hostUserId?.toString().orEmpty(),
                now.toString(),
            ).orEmpty()
    }

    private fun repairWorklistKey(passId: String) = "$REPAIR_WORKLIST_PREFIX$passId"

    private fun readProviderAttempt(
        jobId: UUID,
        attemptId: UUID,
    ): ProviderAttempt {
        val ledger = redisTemplate.opsForHash<String, String>()
        val key = providerAttemptsKey(jobId)
        val prefix = "$attemptId:"

        fun required(field: String): String =
            ledger.get(key, prefix + field)
                ?: throw CorruptAiGenerationJobRecordException("provider attempt is incomplete")
        val provider = Provider.valueOf(required("provider"))
        return ProviderAttempt(
            attemptId = UUID.fromString(required("attemptId")),
            ordinal = required("ordinal").toInt(),
            jobId = UUID.fromString(required("jobId")),
            provider = provider,
            model = ModelId(provider, required("model")),
            mode = ProviderCallMode.valueOf(required("mode")),
            state = ProviderAttemptState.valueOf(required("state")),
            reservedCostUsd = required("reservedCostUsd").toBigDecimal(),
            costBasis = CostBasis.valueOf(required("costBasis")),
            safeErrorCode = required("safeErrorCode").takeIf(String::isNotBlank)?.let(ErrorCode::valueOf),
            startedAt = Instant.parse(required("startedAt")),
            completedAt = required("completedAt").takeIf(String::isNotBlank)?.let(Instant::parse),
        )
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

    private fun admissionReceiptKey(jobId: UUID) = "aigen:job:$jobId:admission-receipt"

    private fun dailyKey(hostId: UUID) = "aigen:host:$hostId:daily"

    private fun dailyTokenKey(hostId: UUID) = "aigen:host:$hostId:daily:window-token"

    private fun minuteKey(hostId: UUID) = "aigen:host:$hostId:minute"

    private fun minuteTokenKey(hostId: UUID) = "aigen:host:$hostId:minute:window-token"

    private fun admissionKey(clubId: UUID) = "aigen:club:$clubId:provider_admission"

    private companion object {
        const val MAX_ERROR_MESSAGE_LEN = 512
        const val MAX_RECLASSIFY_RETRIES = 3
        const val REPAIR_WORKLIST_PREFIX = "$PROCESSING_RECOVERY_KEY:repair-worklist:"

        val activeQueueProbeScript: DefaultRedisScript<String> =
            DefaultRedisScript(
                """
                redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', ARGV[1])
                local epoch = redis.call('GET', KEYS[1])
                local completedEpoch = redis.call('HGET', KEYS[2], 'completedEpoch')
                if epoch == false or epoch == '' or completedEpoch == false or completedEpoch ~= epoch then
                  return 'INDEX_NOT_READY'
                end
                if redis.call('ZCARD', KEYS[3]) > tonumber(ARGV[2]) then return 'OVER_CAP' end
                if redis.call('ZCARD', KEYS[5]) > 0 then return 'QUARANTINED' end
                return 'AVAILABLE|' .. tostring(redis.call('ZCARD', KEYS[4]))
                """.trimIndent(),
                String::class.java,
            )

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
