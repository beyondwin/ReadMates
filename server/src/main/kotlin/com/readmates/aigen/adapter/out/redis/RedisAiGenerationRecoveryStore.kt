package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.CostBasis
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderAttempt
import com.readmates.aigen.application.model.ProviderAttemptState
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryCommand
import com.readmates.aigen.application.port.out.AiGenerationAtomicRecoveryResult
import com.readmates.aigen.application.port.out.AiGenerationFailureRecoveryPort
import com.readmates.aigen.application.port.out.AiGenerationIndexRepairResult
import com.readmates.aigen.application.port.out.AiGenerationProcessingCandidate
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadata
import com.readmates.aigen.application.port.out.AiGenerationRecoveryMetadataResult
import com.readmates.aigen.application.port.out.AiGenerationRecoveryReclassification
import java.time.Instant
import java.util.UUID

internal class RedisAiGenerationRecoveryStore(
    private val context: AiGenerationRedisContext,
    private val recoveryIndex: RedisAiGenerationRecoveryIndex,
) : AiGenerationFailureRecoveryPort {
    private val redisTemplate = context.redisTemplate
    private val properties = context.properties
    private val keyspace = context.keyspace
    private val metadata = ::loadRecoveryMetadata

    override fun loadRecoveryMetadata(jobId: UUID): AiGenerationRecoveryMetadataResult =
        runCatching {
            val hash = redisTemplate.opsForHash<String, String>().entries(keyspace.hash(jobId))
            if (hash.isEmpty()) return@runCatching AiGenerationRecoveryMetadataResult.Missing
            decodeRecoveryMetadata(jobId, hash)
        }.onFailure { context.recordFailure("loadRecoveryMetadata") }.getOrThrow()

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
                            keyspace.hash(command.jobId),
                            keyspace.providerAttempts(command.jobId),
                            keyspace.admissionReceipt(command.jobId),
                            keyspace.hostDaily(command.hostUserId),
                            keyspace.hostDailyWindowToken(command.hostUserId),
                            keyspace.hostMinute(command.hostUserId),
                            keyspace.hostMinuteWindowToken(command.hostUserId),
                            keyspace.providerAdmission(command.clubId),
                            keyspace.activeJobs,
                            keyspace.activeClubJobs(command.clubId),
                            keyspace.processingRecovery,
                            keyspace.processingQuarantine,
                            keyspace.sessionRecent(command.sessionId),
                            keyspace.commitRecoveryJobs,
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
        }.onFailure { context.recordFailure("recoverFailure") }.getOrThrow()

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
                val hash = redisTemplate.opsForHash<String, String>().entries(keyspace.hash(jobId))
                val valid =
                    hash.isNotEmpty() &&
                        decodeRecoveryMetadata(jobId, hash) is AiGenerationRecoveryMetadataResult.Valid
                val response =
                    redisTemplate.execute(
                        AiGenerationRecoveryRedisScripts.reclassifyRecovery,
                        listOf(
                            keyspace.hash(jobId),
                            keyspace.activeJobs,
                            keyspace.processingRecovery,
                            keyspace.processingQuarantine,
                            keyspace.activeIndexEpoch,
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
        }.onFailure { context.recordFailure("reclassifyRecovery") }.getOrThrow()

    override fun quarantineCorrupt(
        jobId: UUID,
        now: Instant,
    ) {
        runCatching {
            redisTemplate.execute(
                AiGenerationRecoveryRedisScripts.quarantineRecovery,
                listOf(keyspace.hash(jobId), keyspace.processingRecovery, keyspace.processingQuarantine),
                jobId.toString(),
                now.toEpochMilli().toString(),
                properties.job.redisTtl.seconds
                    .toString(),
                now.toString(),
            )
        }.onFailure { context.recordFailure("quarantineRecovery") }.getOrThrow()
    }

    override fun repairProcessingRecoveryIndex(now: Instant): AiGenerationIndexRepairResult =
        recoveryIndex.repairProcessingRecoveryIndex(now)

    override fun loadProcessingRecoveryJobs(
        staleBefore: Instant,
        limit: Int,
    ): List<AiGenerationProcessingCandidate> = recoveryIndex.loadProcessingRecoveryJobs(staleBefore, limit, metadata)

    private fun readProviderAttempt(
        jobId: UUID,
        attemptId: UUID,
    ): ProviderAttempt {
        val ledger = redisTemplate.opsForHash<String, String>()
        val key = keyspace.providerAttempts(jobId)
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

    private companion object {
        const val MAX_ERROR_MESSAGE_LEN = 512
        const val MAX_RECLASSIFY_RETRIES = 3
    }
}
