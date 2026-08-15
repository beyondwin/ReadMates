package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.out.ActiveAiGenerationJobProbe
import com.readmates.aigen.application.port.out.AiGenerationIndexRepairResult
import com.readmates.aigen.application.port.out.AiGenerationProcessingCandidate
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadataResult
import org.springframework.data.redis.core.script.DefaultRedisScript
import java.time.Instant
import java.util.UUID

internal class RedisAiGenerationRecoveryIndex(
    private val context: AiGenerationRedisContext,
) : ActiveAiGenerationJobProbe {
    private val redisTemplate = context.redisTemplate
    private val properties = context.properties
    private val keyspace = context.keyspace

    fun loadProcessingRecoveryJobs(
        staleBefore: Instant,
        limit: Int,
        loadMetadata: (UUID) -> AiGenerationRecoveryMetadataResult,
    ): List<AiGenerationProcessingCandidate> =
        runCatching {
            if (limit <= 0) return@runCatching emptyList()
            redisTemplate
                .opsForZSet()
                .rangeByScore(
                    keyspace.processingRecovery,
                    Double.NEGATIVE_INFINITY,
                    staleBefore.toEpochMilli().toDouble(),
                    0,
                    limit.toLong(),
                ).orEmpty()
                .mapNotNull { rawId ->
                    val jobId =
                        rawId.toUuidOrNull()
                            ?: run {
                                redisTemplate.opsForZSet().remove(keyspace.processingRecovery, rawId)
                                return@mapNotNull null
                            }
                    when (val loaded = loadMetadata(jobId)) {
                        is AiGenerationRecoveryMetadataResult.Valid -> AiGenerationProcessingCandidate(loaded.metadata)
                        AiGenerationRecoveryMetadataResult.Missing ->
                            AiGenerationProcessingCandidate(jobId = jobId, missing = true)
                        AiGenerationRecoveryMetadataResult.Corrupt ->
                            AiGenerationProcessingCandidate(jobId = jobId, corrupt = true)
                    }
                }
        }.onFailure { context.recordFailure("loadProcessingRecoveryJobs") }.getOrThrow()

    fun repairProcessingRecoveryIndex(now: Instant): AiGenerationIndexRepairResult =
        runCatching {
            val ttlSeconds =
                properties.job.redisTtl.seconds
                    .toString()
            val start =
                redisTemplate
                    .execute(
                        AiGenerationRecoveryRedisScripts.startProcessingRepairPass,
                        listOf(
                            keyspace.activeJobs,
                            keyspace.activeIndexEpoch,
                            keyspace.processingRepairState,
                            keyspace.processingQuarantine,
                        ),
                        now.toEpochMilli().toString(),
                        properties.job.recoveryIndexRepairMaxMembers.toString(),
                        ttlSeconds,
                        UUID.randomUUID().toString(),
                        UUID.randomUUID().toString(),
                        properties.job.recoveryIndexRepairBatchSize.toString(),
                        keyspace.repairWorklistPrefix,
                    ).orEmpty()
            if (start == "OVER_CAP") return@runCatching AiGenerationIndexRepairResult.OVER_CAP
            if (start == "PASS_COMPLETED") return@runCatching AiGenerationIndexRepairResult.PASS_COMPLETED
            if (start == "EPOCH_RESET_COMPLETE") return@runCatching AiGenerationIndexRepairResult.EPOCH_RESET
            val epochReset = start.startsWith("EPOCH_RESET|")
            val passId = start.substringAfter('|')
            require(passId.isNotBlank()) { "Redis repair pass did not return an identifier" }
            val epoch =
                requireNotNull(redisTemplate.opsForValue().get(keyspace.activeIndexEpoch)) {
                    "Redis repair epoch disappeared during a wave"
                }
            val worklistKey = keyspace.repairWorklist(passId)
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
        }.onFailure { context.recordFailure("repairProcessingRecoveryIndex") }.getOrThrow()

    override fun probe(now: Instant): ActiveAiGenerationJobProbe.Result =
        runCatching {
            val response =
                redisTemplate
                    .execute(
                        activeQueueProbeScript,
                        listOf(
                            keyspace.activeIndexEpoch,
                            keyspace.processingRepairState,
                            keyspace.activeJobs,
                            keyspace.processingRecovery,
                            keyspace.processingQuarantine,
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
        }.onFailure { context.recordFailure("probeProcessingRecoveryQueue") }
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
        val hash = jobId?.let { redisTemplate.opsForHash<String, String>().entries(keyspace.hash(it)) }.orEmpty()
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
                    if (jobId == null) keyspace.invalidRepairMember else keyspace.hash(jobId),
                    keyspace.activeJobs,
                    keyspace.processingRecovery,
                    keyspace.processingQuarantine,
                    keyspace.activeIndexEpoch,
                    keyspace.processingRepairState,
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

    private fun String.toUuidOrNull(): UUID? =
        runCatching {
            UUID.fromString(this)
        }.getOrNull()

    private companion object {
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
    }
}
