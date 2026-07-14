package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.cache.RedisCacheMetrics
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.DefaultRedisScript
import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.json.JsonMapper
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

/**
 * Redis-backed implementation of the AI generation job store.
 * Persists job hash + transcript + result in three keys under `aigen:job:{jobId}*`
 * with TTL from [AiGenerationProperties.Job.redisTtl] (default 6h). Atomic operations
 * (patchItem, delete) use Lua scripts so callers see consistent state.
 *
 * Conditional on `readmates.redis.enabled=true` and `readmates.aigen.enabled=true`.
 * When disabled, no bean is loaded; the orchestrator's API surface should return 503.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["redis.enabled", "aigen.enabled"], havingValue = "true")
@Suppress("TooManyFunctions")
class RedisAiGenerationJobStore(
    private val redisTemplate: StringRedisTemplate,
    private val properties: AiGenerationProperties,
    private val metrics: RedisCacheMetrics,
) : AiGenerationJobStore {
    private val objectMapper: ObjectMapper = JsonMapper.builder().findAndAddModules().build()

    override fun save(job: JobRecord) {
        runCatching {
            val ttlSeconds = properties.job.redisTtl.seconds
            val hashKey = hashKey(job.jobId)
            val transcriptKey = transcriptKey(job.jobId)
            val turnsKey = turnsKey(job.jobId)
            val resultKey = resultKey(job.jobId)

            val hash = toHash(job)
            redisTemplate.opsForHash<String, String>().putAll(hashKey, hash)
            redisTemplate.expire(hashKey, java.time.Duration.ofSeconds(ttlSeconds))

            redisTemplate.opsForValue().set(transcriptKey, job.transcript, java.time.Duration.ofSeconds(ttlSeconds))
            if (job.pipelineMode == AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT) {
                require(job.validatedTurns.isNotEmpty()) { "Grounded job requires validated transcript turns" }
                redisTemplate
                    .opsForValue()
                    .set(
                        turnsKey,
                        objectMapper.writeValueAsString(job.validatedTurns),
                        java.time.Duration.ofSeconds(ttlSeconds),
                    )
            }

            if (job.result != null) {
                redisTemplate
                    .opsForValue()
                    .set(
                        resultKey,
                        objectMapper.writeValueAsString(job.result),
                        java.time.Duration.ofSeconds(ttlSeconds),
                    )
            }
            indexJob(job)
        }.onFailure { recordFailure("save") }.getOrThrow()
    }

    override fun load(jobId: UUID): JobRecord? =
        runCatching {
            val hashKey = hashKey(jobId)
            val hash = redisTemplate.opsForHash<String, String>().entries(hashKey)
            if (hash.isEmpty()) return@runCatching null

            val status = hash["status"]?.let { JobStatus.valueOf(it) }
            val pipelineMode =
                hash["pipelineMode"]?.let(AiGenerationPipelineMode::valueOf) ?: AiGenerationPipelineMode.LEGACY
            val transcript = redisTemplate.opsForValue().get(transcriptKey(jobId))
            if (transcript == null && status !in PAYLOAD_OPTIONAL_STATUSES) {
                return@runCatching deleteStaleJob(jobId)
            }
            val resultJson = redisTemplate.opsForValue().get(resultKey(jobId))
            val result =
                resultJson?.let { objectMapper.readValue(it, SessionImportV1Snapshot::class.java) }
            val turnsJson = redisTemplate.opsForValue().get(turnsKey(jobId))
            if (
                pipelineMode == AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT &&
                turnsJson == null &&
                status !in PAYLOAD_OPTIONAL_STATUSES
            ) {
                return@runCatching deleteStaleJob(jobId)
            }
            val validatedTurns: List<ValidatedTranscriptTurn> =
                turnsJson
                    ?.let { objectMapper.readValue(it, Array<ValidatedTranscriptTurn>::class.java).toList() }
                    .orEmpty()

            fromHash(jobId, hash, transcript.orEmpty(), result, validatedTurns)
        }.onFailure { recordFailure("load") }.getOrNull()

    override fun loadRecentForSession(
        sessionId: UUID,
        limit: Int,
    ): List<JobRecord> =
        runCatching {
            if (limit <= 0) return@runCatching emptyList()
            val key = sessionRecentKey(sessionId)
            val ids =
                redisTemplate
                    .opsForZSet()
                    .reverseRange(key, 0, (limit - 1).coerceAtLeast(0).toLong())
                    .orEmpty()
            ids.mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = load(jobId)
                when {
                    record == null -> {
                        redisTemplate.opsForZSet().remove(key, id)
                        null
                    }
                    record.sessionId != sessionId -> {
                        redisTemplate.opsForZSet().remove(key, id)
                        null
                    }
                    else -> record
                }
            }
        }.onFailure { recordFailure("loadRecentForSession") }.getOrDefault(emptyList())

    override fun loadActiveJobs(limit: Int): List<JobRecord> =
        runCatching {
            if (limit <= 0) return@runCatching emptyList()
            val ids =
                redisTemplate
                    .opsForZSet()
                    .reverseRange(activeJobsKey(), 0, (limit - 1).coerceAtLeast(0).toLong())
                    .orEmpty()
            ids.mapNotNull { id ->
                val jobId = id.toUuidOrNull() ?: return@mapNotNull null
                val record = load(jobId)
                when {
                    record == null -> {
                        redisTemplate.opsForZSet().remove(activeJobsKey(), id)
                        null
                    }
                    record.status !in ACTIVE_INDEX_STATUSES -> {
                        removeFromActiveIndexes(record)
                        null
                    }
                    else -> record
                }
            }
        }.onFailure { recordFailure("loadActiveJobs") }.getOrDefault(emptyList())

    override fun saveResult(
        jobId: UUID,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
    ) {
        runCatching {
            val ttlSeconds = properties.job.redisTtl.seconds
            val lastUpdatedAt = Instant.now()
            val resultJson = objectMapper.writeValueAsString(result)
            redisTemplate.execute(
                PATCH_RESULT_SCRIPT,
                listOf(hashKey(jobId), resultKey(jobId), transcriptKey(jobId), turnsKey(jobId)),
                resultJson,
                usage.inputTokens.toString(),
                usage.cachedInputTokens.toString(),
                usage.outputTokens.toString(),
                cost.toPlainString(),
                lastUpdatedAt.toString(),
                ttlSeconds.toString(),
            )
            refreshIndexes(jobId)
        }.onFailure { recordFailure("saveResult") }.getOrThrow()
    }

    override fun patchItem(
        jobId: UUID,
        item: GenerationItem,
        value: Any,
        usage: TokenUsage,
        cost: BigDecimal,
    ) {
        runCatching {
            val ttlSeconds = properties.job.redisTtl.seconds
            val lastUpdatedAt = Instant.now()
            // value contract: orchestrator passes the FULL patched SessionImportV1Snapshot.
            // We always re-serialize the snapshot — primitive/per-item values are not supported.
            require(value is SessionImportV1Snapshot) {
                "patchItem requires value: SessionImportV1Snapshot (full patched snapshot)"
            }
            val newResultJson = objectMapper.writeValueAsString(value)
            redisTemplate.execute(
                PATCH_RESULT_SCRIPT,
                listOf(hashKey(jobId), resultKey(jobId), transcriptKey(jobId), turnsKey(jobId)),
                newResultJson,
                usage.inputTokens.toString(),
                usage.cachedInputTokens.toString(),
                usage.outputTokens.toString(),
                cost.toPlainString(),
                lastUpdatedAt.toString(),
                ttlSeconds.toString(),
            )
            refreshIndexes(jobId)
        }.onFailure { recordFailure("patchItem") }.getOrThrow()
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
    ): Boolean =
        runCatching {
            val lastUpdatedAt = Instant.now()
            val result =
                redisTemplate.execute(
                    TRANSITION_STATUS_SCRIPT,
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
                    SAVE_RESULT_IF_STATUS_SCRIPT,
                    listOf(hashKey(jobId), resultKey(jobId), transcriptKey(jobId), turnsKey(jobId)),
                    expected.name,
                    resultJson,
                    usage.inputTokens.toString(),
                    usage.cachedInputTokens.toString(),
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

    override fun deleteTransientPayload(jobId: UUID) {
        runCatching {
            redisTemplate.execute(
                DELETE_TRANSIENT_PAYLOAD_SCRIPT,
                listOf(transcriptKey(jobId), resultKey(jobId), turnsKey(jobId)),
            )
            refreshIndexes(jobId)
        }.onFailure { recordFailure("deleteTransientPayload") }.getOrThrow()
    }

    override fun incrementLlmCallCount(jobId: UUID): Int =
        runCatching {
            val hashKey = hashKey(jobId)
            val ops = redisTemplate.opsForHash<String, String>()
            val next = ops.increment(hashKey, "llmCallCount", 1L) ?: 1L
            // Refresh TTL so the counter doesn't outlast the hash (the field shares the
            // 6h job TTL with the rest of the record). EXPIRE is a no-op if the key is
            // already gone, so we don't need a guard.
            redisTemplate.expire(hashKey, properties.job.redisTtl)
            refreshTransientPayloadTtls(jobId)
            next.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        }.onFailure { recordFailure("incrementLlmCallCount") }.getOrThrow()

    private fun deleteStaleJob(jobId: UUID): JobRecord? {
        delete(jobId)
        return null
    }

    private fun refreshTransientPayloadTtls(jobId: UUID) {
        val ttl = properties.job.redisTtl
        redisTemplate.expire(transcriptKey(jobId), ttl)
        redisTemplate.expire(turnsKey(jobId), ttl)
        redisTemplate.expire(resultKey(jobId), ttl)
    }

    override fun delete(jobId: UUID) {
        runCatching {
            val hash = redisTemplate.opsForHash<String, String>().entries(hashKey(jobId))
            redisTemplate.execute(
                DELETE_JOB_SCRIPT,
                listOf(hashKey(jobId), transcriptKey(jobId), resultKey(jobId), turnsKey(jobId)),
            )
            removeFromIndexes(
                jobId = jobId,
                sessionId = hash["sessionId"]?.let(UUID::fromString),
                clubId = hash["clubId"]?.let(UUID::fromString),
            )
        }.onFailure { recordFailure("delete") }.getOrThrow()
    }

    private fun toHash(job: JobRecord): Map<String, String> {
        val map =
            mutableMapOf(
                "jobId" to job.jobId.toString(),
                "sessionId" to job.sessionId.toString(),
                "clubId" to job.clubId.toString(),
                "hostUserId" to job.hostUserId.toString(),
                "modelProvider" to job.model.provider.name,
                "modelName" to job.model.name,
                "authorNameMode" to job.authorNameMode.name,
                "pipelineMode" to job.pipelineMode.name,
                "eligibleFallbackModels" to objectMapper.writeValueAsString(job.eligibleFallbackModels),
                "sessionMeta" to objectMapper.writeValueAsString(job.sessionMeta),
                "status" to job.status.name,
                "progressPct" to job.progressPct.toString(),
                "tokensInput" to job.tokens.inputTokens.toString(),
                "tokensCached" to job.tokens.cachedInputTokens.toString(),
                "tokensOutput" to job.tokens.outputTokens.toString(),
                "costAccumulatedUsd" to job.costAccumulatedUsd.toPlainString(),
                "llmCallCount" to job.llmCallCount.toString(),
                "expiresAt" to job.expiresAt.toString(),
                "createdAt" to job.createdAt.toString(),
                "lastUpdatedAt" to job.lastUpdatedAt.toString(),
            )
        job.actualModel?.let {
            map["actualModelProvider"] = it.provider.name
            map["actualModelName"] = it.name
        }
        job.stage?.let { map["stage"] = it.name }
        job.instructions?.let { map["instructions"] = it }
        job.error?.let {
            map["errorCode"] = it.code.name
            map["errorMessage"] = it.message.take(MAX_ERROR_MESSAGE_LEN)
        }
        return map
    }

    private fun fromHash(
        jobId: UUID,
        hash: Map<String, String>,
        transcript: String,
        result: SessionImportV1Snapshot?,
        validatedTurns: List<ValidatedTranscriptTurn>,
    ): JobRecord {
        val expiresAt =
            hash["expiresAt"]
                ?.let { runCatching { Instant.parse(it) }.getOrNull() }
                ?: Instant.now().plus(properties.job.redisTtl)
        val createdAt =
            hash["createdAt"]
                ?.let { runCatching { Instant.parse(it) }.getOrNull() }
                ?: expiresAt.minus(properties.job.redisTtl)
        val lastUpdatedAt =
            hash["lastUpdatedAt"]
                ?.let { runCatching { Instant.parse(it) }.getOrNull() }
                ?: createdAt
        return JobRecord(
            jobId = jobId,
            sessionId = UUID.fromString(hash.getValue("sessionId")),
            clubId = UUID.fromString(hash.getValue("clubId")),
            hostUserId = UUID.fromString(hash.getValue("hostUserId")),
            model =
                ModelId(
                    provider = Provider.valueOf(hash.getValue("modelProvider")),
                    name = hash.getValue("modelName"),
                ),
            authorNameMode = AuthorNameMode.valueOf(hash.getValue("authorNameMode")),
            instructions = hash["instructions"],
            transcript = transcript,
            sessionMeta = objectMapper.readValue(hash.getValue("sessionMeta"), SessionMeta::class.java),
            status = JobStatus.valueOf(hash.getValue("status")),
            stage = hash["stage"]?.let { JobStage.valueOf(it) },
            progressPct = hash.getValue("progressPct").toInt(),
            result = result,
            error =
                hash["errorCode"]?.let { code ->
                    GenerationError(
                        code = ErrorCode.valueOf(code),
                        message = hash["errorMessage"].orEmpty(),
                    )
                },
            tokens =
                TokenUsage(
                    inputTokens = hash.getValue("tokensInput").toLong(),
                    cachedInputTokens = hash.getValue("tokensCached").toLong(),
                    outputTokens = hash.getValue("tokensOutput").toLong(),
                ),
            costAccumulatedUsd = BigDecimal(hash.getValue("costAccumulatedUsd")),
            expiresAt = expiresAt,
            createdAt = createdAt,
            lastUpdatedAt = lastUpdatedAt,
            actualModel = readActualModel(hash),
            llmCallCount = hash["llmCallCount"]?.toIntOrNull() ?: 0,
            pipelineMode =
                hash["pipelineMode"]?.let(AiGenerationPipelineMode::valueOf)
                    ?: AiGenerationPipelineMode.LEGACY,
            validatedTurns = validatedTurns,
            eligibleFallbackModels =
                hash["eligibleFallbackModels"]
                    ?.let { objectMapper.readValue(it, Array<ModelId>::class.java).toList() }
                    .orEmpty(),
        )
    }

    private fun readActualModel(hash: Map<String, String>): ModelId? =
        hash["actualModelName"]?.let { name ->
            ModelId(
                provider = Provider.valueOf(hash.getValue("actualModelProvider")),
                name = name,
            )
        }

    private fun refreshIndexes(jobId: UUID) {
        val record = load(jobId) ?: return
        indexJob(record)
    }

    private fun indexJob(job: JobRecord) {
        val id = job.jobId.toString()
        val score = job.lastUpdatedAt.toEpochMilli().toDouble()
        val ttl = properties.job.redisTtl
        val zSet = redisTemplate.opsForZSet()

        val sessionKey = sessionRecentKey(job.sessionId)
        zSet.add(sessionKey, id, score)
        redisTemplate.expire(sessionKey, ttl)

        if (job.status in ACTIVE_INDEX_STATUSES) {
            val activeKey = activeJobsKey()
            val clubKey = activeClubJobsKey(job.clubId)
            zSet.add(activeKey, id, score)
            zSet.add(clubKey, id, score)
            redisTemplate.expire(activeKey, ttl)
            redisTemplate.expire(clubKey, ttl)
        } else {
            removeFromActiveIndexes(job)
        }
    }

    private fun removeFromActiveIndexes(job: JobRecord) {
        removeFromIndexes(job.jobId, sessionId = null, clubId = job.clubId)
    }

    private fun removeFromIndexes(
        jobId: UUID,
        sessionId: UUID?,
        clubId: UUID?,
    ) {
        val id = jobId.toString()
        val zSet = redisTemplate.opsForZSet()
        zSet.remove(activeJobsKey(), id)
        if (sessionId != null) {
            zSet.remove(sessionRecentKey(sessionId), id)
        }
        if (clubId != null) {
            zSet.remove(activeClubJobsKey(clubId), id)
        }
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

    private fun sessionRecentKey(sessionId: UUID) = "aigen:session:$sessionId:jobs"

    private fun activeJobsKey() = "aigen:jobs:active"

    private fun activeClubJobsKey(clubId: UUID) = "aigen:club:$clubId:jobs:active"

    private companion object {
        const val MAX_ERROR_MESSAGE_LEN = 512

        val PAYLOAD_OPTIONAL_STATUSES =
            setOf(JobStatus.COMMITTING, JobStatus.COMMITTED, JobStatus.CANCELLED, JobStatus.FAILED)

        val ACTIVE_INDEX_STATUSES =
            setOf(JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCEEDED, JobStatus.COMMITTING)

        /**
         * KEYS[1]=hashKey
         * ARGV[1]=comma-separated expected statuses, ARGV[2]=next status,
         * ARGV[3]=stage or "", ARGV[4]=progressPct,
         * ARGV[5]=errorCode or "", ARGV[6]=errorMessage or "",
         * ARGV[7]=lastUpdatedAt, ARGV[8]=ttlSeconds.
         */
        val TRANSITION_STATUS_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                if redis.call('EXISTS', KEYS[1]) == 0 then
                  return 0
                end
                local current = redis.call('HGET', KEYS[1], 'status')
                local expected = ',' .. ARGV[1] .. ','
                if string.find(expected, ',' .. current .. ',', 1, true) == nil then
                  return 0
                end
                redis.call('HSET', KEYS[1], 'status', ARGV[2])
                if ARGV[3] == '' then
                  redis.call('HDEL', KEYS[1], 'stage')
                else
                  redis.call('HSET', KEYS[1], 'stage', ARGV[3])
                end
                redis.call('HSET', KEYS[1], 'progressPct', ARGV[4])
                redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[7])
                if ARGV[5] == '' then
                  redis.call('HDEL', KEYS[1], 'errorCode', 'errorMessage')
                else
                  redis.call('HSET', KEYS[1], 'errorCode', ARGV[5])
                  redis.call('HSET', KEYS[1], 'errorMessage', ARGV[6])
                end
                redis.call('EXPIRE', KEYS[1], ARGV[8])
                return 1
                """.trimIndent(),
                Long::class.java,
            )

        /**
         * KEYS[1]=hashKey, KEYS[2]=resultKey, KEYS[3]=transcriptKey, KEYS[4]=turnsKey
         * ARGV[1]=expected status, ARGV[2]=resultJson, ARGV[3..5]=token deltas,
         * ARGV[6]=cost delta, ARGV[7]=lastUpdatedAt, ARGV[8]=ttlSeconds,
         * ARGV[9]=actualModelProvider or "", ARGV[10]=actualModelName or "".
         */
        val SAVE_RESULT_IF_STATUS_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                if redis.call('EXISTS', KEYS[1]) == 0 then
                  return 0
                end
                if redis.call('HGET', KEYS[1], 'status') ~= ARGV[1] then
                  return 0
                end
                redis.call('SET', KEYS[2], ARGV[2])
                redis.call('EXPIRE', KEYS[2], ARGV[8])
                redis.call('HINCRBY', KEYS[1], 'tokensInput', ARGV[3])
                redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[4])
                redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[5])
                redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[6])
                redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[7])
                redis.call('EXPIRE', KEYS[1], ARGV[8])
                if redis.call('EXISTS', KEYS[3]) == 1 then
                  redis.call('EXPIRE', KEYS[3], ARGV[8])
                end
                if redis.call('EXISTS', KEYS[4]) == 1 then
                  redis.call('EXPIRE', KEYS[4], ARGV[8])
                end
                if ARGV[9] ~= '' then
                  redis.call('HSET', KEYS[1], 'actualModelProvider', ARGV[9])
                  redis.call('HSET', KEYS[1], 'actualModelName', ARGV[10])
                end
                return 1
                """.trimIndent(),
                Long::class.java,
            )

        /** KEYS[1]=transcriptKey, KEYS[2]=resultKey, KEYS[3]=turnsKey; deletes transient payload only. */
        val DELETE_TRANSIENT_PAYLOAD_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
                """.trimIndent(),
                Long::class.java,
            )

        /**
         * KEYS[1]=hashKey, KEYS[2]=resultKey, KEYS[3]=transcriptKey, KEYS[4]=turnsKey
         * ARGV[1]=resultJson, ARGV[2..4]=tokens (input,cached,output) delta,
         * ARGV[5]=cost delta (decimal string), ARGV[6]=lastUpdatedAt, ARGV[7]=ttlSeconds
         *
         * Atomically: SET resultJson; HINCRBY tokens; HINCRBYFLOAT cost; refresh TTL on
         * hash + result + (existing) transcript so all three expire together.
         */
        val PATCH_RESULT_SCRIPT: DefaultRedisScript<Void> =
            DefaultRedisScript(
                """
                redis.call('SET', KEYS[2], ARGV[1])
                redis.call('EXPIRE', KEYS[2], ARGV[7])
                redis.call('HINCRBY', KEYS[1], 'tokensInput', ARGV[2])
                redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[3])
                redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[4])
                redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[5])
                redis.call('HSET', KEYS[1], 'lastUpdatedAt', ARGV[6])
                redis.call('EXPIRE', KEYS[1], ARGV[7])
                if redis.call('EXISTS', KEYS[3]) == 1 then
                  redis.call('EXPIRE', KEYS[3], ARGV[7])
                end
                if redis.call('EXISTS', KEYS[4]) == 1 then
                  redis.call('EXPIRE', KEYS[4], ARGV[7])
                end
                return nil
                """.trimIndent(),
                Void::class.java,
            )

        /** KEYS[1]=hash, KEYS[2]=transcript, KEYS[3]=result, KEYS[4]=turns; deletes all atomically. */
        val DELETE_JOB_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3], KEYS[4])
                """.trimIndent(),
                Long::class.java,
            )
    }
}
