package com.readmates.aigen.application.service

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStatus
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
import com.readmates.aigen.application.port.out.JobKind
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
@Suppress("LongParameterList", "TooManyFunctions")
class AiGenerationRegenerationService(
    private val jobStore: AiGenerationJobStore,
    private val regenerators: Map<Provider, SessionContentRegenerator>,
    private val modelCatalog: ModelCatalog,
    private val validator: SessionImportV1Validator,
    private val auditPort: AiGenerationAuditPort,
    private val costGuard: GenerationCostGuard,
    private val properties: AiGenerationProperties,
    private val clock: Clock,
    private val metrics: AiGenerationMetrics,
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
        val currentSnapshot =
            record.result
                ?: throw AiGenerationException.IllegalGenerationState(
                    jobId = jobId,
                    currentStatus = record.status.name,
                    attemptedAction = "regenerate",
                )

        val modelId = resolveModelId(model, record)

        when (val decision = costGuard.checkBeforeCall(record.hostUserId, record.clubId)) {
            is GuardDecision.Allow -> Unit
            is GuardDecision.Deny -> failRegen(record, item, modelId, decision.code, "Cost guard denied call")
        }

        val sessionMeta = record.toSessionMeta()
        val regenerator =
            regenerators[modelId.provider]
                ?: failRegen(
                    record,
                    item,
                    modelId,
                    ErrorCode.AI_DISABLED,
                    "No regenerator wired for provider ${modelId.provider}",
                )
        val output =
            callWithRetry(
                regenerator = regenerator,
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
            is ValidationResult.Violation ->
                failRegen(record, item, modelId, validation.code, validation.message)
        }
        return persistAndAuditRegenSuccess(record, item, modelId, output, patchedSnapshot, cost)
    }

    @Suppress("LongParameterList")
    private fun persistAndAuditRegenSuccess(
        record: JobRecord,
        item: GenerationItem,
        modelId: ModelId,
        output: com.readmates.aigen.application.model.RegenerationOutput,
        patchedSnapshot: SessionImportV1Snapshot,
        cost: BigDecimal,
    ): RegenerationResult {
        jobStore.patchItem(record.jobId, item, patchedSnapshot, output.usage, cost)
        costGuard.recordUsage(record.hostUserId, record.clubId, cost)
        emitRegenMetrics(modelId, item, output.usage, cost, JobStatus.SUCCEEDED)
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
        val baseInput =
            RegenerationInput(
                transcript = record.transcript,
                currentResult = currentSnapshot,
                item = item,
                sessionMeta = sessionMeta,
                model = modelId,
                instructions = recordedInstructions,
            )
        return try {
            callRegeneratorRaw(record, regenerator, baseInput)
        } catch (firstFailure: LlmGenerationException) {
            val retryStrategy = retryStrategyFor(firstFailure.error.code)
            if (retryStrategy == null) {
                failRegen(record, item, modelId, firstFailure.error.code, firstFailure.error.message)
            }
            // Per spec §9.2 ("각 호출은 audit log row 별도"): audit the failed
            // first attempt before retrying so the audit log captures the
            // retry trigger code even when the second call succeeds.
            auditRetryAttempt(record, item, modelId, firstFailure.error)
            sleeper.sleep(retryStrategy.backoff)
            // Per spec §9.2: schema/author/highlights/oneLineReview/feedback errors retry
            // with strengthened instructions; provider-availability errors retry with the
            // same prompt. Mirrors AiGenerationWorker.callGeneratorWithRetry.
            val retryInput =
                if (retryStrategy.strengthen) {
                    baseInput.copy(
                        instructions = strengthenInstructions(recordedInstructions, firstFailure.error.code),
                    )
                } else {
                    baseInput
                }
            try {
                callRegeneratorRaw(record, regenerator, retryInput)
            } catch (secondFailure: LlmGenerationException) {
                failRegen(record, item, modelId, secondFailure.error.code, secondFailure.error.message)
            }
        }
    }

    /**
     * Invoke the regenerator after incrementing the per-job LLM call counter. If the
     * increment crosses [AiGenerationProperties.Job.maxLlmCallsPerJob], we throw
     * [LlmGenerationException] with [ErrorCode.MAX_CALLS_EXCEEDED] WITHOUT calling
     * the provider, per spec §9.2.
     */
    private fun callRegeneratorRaw(
        record: JobRecord,
        regenerator: SessionContentRegenerator,
        input: RegenerationInput,
    ): com.readmates.aigen.application.model.RegenerationOutput {
        val cap = properties.job.maxLlmCallsPerJob
        val next = jobStore.incrementLlmCallCount(record.jobId)
        if (next > cap) {
            throw LlmGenerationException(
                com.readmates.aigen.application.model.GenerationError(
                    ErrorCode.MAX_CALLS_EXCEEDED,
                    "Per-job LLM call cap exceeded ($next > $cap)",
                ),
            )
        }
        return regenerator.regenerateItem(input)
    }

    private data class RetryStrategy(
        val backoff: Duration,
        val strengthen: Boolean,
    )

    private fun retryStrategyFor(code: ErrorCode): RetryStrategy? =
        when (code) {
            ErrorCode.PROVIDER_UNAVAILABLE -> RetryStrategy(Duration.ofSeconds(1), strengthen = false)
            ErrorCode.PROVIDER_RATE_LIMITED -> RetryStrategy(Duration.ofSeconds(5), strengthen = false)
            ErrorCode.SCHEMA_INVALID,
            ErrorCode.AUTHOR_NAME_MISMATCH,
            ErrorCode.HIGHLIGHTS_OUT_OF_RANGE,
            ErrorCode.ONE_LINE_REVIEWS_DUPLICATE,
            ErrorCode.FEEDBACK_TEMPLATE_INVALID,
            -> RetryStrategy(Duration.ZERO, strengthen = true)
            else -> null
        }

    private fun strengthenInstructions(
        base: String?,
        code: ErrorCode,
    ): String {
        val prefix = "Strict: $code"
        return if (base.isNullOrBlank()) prefix else "$prefix\n$base"
    }

    @Suppress("UNCHECKED_CAST")
    private fun patchSnapshot(
        snapshot: SessionImportV1Snapshot,
        item: GenerationItem,
        value: Any,
    ): SessionImportV1Snapshot =
        when (item) {
            GenerationItem.SUMMARY -> snapshot.copy(summary = value as String)
            GenerationItem.HIGHLIGHTS ->
                snapshot.copy(
                    highlights = value as List<SessionImportV1Snapshot.AuthoredText>,
                )
            GenerationItem.ONE_LINE_REVIEWS ->
                snapshot.copy(
                    oneLineReviews = value as List<SessionImportV1Snapshot.AuthoredText>,
                )
            GenerationItem.FEEDBACK_DOCUMENT ->
                snapshot.copy(
                    feedbackDocumentMarkdown = value as String,
                )
        }

    private fun resolveModelId(
        commandModel: String?,
        record: JobRecord,
    ): ModelId {
        val candidate = commandModel ?: record.model.name
        return modelCatalog.resolveAlias(candidate) ?: record.model
    }

    private fun computeWarnings(clubId: UUID): List<String> {
        val monthly = costGuard.clubMonthlyCost(clubId)
        val threshold = properties.caps.clubMonthlyCostUsd.multiply(properties.caps.softWarningRatio)
        return if (monthly >= threshold) listOf("CLUB_BUDGET_80PCT") else emptyList()
    }

    private fun emitRegenMetrics(
        modelId: ModelId,
        item: GenerationItem,
        usage: TokenUsage,
        cost: BigDecimal,
        status: JobStatus,
    ) {
        val kind = regenKindFor(item)
        metrics.recordJobCompleted(status, modelId.provider, modelId, kind)
        if (usage.inputTokens > 0) {
            metrics.recordTokens(modelId.provider, modelId, TokenDirection.INPUT, usage.inputTokens)
        }
        if (usage.cachedInputTokens > 0) {
            metrics.recordTokens(modelId.provider, modelId, TokenDirection.CACHED_INPUT, usage.cachedInputTokens)
        }
        if (usage.outputTokens > 0) {
            metrics.recordTokens(modelId.provider, modelId, TokenDirection.OUTPUT, usage.outputTokens)
        }
        if (cost > BigDecimal.ZERO) {
            metrics.recordCost(modelId.provider, modelId, cost)
        }
    }

    private fun regenKindFor(item: GenerationItem): JobKind =
        when (item) {
            GenerationItem.SUMMARY -> JobKind.REGENERATE_SUMMARY
            GenerationItem.HIGHLIGHTS -> JobKind.REGENERATE_HIGHLIGHTS
            GenerationItem.ONE_LINE_REVIEWS -> JobKind.REGENERATE_ONE_LINE_REVIEWS
            GenerationItem.FEEDBACK_DOCUMENT -> JobKind.REGENERATE_FEEDBACK_DOCUMENT
        }

    /**
     * Emit a FAILED audit row for a retry attempt with the [previousError] code
     * (spec §9.2 — each LLM call gets its own audit row, so a successful retry
     * still leaves the original failure visible in the trail).
     */
    private fun auditRetryAttempt(
        record: JobRecord,
        item: GenerationItem,
        modelId: ModelId,
        previousError: com.readmates.aigen.application.model.GenerationError,
    ) {
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
                errorCode = previousError.code,
                errorMessage = "Retry triggered: ${previousError.message}",
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
    }

    private fun failRegen(
        record: JobRecord,
        item: GenerationItem,
        modelId: ModelId,
        code: ErrorCode,
        message: String,
    ): Nothing {
        // Validation-failure counter is emitted at the validator (single source of truth).
        metrics.recordJobCompleted(JobStatus.FAILED, modelId.provider, modelId, regenKindFor(item))
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
            -> throw AiGenerationException.Coded(code, message)
            else -> throw LlmGenerationException(
                com.readmates.aigen.application.model.GenerationError(code, message),
            )
        }
        // MAX_CALLS_EXCEEDED takes the LlmGenerationException branch so the
        // RFC 7807 mapping surfaces a 429 with the typed error code, not a 500.
    }
}
