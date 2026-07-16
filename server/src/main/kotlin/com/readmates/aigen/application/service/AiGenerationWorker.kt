package com.readmates.aigen.application.service

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationInput
import com.readmates.aigen.application.model.GenerationOutput
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AiGenerationLatencyNotification
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.SessionContentGenerator
import com.readmates.aigen.config.AiGenerationProperties
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID

/**
 * Async worker that consumes a queued AI generation job (spec §7.1 + §9.2).
 *
 * In Phase 2 this is invoked by a Kafka consumer per `jobId`. Phase 1 only
 * exposes the [process] entry point — tests drive it directly with fakes.
 *
 * Retry policy (per §9.2):
 *  - PROVIDER_UNAVAILABLE: sleep 1s, retry once.
 *  - PROVIDER_RATE_LIMITED: sleep 5s, retry once.
 *  - SCHEMA_INVALID / AUTHOR_NAME_MISMATCH / HIGHLIGHTS_OUT_OF_RANGE /
 *    ONE_LINE_REVIEWS_DUPLICATE / FEEDBACK_TEMPLATE_INVALID: retry once with
 *    strengthened instructions.
 *  - Other codes: no retry.
 *
 * Per-job hard cap is 3 LLM calls (start + 1 retry from generator + 1 from
 * validator). The worker enforces this implicitly via single-step retries.
 *
 * Latency: when wall-clock elapsed time exceeds
 * `readmates.aigen.job.notification-latency-threshold` (default 60s), the
 * worker invokes [AiGenerationLatencyNotification.notifyLongGeneration] so the
 * Phase 6 notification adapter can ping the host with an in-app message.
 */
private const val PROGRESS_PROVIDER_RUNNING_PCT = 5
internal const val PROVIDER_RATE_LIMIT_BACKOFF_SECONDS = 5L
private const val PROGRESS_COMPLETE_PCT = 100

@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@Suppress("LongParameterList", "TooManyFunctions")
class AiGenerationWorker(
    private val jobStore: AiGenerationJobStore,
    private val generators: Map<Provider, SessionContentGenerator>,
    private val modelCatalog: ModelCatalog,
    private val validator: SessionImportV1Validator,
    private val auditPort: AiGenerationAuditPort,
    private val costGuard: GenerationCostGuard,
    private val latencyNotification: AiGenerationLatencyNotification,
    private val properties: AiGenerationProperties,
    private val clock: Clock,
    private val metrics: AiGenerationMetrics,
    private val sleeper: Sleeper = Sleeper.Default,
    private val fallbackChain: ProviderFallbackChain,
    private val groundedExecutor: GroundedGenerationExecutor = GroundedGenerationExecutor.Disabled,
) {
    private val logger = LoggerFactory.getLogger(AiGenerationWorker::class.java)

    @Suppress("ReturnCount")
    fun process(jobId: UUID) {
        val record = jobStore.load(jobId) ?: return // expired / already cleaned
        val start = clock.instant()
        val initialStage =
            if (record.pipelineMode == AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT) {
                JobStage.PREPARING_TRANSCRIPT
            } else {
                JobStage.TRANSCRIPT_LOADED
            }
        if (!jobStore.transitionStatus(
                jobId = record.jobId,
                expected = setOf(JobStatus.PENDING),
                next = JobStatus.RUNNING,
                stage = initialStage,
                progressPct = PROGRESS_PROVIDER_RUNNING_PCT,
                error = null,
            )
        ) {
            return
        }
        val runningRecord =
            record.copy(
                status = JobStatus.RUNNING,
                stage = initialStage,
                progressPct = PROGRESS_PROVIDER_RUNNING_PCT,
            )
        if (runningRecord.pipelineMode == AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT) {
            groundedExecutor.process(runningRecord, start)
            return
        }
        val generator = resolveGenerator(runningRecord, start) ?: return
        when (val outcome = runGenerationWithValidationRetry(runningRecord, generator)) {
            is Outcome.Success -> succeed(runningRecord, outcome.snapshot, outcome.usage, outcome.actualModel, start)
            is Outcome.Failure ->
                failJob(runningRecord, outcome.error.code, outcome.error.message, outcome.failedModel, start)
        }
    }

    private fun resolveGenerator(
        record: JobRecord,
        start: Instant,
    ): SessionContentGenerator? {
        val resolved: SessionContentGenerator? =
            when {
                !modelCatalog.isEnabled(record.model) -> {
                    failJob(
                        record,
                        ErrorCode.AI_DISABLED,
                        "Model ${record.model.name} no longer enabled",
                        record.model,
                        start,
                    )
                    null
                }
                else -> {
                    val candidate = generators[record.model.provider]
                    if (candidate == null) {
                        failJob(
                            record,
                            ErrorCode.AI_DISABLED,
                            "No generator for provider ${record.model.provider}",
                            record.model,
                            start,
                        )
                    }
                    candidate
                }
            }
        return resolved
    }

    private data class GenerationAttempt(
        val output: GenerationOutput,
        val actualModel: ModelId,
        val generator: SessionContentGenerator,
    )

    private sealed class AttemptResult {
        data class Ok(
            val attempt: GenerationAttempt,
        ) : AttemptResult()

        data class Fail(
            val error: GenerationError,
            val failedModel: ModelId,
        ) : AttemptResult()
    }

    private sealed class Outcome {
        data class Success(
            val snapshot: SessionImportV1Snapshot,
            val usage: TokenUsage,
            val actualModel: ModelId,
        ) : Outcome()

        data class Failure(
            val error: GenerationError,
            val failedModel: ModelId,
        ) : Outcome()
    }

    private fun runGenerationWithValidationRetry(
        record: JobRecord,
        generator: SessionContentGenerator,
    ): Outcome {
        val baseInput =
            GenerationInput(
                transcript = record.transcript,
                sessionMeta = record.toSessionMeta(),
                model = record.model,
                instructions = record.instructions,
            )
        val attempt =
            when (val first = callGeneratorWithRetry(record, generator, baseInput)) {
                is AttemptResult.Fail -> return Outcome.Failure(first.error, first.failedModel)
                is AttemptResult.Ok -> first.attempt
            }
        return when (val validation = validator.validate(attempt.output.result, baseInput.sessionMeta)) {
            is ValidationResult.Ok -> Outcome.Success(attempt.output.result, attempt.output.usage, attempt.actualModel)
            is ValidationResult.Violation -> retryAfterValidationFailure(record, attempt, baseInput, validation)
        }
    }

    private fun retryAfterValidationFailure(
        record: JobRecord,
        attempt: GenerationAttempt,
        baseInput: GenerationInput,
        violation: ValidationResult.Violation,
    ): Outcome {
        // Audit the validator-driven retry attempt with the original violation
        // code so the audit trail reflects each LLM call (spec §9.2). Stays on the
        // model that actually produced the result (failover target if one was used).
        auditRetryAttempt(record, attempt.actualModel, GenerationError(violation.code, violation.message))
        val strengthenedInput =
            baseInput.copy(
                model = attempt.actualModel,
                instructions = strengthenInstructions(baseInput.instructions, violation.code),
            )
        val retry =
            when (val callResult = callGeneratorRaw(record, attempt.generator, strengthenedInput)) {
                is CallResult.Success -> callResult.output
                is CallResult.Failure -> return Outcome.Failure(callResult.error, attempt.actualModel)
            }
        return when (val validation = validator.validate(retry.result, baseInput.sessionMeta)) {
            is ValidationResult.Ok -> Outcome.Success(retry.result, retry.usage, attempt.actualModel)
            is ValidationResult.Violation ->
                Outcome.Failure(
                    GenerationError(validation.code, validation.message),
                    attempt.actualModel,
                )
        }
    }

    private sealed class CallResult {
        data class Success(
            val output: GenerationOutput,
        ) : CallResult()

        data class Failure(
            val error: GenerationError,
        ) : CallResult()
    }

    /**
     * Invoke the generator after incrementing the per-job LLM call counter. If the
     * increment crosses [AiGenerationProperties.Job.maxLlmCallsPerJob], we short-circuit
     * with [ErrorCode.MAX_CALLS_EXCEEDED] WITHOUT calling the provider, per spec §9.2
     * ("총 LLM 호출 ≤ 3회/job").
     */
    private fun callGeneratorRaw(
        record: JobRecord,
        generator: SessionContentGenerator,
        input: GenerationInput,
    ): CallResult {
        if (!costGuard.renewAdmission(record.hostUserId, record.clubId, record.jobId)) {
            return CallResult.Failure(
                GenerationError(
                    ErrorCode.RATE_LIMITED,
                    "Provider admission expired before call",
                ),
            )
        }
        val cap = properties.job.maxLlmCallsPerJob
        val next = jobStore.incrementLlmCallCount(record.jobId)
        val callResult =
            if (next > cap) {
                CallResult.Failure(
                    GenerationError(
                        ErrorCode.MAX_CALLS_EXCEEDED,
                        "Per-job LLM call cap exceeded ($next > $cap)",
                    ),
                )
            } else {
                try {
                    CallResult.Success(generator.generateFull(input))
                } catch (failure: LlmGenerationException) {
                    CallResult.Failure(failure.error)
                }
            }
        return callResult
    }

    @Suppress("ReturnCount")
    private fun callGeneratorWithRetry(
        record: JobRecord,
        primaryGenerator: SessionContentGenerator,
        baseInput: GenerationInput,
    ): AttemptResult {
        val first = callGeneratorRaw(record, primaryGenerator, baseInput)
        if (first is CallResult.Success) {
            return AttemptResult.Ok(GenerationAttempt(first.output, record.model, primaryGenerator))
        }
        val firstFailure = (first as CallResult.Failure).error
        val strategy =
            retryStrategyFor(firstFailure.code)
                ?: return AttemptResult.Fail(firstFailure, record.model)
        // Per spec §9.2 ("각 호출은 audit log row 별도"): emit a FAILED audit row
        // for the first attempt before we retry, so the audit trail records both
        // the original failure code AND the retry. The first attempt ran on
        // record.model, so attribute the failure there.
        auditRetryAttempt(record, record.model, firstFailure)
        sleeper.sleep(strategy.backoff)

        // Availability failures (PROVIDER_UNAVAILABLE / PROVIDER_RATE_LIMITED)
        // redirect the single retry to the next provider in the configured chain
        // (failover depth 1, call budget unchanged). Empty chain / no candidate
        // falls through to the same-provider retry below.
        val failover =
            if (isAvailabilityFailure(firstFailure.code)) fallbackChain.nextAfter(record.model) else null
        if (failover != null) {
            val failoverGenerator = generators.getValue(failover.provider)
            return when (val retry = callGeneratorRaw(record, failoverGenerator, baseInput.copy(model = failover))) {
                is CallResult.Success -> AttemptResult.Ok(GenerationAttempt(retry.output, failover, failoverGenerator))
                is CallResult.Failure -> AttemptResult.Fail(retry.error, failover)
            }
        }

        // Per §9.2: SCHEMA_INVALID / AUTHOR_NAME_MISMATCH /
        // HIGHLIGHTS_OUT_OF_RANGE / ONE_LINE_REVIEWS_DUPLICATE /
        // FEEDBACK_TEMPLATE_INVALID get a single retry with the prompt
        // augmented to "strictly adhere to the schema and constraints".
        // Provider-side retries with no failover candidate re-send unchanged.
        val retryInput =
            if (strategy.strengthen) {
                baseInput.copy(instructions = strengthenInstructions(baseInput.instructions, firstFailure.code))
            } else {
                baseInput
            }
        return when (val retry = callGeneratorRaw(record, primaryGenerator, retryInput)) {
            is CallResult.Success -> AttemptResult.Ok(GenerationAttempt(retry.output, record.model, primaryGenerator))
            is CallResult.Failure -> AttemptResult.Fail(retry.error, record.model)
        }
    }

    private fun isAvailabilityFailure(code: ErrorCode): Boolean =
        code == ErrorCode.PROVIDER_UNAVAILABLE || code == ErrorCode.PROVIDER_RATE_LIMITED

    private data class RetryStrategy(
        val backoff: Duration,
        val strengthen: Boolean,
    )

    private fun retryStrategyFor(code: ErrorCode): RetryStrategy? =
        when (code) {
            ErrorCode.PROVIDER_UNAVAILABLE -> RetryStrategy(Duration.ofSeconds(1), strengthen = false)
            ErrorCode.PROVIDER_RATE_LIMITED ->
                RetryStrategy(Duration.ofSeconds(PROVIDER_RATE_LIMIT_BACKOFF_SECONDS), strengthen = false)
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

    /**
     * Emit a FAILED audit row for a retry attempt with the [previousError] code.
     * Per spec §9.2 ("각 호출은 audit log row 별도") each LLM call deserves its
     * own audit entry — without this, a successful retry would erase the fact
     * that the first attempt failed.
     */
    private fun auditRetryAttempt(
        record: JobRecord,
        model: ModelId,
        previousError: GenerationError,
    ) {
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = model.provider,
                model = model.name,
                transcriptSha256 = null,
                usage = TokenUsage.ZERO,
                costEstimateUsd = BigDecimal.ZERO,
                status = AuditStatus.FAILED,
                errorCode = previousError.code,
                errorMessage = "Retry triggered: ${previousError.message}",
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
    }

    private fun succeed(
        record: JobRecord,
        snapshot: SessionImportV1Snapshot,
        usage: TokenUsage,
        actualModel: ModelId,
        start: Instant,
    ) {
        val cost = CostCalculator.actual(usage, modelCatalog.pricing(actualModel))
        // Cost was incurred by the provider call regardless of cancel race.
        // Record BEFORE the CAS so cancel-during-running does not silently
        // drop club/host monthly accounting (spec §"비용 회계 정책").
        // recordUsage failures must not fail the job — log and swallow.
        try {
            costGuard.recordUsage(record.hostUserId, record.clubId, record.jobId, cost)
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: RuntimeException,
        ) {
            logger.warn(
                "costGuard.recordUsage failed for jobId={}; status flip will proceed",
                record.jobId,
                failure,
            )
        }
        val saved =
            jobStore.saveResultIfStatus(
                record.jobId,
                JobStatus.RUNNING,
                snapshot,
                usage,
                cost,
                actualModel.takeIf { it != record.model },
            )
        if (!saved) {
            return // cancel/commit/another worker won the race
        }
        if (!jobStore.transitionStatus(
                jobId = record.jobId,
                expected = setOf(JobStatus.RUNNING),
                next = JobStatus.SUCCEEDED,
                stage = JobStage.READY,
                progressPct = PROGRESS_COMPLETE_PCT,
                error = null,
            )
        ) {
            return // cancel won the race
        }
        emitJobMetrics(JobStatus.SUCCEEDED, usage, cost, start, actualModel)
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = actualModel.provider,
                model = actualModel.name,
                transcriptSha256 = null,
                usage = usage,
                costEstimateUsd = cost,
                status = AuditStatus.SUCCESS,
                errorCode = null,
                errorMessage = null,
                latencyMs = elapsedMillis(start),
                createdAt = clock.instant(),
            ),
        )
        maybeNotifyLong(record, start)
    }

    private fun failJob(
        record: JobRecord,
        code: ErrorCode,
        message: String,
        failedModel: ModelId,
        start: Instant,
    ) {
        val transitioned =
            jobStore.transitionStatus(
                jobId = record.jobId,
                expected = setOf(JobStatus.PENDING, JobStatus.RUNNING),
                next = JobStatus.FAILED,
                stage = null,
                progressPct = 0,
                error = GenerationError(code, message),
            )
        if (!transitioned) {
            return
        }
        // Validation-failure counter is emitted at the validator (single source of truth).
        // Attribute the failed job to the model that actually produced the final
        // failure (the failover target when one was used), per spec accounting.
        emitJobMetrics(JobStatus.FAILED, TokenUsage.ZERO, BigDecimal.ZERO, start, failedModel)
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = failedModel.provider,
                model = failedModel.name,
                transcriptSha256 = null,
                usage = TokenUsage.ZERO,
                costEstimateUsd = BigDecimal.ZERO,
                status = AuditStatus.FAILED,
                errorCode = code,
                errorMessage = message,
                latencyMs = elapsedMillis(start),
                createdAt = clock.instant(),
            ),
        )
        maybeNotifyLong(record, start)
    }

    private fun maybeNotifyLong(
        record: JobRecord,
        start: Instant,
    ) {
        val elapsed = Duration.between(start, clock.instant())
        if (elapsed > properties.job.notificationLatencyThreshold) {
            latencyNotification.notifyLongGeneration(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
            )
        }
    }

    private fun elapsedMillis(start: Instant): Int =
        Duration
            .between(start, clock.instant())
            .toMillis()
            .coerceAtMost(Int.MAX_VALUE.toLong())
            .toInt()

    private fun emitJobMetrics(
        status: JobStatus,
        usage: TokenUsage,
        cost: BigDecimal,
        start: Instant,
        model: ModelId,
    ) {
        val elapsed = Duration.between(start, clock.instant())
        metrics.recordJobCompleted(status, model.provider, model, JobKind.FULL)
        metrics.recordLatency(model.provider, model, JobKind.FULL, elapsed)
        if (usage.nonCachedInputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.INPUT, usage.nonCachedInputTokens)
        }
        if (usage.cacheWriteInputTokens > 0) {
            metrics.recordTokens(
                model.provider,
                model,
                TokenDirection.CACHE_WRITE_INPUT,
                usage.cacheWriteInputTokens,
            )
        }
        if (usage.cacheReadInputTokens > 0) {
            metrics.recordTokens(
                model.provider,
                model,
                TokenDirection.CACHE_READ_INPUT,
                usage.cacheReadInputTokens,
            )
        }
        if (usage.outputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.OUTPUT, usage.outputTokens)
        }
        if (cost > BigDecimal.ZERO) {
            metrics.recordCost(model.provider, model, cost)
        }
    }
}
