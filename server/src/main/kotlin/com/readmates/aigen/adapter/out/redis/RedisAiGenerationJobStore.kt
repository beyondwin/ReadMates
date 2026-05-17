package com.readmates.aigen.adapter.out.redis

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
            val resultKey = resultKey(job.jobId)

            val hash = toHash(job)
            redisTemplate.opsForHash<String, String>().putAll(hashKey, hash)
            redisTemplate.expire(hashKey, java.time.Duration.ofSeconds(ttlSeconds))

            redisTemplate.opsForValue().set(transcriptKey, job.transcript, java.time.Duration.ofSeconds(ttlSeconds))

            if (job.result != null) {
                redisTemplate
                    .opsForValue()
                    .set(
                        resultKey,
                        objectMapper.writeValueAsString(job.result),
                        java.time.Duration.ofSeconds(ttlSeconds),
                    )
            }
        }.onFailure { recordFailure("save") }.getOrThrow()
    }

    override fun load(jobId: UUID): JobRecord? =
        runCatching {
            val hashKey = hashKey(jobId)
            val hash = redisTemplate.opsForHash<String, String>().entries(hashKey)
            if (hash.isEmpty()) return@runCatching null

            val transcript =
                redisTemplate.opsForValue().get(transcriptKey(jobId))
                    ?: return@runCatching deleteStaleJob(jobId)
            val resultJson = redisTemplate.opsForValue().get(resultKey(jobId))
            val result =
                resultJson?.let { objectMapper.readValue(it, SessionImportV1Snapshot::class.java) }

            fromHash(jobId, hash, transcript, result)
        }.onFailure { recordFailure("load") }.getOrNull()

    override fun saveResult(
        jobId: UUID,
        result: SessionImportV1Snapshot,
        usage: TokenUsage,
        cost: BigDecimal,
    ) {
        runCatching {
            val ttlSeconds = properties.job.redisTtl.seconds
            val resultJson = objectMapper.writeValueAsString(result)
            redisTemplate.execute(
                PATCH_RESULT_SCRIPT,
                listOf(hashKey(jobId), resultKey(jobId), transcriptKey(jobId)),
                resultJson,
                usage.inputTokens.toString(),
                usage.cachedInputTokens.toString(),
                usage.outputTokens.toString(),
                cost.toPlainString(),
                ttlSeconds.toString(),
            )
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
            // value contract: orchestrator passes the FULL patched SessionImportV1Snapshot.
            // We always re-serialize the snapshot — primitive/per-item values are not supported.
            require(value is SessionImportV1Snapshot) {
                "patchItem requires value: SessionImportV1Snapshot (full patched snapshot)"
            }
            val newResultJson = objectMapper.writeValueAsString(value)
            redisTemplate.execute(
                PATCH_RESULT_SCRIPT,
                listOf(hashKey(jobId), resultKey(jobId), transcriptKey(jobId)),
                newResultJson,
                usage.inputTokens.toString(),
                usage.cachedInputTokens.toString(),
                usage.outputTokens.toString(),
                cost.toPlainString(),
                ttlSeconds.toString(),
            )
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
            ops.put(hashKey, "status", status.name)
            if (stage != null) ops.put(hashKey, "stage", stage.name) else ops.delete(hashKey, "stage")
            ops.put(hashKey, "progressPct", progressPct.toString())
            if (error != null) {
                ops.put(hashKey, "errorCode", error.code.name)
                ops.put(hashKey, "errorMessage", error.message.take(MAX_ERROR_MESSAGE_LEN))
            } else {
                ops.delete(hashKey, "errorCode", "errorMessage")
            }
        }.onFailure { recordFailure("updateStatus") }.getOrThrow()
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
            next.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        }.onFailure { recordFailure("incrementLlmCallCount") }.getOrThrow()

    private fun deleteStaleJob(jobId: UUID): JobRecord? {
        delete(jobId)
        return null
    }

    override fun delete(jobId: UUID) {
        runCatching {
            redisTemplate.execute(
                DELETE_JOB_SCRIPT,
                listOf(hashKey(jobId), transcriptKey(jobId), resultKey(jobId)),
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
                "sessionMeta" to objectMapper.writeValueAsString(job.sessionMeta),
                "status" to job.status.name,
                "progressPct" to job.progressPct.toString(),
                "tokensInput" to job.tokens.inputTokens.toString(),
                "tokensCached" to job.tokens.cachedInputTokens.toString(),
                "tokensOutput" to job.tokens.outputTokens.toString(),
                "costAccumulatedUsd" to job.costAccumulatedUsd.toPlainString(),
                "llmCallCount" to job.llmCallCount.toString(),
            )
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
    ): JobRecord {
        val expiresAt = Instant.now().plus(properties.job.redisTtl)
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
            llmCallCount = hash["llmCallCount"]?.toIntOrNull() ?: 0,
        )
    }

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

    private fun resultKey(jobId: UUID) = "aigen:job:$jobId:result"

    private companion object {
        const val MAX_ERROR_MESSAGE_LEN = 512

        /**
         * KEYS[1]=hashKey, KEYS[2]=resultKey, KEYS[3]=transcriptKey
         * ARGV[1]=resultJson, ARGV[2..4]=tokens (input,cached,output) delta,
         * ARGV[5]=cost delta (decimal string), ARGV[6]=ttlSeconds
         *
         * Atomically: SET resultJson; HINCRBY tokens; HINCRBYFLOAT cost; refresh TTL on
         * hash + result + (existing) transcript so all three expire together.
         */
        val PATCH_RESULT_SCRIPT: DefaultRedisScript<Void> =
            DefaultRedisScript(
                """
                redis.call('SET', KEYS[2], ARGV[1])
                redis.call('EXPIRE', KEYS[2], ARGV[6])
                redis.call('HINCRBY', KEYS[1], 'tokensInput', ARGV[2])
                redis.call('HINCRBY', KEYS[1], 'tokensCached', ARGV[3])
                redis.call('HINCRBY', KEYS[1], 'tokensOutput', ARGV[4])
                redis.call('HINCRBYFLOAT', KEYS[1], 'costAccumulatedUsd', ARGV[5])
                redis.call('EXPIRE', KEYS[1], ARGV[6])
                if redis.call('EXISTS', KEYS[3]) == 1 then
                  redis.call('EXPIRE', KEYS[3], ARGV[6])
                end
                return nil
                """.trimIndent(),
                Void::class.java,
            )

        /** KEYS[1]=hash, KEYS[2]=transcript, KEYS[3]=result; deletes all three atomically. */
        val DELETE_JOB_SCRIPT: DefaultRedisScript<Long> =
            DefaultRedisScript(
                """
                return redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
                """.trimIndent(),
                Long::class.java,
            )
    }
}
