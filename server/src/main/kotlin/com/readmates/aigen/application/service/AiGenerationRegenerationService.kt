package com.readmates.aigen.application.service

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.RegenerationInput
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.aigen.application.port.`in`.RegenerateItemUseCase
import com.readmates.aigen.application.port.`in`.RegenerationResult
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.SessionContentRegenerator
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.time.Clock
import java.time.Duration
import java.util.UUID

/**
 * Implements the synchronous partial regeneration use case (spec §7.3).
 *
 * Steps per call:
 *  1. Load and verify the JobRecord.
 *  2. Resolve the model (override → existing record.model.name → fallback).
 *  3. Cost-guard pre-check; deny → audit FAILED and throw.
 *  4. Build [RegenerationInput] from record + override params.
 *  5. Invoke the provider regenerator with a single retry per the §9.2 policy:
 *     - PROVIDER_UNAVAILABLE → 1s sleep, retry once.
 *     - PROVIDER_RATE_LIMITED → 5s sleep, retry once.
 *     - Schema/Author/Highlights/OneLineReview/Feedback violations → retry once
 *       with strengthened instructions.
 *     - Other codes → no retry.
 *  6. Apply the patch to Redis (via [AiGenerationJobStore.patchItem]).
 *  7. Record cost usage and write a SUCCESS audit row.
 *
 * Aggregate cap (≤3 LLM calls per job) is enforced per-step here. Cross-step
 * accounting is delegated to the JobRecord's accumulated token/cost field;
 * a future iteration may add a hard global counter.
 */
@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@Suppress("LongParameterList")
class AiGenerationRegenerationService(
    private val jobStore: AiGenerationJobStore,
    private val regenerators: Map<Provider, SessionContentRegenerator>,
    private val modelCatalog: ModelCatalog,
    private val validator: SessionImportV1Validator,
    private val auditPort: AiGenerationAuditPort,
    private val costGuard: GenerationCostGuard,
    private val properties: AiGenerationProperties,
    private val clock: Clock,
    private val sleeper: Sleeper = Sleeper.Default,
) : RegenerateItemUseCase {

    override fun regenerate(
        sessionId: UUID,
        jobId: UUID,
        item: GenerationItem,
        model: String?,
        instructions: String?,
    ): RegenerationResult {
        val record = jobStore.load(jobId) ?: throw JobNotFoundException(jobId)
        if (record.sessionId != sessionId) {
            throw JobSessionMismatchException(jobId, sessionId, record.sessionId)
        }
        val currentSnapshot = record.result
            ?: throw IllegalStateException("Cannot regenerate before initial generation produced a result")

        val modelId = resolveModelId(model, record)

        when (val decision = costGuard.checkBeforeCall(record.hostUserId, record.clubId)) {
            is GuardDecision.Allow -> Unit
            is GuardDecision.Deny -> failRegen(record, item, modelId, decision.code, "Cost guard denied call")
        }

        val sessionMeta = buildSessionMeta(record)
        val output = callWithRetry(
            regenerator = regenerators[modelId.provider]
                ?: error("No regenerator wired for provider ${modelId.provider}"),
            recordedInstructions = instructions ?: record.instructions,
            currentSnapshot = currentSnapshot,
            sessionMeta = sessionMeta,
            modelId = modelId,
            record = record,
            item = item,
        )

        val cost = CostCalculator.estimate(output.usage, modelCatalog.pricing(modelId))
        // Build the patched snapshot and validate it BEFORE persisting so a bad LLM
        // response can't poison the Redis result — see spec §9.3 and the task_1_7
        // commit-override warning that flagged the same trust boundary on the commit
        // path. On failure we audit FAILED, do NOT patch, and throw.
        val patchedSnapshot = patchSnapshot(currentSnapshot, item, output.patchedValue)
        when (val validation = validator.validate(patchedSnapshot, sessionMeta)) {
            is ValidationResult.Ok -> Unit
            is ValidationResult.Violation -> failRegen(
                record, item, modelId, validation.code, validation.message,
            )
        }
        jobStore.patchItem(jobId, item, patchedSnapshot, output.usage, cost)
        costGuard.recordUsage(record.hostUserId, record.clubId, cost)

        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.REGENERATE,
                item = item,
                provider = modelId.provider,
                model = modelId.name,
                transcriptSha256 = null,
                usage = output.usage,
                costEstimateUsd = cost,
                status = AuditStatus.SUCCESS,
                errorCode = null,
                errorMessage = null,
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )

        val warnings = computeWarnings(record.clubId)
        return RegenerationResult(item, output.patchedValue, output.usage, cost, warnings)
    }

    @Suppress("LongParameterList", "ThrowsCount")
    private fun callWithRetry(
        regenerator: SessionContentRegenerator,
        recordedInstructions: String?,
        currentSnapshot: SessionImportV1Snapshot,
        sessionMeta: SessionMeta,
        modelId: ModelId,
        record: JobRecord,
        item: GenerationItem,
    ): com.readmates.aigen.application.model.RegenerationOutput {
        val baseInput = RegenerationInput(
            transcript = record.transcript,
            currentResult = currentSnapshot,
            item = item,
            sessionMeta = sessionMeta,
            model = modelId,
            instructions = recordedInstructions,
        )
        return try {
            regenerator.regenerateItem(baseInput)
        } catch (firstFailure: LlmGenerationException) {
            val retryStrategy = retryStrategyFor(firstFailure.error.code)
            if (retryStrategy == null) {
                failRegen(record, item, modelId, firstFailure.error.code, firstFailure.error.message)
            }
            sleeper.sleep(retryStrategy.backoff)
            val retryInput = baseInput.copy(
                instructions = strengthenInstructions(recordedInstructions, firstFailure.error.code),
            )
            try {
                regenerator.regenerateItem(retryInput)
            } catch (secondFailure: LlmGenerationException) {
                failRegen(record, item, modelId, secondFailure.error.code, secondFailure.error.message)
            }
        }
    }

    private data class RetryStrategy(val backoff: Duration)

    private fun retryStrategyFor(code: ErrorCode): RetryStrategy? = when (code) {
        ErrorCode.PROVIDER_UNAVAILABLE -> RetryStrategy(Duration.ofSeconds(1))
        ErrorCode.PROVIDER_RATE_LIMITED -> RetryStrategy(Duration.ofSeconds(5))
        ErrorCode.SCHEMA_INVALID,
        ErrorCode.AUTHOR_NAME_MISMATCH,
        ErrorCode.HIGHLIGHTS_OUT_OF_RANGE,
        ErrorCode.ONE_LINE_REVIEWS_DUPLICATE,
        ErrorCode.FEEDBACK_TEMPLATE_INVALID,
        -> RetryStrategy(Duration.ZERO)
        else -> null
    }

    private fun strengthenInstructions(base: String?, code: ErrorCode): String {
        val prefix = "Strict: $code"
        return if (base.isNullOrBlank()) prefix else "$prefix\n$base"
    }

    @Suppress("UNCHECKED_CAST")
    private fun patchSnapshot(
        snapshot: SessionImportV1Snapshot,
        item: GenerationItem,
        value: Any,
    ): SessionImportV1Snapshot = when (item) {
        GenerationItem.SUMMARY -> snapshot.copy(summary = value as String)
        GenerationItem.HIGHLIGHTS -> snapshot.copy(
            highlights = value as List<SessionImportV1Snapshot.AuthoredText>,
        )
        GenerationItem.ONE_LINE_REVIEWS -> snapshot.copy(
            oneLineReviews = value as List<SessionImportV1Snapshot.AuthoredText>,
        )
        GenerationItem.FEEDBACK_DOCUMENT -> snapshot.copy(
            feedbackDocumentMarkdown = value as String,
        )
    }

    private fun resolveModelId(commandModel: String?, record: JobRecord): ModelId {
        val candidate = commandModel ?: record.model.name
        return modelCatalog.resolveAlias(candidate) ?: record.model
    }

    private fun buildSessionMeta(record: JobRecord): SessionMeta =
        // Prefer the stored SessionMeta (authoritative for validation); fall back to
        // derivation from the snapshot for any legacy job records that predate the
        // sessionMeta field. The validator uses sessionNumber/bookTitle/meetingDate
        // and expectedAuthorNames from this meta.
        record.sessionMeta.copy(authorNameMode = record.authorNameMode)

    private fun computeWarnings(clubId: UUID): List<String> {
        val monthly = costGuard.clubMonthlyCost(clubId)
        val threshold = properties.caps.clubMonthlyCostUsd.multiply(properties.caps.softWarningRatio)
        return if (monthly >= threshold) listOf("CLUB_BUDGET_80PCT") else emptyList()
    }

    private fun failRegen(
        record: JobRecord,
        item: GenerationItem,
        modelId: ModelId,
        code: ErrorCode,
        message: String,
    ): Nothing {
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.REGENERATE,
                item = item,
                provider = modelId.provider,
                model = modelId.name,
                transcriptSha256 = null,
                usage = TokenUsage(0, 0, 0),
                costEstimateUsd = BigDecimal.ZERO,
                status = AuditStatus.FAILED,
                errorCode = code,
                errorMessage = message,
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
        when (code) {
            ErrorCode.HOST_DAILY_CAP_EXCEEDED,
            ErrorCode.CLUB_MONTHLY_CAP_EXCEEDED,
            ErrorCode.RATE_LIMITED,
            ErrorCode.AI_DISABLED,
            ErrorCode.JOB_EXPIRED,
            ErrorCode.QUEUE_UNAVAILABLE,
            -> throw IllegalStateException("$code: $message")
            else -> throw LlmGenerationException(
                com.readmates.aigen.application.model.GenerationError(code, message),
            )
        }
    }
}
