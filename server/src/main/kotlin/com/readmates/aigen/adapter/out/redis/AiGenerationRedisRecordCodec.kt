package com.readmates.aigen.adapter.out.redis

import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.GroundedSourceContext
import com.readmates.aigen.application.port.out.JobRecord
import tools.jackson.databind.ObjectMapper
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

internal class AiGenerationRedisRecordCodec(
    private val objectMapper: ObjectMapper,
    private val ttl: Duration,
) {
    fun toHash(job: JobRecord): Map<String, String> {
        val map = baseHash(job)
        if (job.pipelineMode == AiGenerationPipelineMode.LEGACY) {
            map["sessionMeta"] = objectMapper.writeValueAsString(job.sessionMeta)
            job.instructions?.let { map["instructions"] = it }
            job.groundingStatus?.let { map["groundingStatus"] = it.name }
        } else {
            map["groundingStatus"] = (job.groundingStatus ?: GroundingStatus.PENDING).name
        }
        job.actualModel?.let {
            map["actualModelProvider"] = it.provider.name
            map["actualModelName"] = it.name
        }
        job.stage?.let { map["stage"] = it.name }
        job.commitLeaseExpiresAt?.let { map["commitLeaseExpiresAt"] = it.toEpochMilli().toString() }
        job.error?.let {
            map["errorCode"] = it.code.name
            map["errorMessage"] = it.message.take(MAX_ERROR_MESSAGE_LENGTH)
        }
        return map
    }

    private fun baseHash(job: JobRecord): MutableMap<String, String> =
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
            "status" to job.status.name,
            "progressPct" to job.progressPct.toString(),
            "tokensInput" to job.tokens.inputTokens.toString(),
            "tokensCached" to job.tokens.cachedInputTokens.toString(),
            "tokensOutput" to job.tokens.outputTokens.toString(),
            "costAccumulatedUsd" to job.costAccumulatedUsd.toPlainString(),
            "llmCallCount" to job.llmCallCount.toString(),
            "revision" to job.revision.toString(),
            "cleanupPending" to job.cleanupPending.toString(),
            "expiresAt" to job.expiresAt.toString(),
            "createdAt" to job.createdAt.toString(),
            "lastUpdatedAt" to job.lastUpdatedAt.toString(),
        )

    fun fromHash(
        jobId: UUID,
        hash: Map<String, String>,
        transcript: String,
        result: SessionImportV1Snapshot?,
        groundedDraft: GroundedGenerationDraft?,
        sourceContext: GroundedSourceContext?,
        evidence: GroundedEvidenceBundle?,
        includeSensitiveHashFields: Boolean = true,
    ): JobRecord {
        val timestamps = readTimestamps(hash)
        return JobRecord(
            jobId = jobId,
            sessionId = UUID.fromString(hash.getValue("sessionId")),
            clubId = UUID.fromString(hash.getValue("clubId")),
            hostUserId = UUID.fromString(hash.getValue("hostUserId")),
            model = readModel(hash, "modelProvider", "modelName"),
            authorNameMode = AuthorNameMode.valueOf(hash.getValue("authorNameMode")),
            instructions = sourceContext?.instructions ?: hash["instructions"]?.takeIf { includeSensitiveHashFields },
            transcript = transcript,
            sessionMeta = sourceContext?.sessionMeta ?: readSessionMeta(hash, includeSensitiveHashFields),
            status = JobStatus.valueOf(hash.getValue("status")),
            stage = hash["stage"]?.let(JobStage::valueOf),
            progressPct = hash.getValue("progressPct").toInt(),
            result = result,
            groundedDraft = groundedDraft,
            error = readError(hash),
            tokens = readTokens(hash),
            costAccumulatedUsd = BigDecimal(hash.getValue("costAccumulatedUsd")),
            expiresAt = timestamps.expiresAt,
            createdAt = timestamps.createdAt,
            lastUpdatedAt = timestamps.lastUpdatedAt,
            actualModel = readActualModel(hash),
            llmCallCount = hash["llmCallCount"]?.toIntOrNull() ?: 0,
            pipelineMode =
                hash["pipelineMode"]?.let(AiGenerationPipelineMode::valueOf)
                    ?: AiGenerationPipelineMode.LEGACY,
            validatedTurns = sourceContext?.validatedTurns.orEmpty(),
            eligibleFallbackModels = readEligibleFallbackModels(hash),
            revision = hash["revision"]?.toLongOrNull() ?: 0,
            groundingStatus = hash["groundingStatus"]?.let(GroundingStatus::valueOf),
            evidence = evidence,
            cleanupPending = hash["cleanupPending"]?.toBooleanStrictOrNull() ?: false,
            commitLeaseExpiresAt = hash["commitLeaseExpiresAt"]?.toLongOrNull()?.let(Instant::ofEpochMilli),
        )
    }

    private fun readTimestamps(hash: Map<String, String>): JobTimestamps {
        val expiresAt = parseInstant(hash["expiresAt"]) ?: Instant.now().plus(ttl)
        val createdAt = parseInstant(hash["createdAt"]) ?: expiresAt.minus(ttl)
        return JobTimestamps(expiresAt, createdAt, parseInstant(hash["lastUpdatedAt"]) ?: createdAt)
    }

    private fun parseInstant(value: String?): Instant? = value?.let { runCatching { Instant.parse(it) }.getOrNull() }

    private fun readModel(
        hash: Map<String, String>,
        providerField: String,
        nameField: String,
    ): ModelId = ModelId(Provider.valueOf(hash.getValue(providerField)), hash.getValue(nameField))

    private fun readError(hash: Map<String, String>): GenerationError? =
        hash["errorCode"]?.let { GenerationError(ErrorCode.valueOf(it), hash["errorMessage"].orEmpty()) }

    private fun readTokens(hash: Map<String, String>): TokenUsage =
        TokenUsage(
            hash.getValue("tokensInput").toLong(),
            hash.getValue("tokensCached").toLong(),
            hash.getValue("tokensOutput").toLong(),
        )

    private fun readEligibleFallbackModels(hash: Map<String, String>): List<ModelId> =
        hash["eligibleFallbackModels"]
            ?.let { objectMapper.readValue(it, Array<ModelId>::class.java).toList() }
            .orEmpty()

    private fun readSessionMeta(
        hash: Map<String, String>,
        includeSensitiveHashFields: Boolean,
    ): SessionMeta =
        hash["sessionMeta"]
            ?.takeIf { includeSensitiveHashFields }
            ?.let { objectMapper.readValue(it, SessionMeta::class.java) }
            ?: SessionMeta(
                UUID.fromString(hash.getValue("sessionId")),
                UUID.fromString(hash.getValue("clubId")),
                0,
                "",
                null,
                LocalDate.MIN,
                emptyList(),
                AuthorNameMode.valueOf(hash.getValue("authorNameMode")),
            )

    private fun readActualModel(hash: Map<String, String>): ModelId? =
        hash["actualModelName"]?.let { readModel(hash, "actualModelProvider", "actualModelName") }

    private data class JobTimestamps(
        val expiresAt: Instant,
        val createdAt: Instant,
        val lastUpdatedAt: Instant,
    )

    private companion object {
        const val MAX_ERROR_MESSAGE_LENGTH = 512
    }
}
