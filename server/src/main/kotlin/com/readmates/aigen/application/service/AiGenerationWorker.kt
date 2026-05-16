package com.readmates.aigen.application.service

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationInput
import com.readmates.aigen.application.model.GenerationOutput
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
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
@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@Suppress("LongParameterList")
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
) {
    private val logger = LoggerFactory.getLogger(AiGenerationWorker::class.java)

    fun process(jobId: UUID) {
        val record = jobStore.load(jobId) ?: return // expired / already cleaned
        val start = clock.instant()

        if (!modelCatalog.isEnabled(record.model)) {
            failJob(record, ErrorCode.AI_DISABLED, "Model ${record.model.name} no longer enabled", start)
            return
        }

        jobStore.updateStatus(jobId, JobStatus.RUNNING, JobStage.TRANSCRIPT_LOADED, 5, null)

        val generator =
            generators[record.model.provider]
                ?: run {
                    failJob(record, ErrorCode.AI_DISABLED, "No generator for provider ${record.model.provider}", start)
                    return
                }

        when (val outcome = runGenerationWithValidationRetry(record, generator)) {
            is Outcome.Success -> succeed(record, outcome.snapshot, outcome.usage, start)
            is Outcome.Failure -> failJob(record, outcome.error.code, outcome.error.message, start)
        }
    }

    private sealed class Outcome {
        data class Success(
            val snapshot: SessionImportV1Snapshot,
            val usage: TokenUsage,
        ) : Outcome()

        data class Failure(
            val error: GenerationError,
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
        // First generator attempt with provider-error retry.
        val firstAttempt = callGeneratorWithRetry(record, generator, baseInput)
        if (firstAttempt is CallResult.Failure) {
            return Outcome.Failure(firstAttempt.error)
        }
        val successOutput = (firstAttempt as CallResult.Success).output
        return when (val validation = validator.validate(successOutput.result, baseInput.sessionMeta)) {
            is ValidationResult.Ok -> Outcome.Success(successOutput.result, successOutput.usage)
            is ValidationResult.Violation ->
                retryAfterValidationFailure(
                    record = record,
                    generator = generator,
                    baseInput = baseInput,
                    violation = validation,
                )
        }
    }

    private fun retryAfterValidationFailure(
        record: JobRecord,
        generator: SessionContentGenerator,
        baseInput: GenerationInput,
        violation: ValidationResult.Violation,
    ): Outcome {
        // Audit the validator-driven retry attempt with the original violation
        // code so the audit trail reflects each LLM call (spec §9.2).
        auditRetryAttempt(record, GenerationError(violation.code, violation.message))
        val strengthenedInput =
            baseInput.copy(
                instructions = strengthenInstructions(baseInput.instructions, violation.code),
            )
        val retry =
            when (val callResult = callGeneratorRaw(record, generator, strengthenedInput)) {
                is CallResult.Success -> callResult.output
                is CallResult.Failure -> return Outcome.Failure(callResult.error)
            }
        return when (val validation = validator.validate(retry.result, baseInput.sessionMeta)) {
            is ValidationResult.Ok -> Outcome.Success(retry.result, retry.usage)
            is ValidationResult.Violation ->
                Outcome.Failure(
                    GenerationError(validation.code, validation.message),
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
        val cap = properties.job.maxLlmCallsPerJob
        val next = jobStore.incrementLlmCallCount(record.jobId)
        if (next > cap) {
            return CallResult.Failure(
                GenerationError(
                    ErrorCode.MAX_CALLS_EXCEEDED,
                    "Per-job LLM call cap exceeded ($next > $cap)",
                ),
            )
        }
        return try {
            CallResult.Success(generator.generateFull(input))
        } catch (failure: LlmGenerationException) {
            CallResult.Failure(failure.error)
        }
    }

    @Suppress("ReturnCount")
    private fun callGeneratorWithRetry(
        record: JobRecord,
        generator: SessionContentGenerator,
        baseInput: GenerationInput,
    ): CallResult {
        val first = callGeneratorRaw(record, generator, baseInput)
        if (first is CallResult.Success) return first
        val firstFailure = (first as CallResult.Failure).error
        val strategy =
            retryStrategyFor(firstFailure.code)
                ?: return CallResult.Failure(firstFailure)
        // Per spec §9.2 ("각 호출은 audit log row 별도"): emit a FAILED audit row
        // for the first attempt before we retry, so the audit trail records both
        // the original failure code AND the retry. Without this the terminal-only
        // audit erases the first-attempt failure when the retry succeeds.
        auditRetryAttempt(record, firstFailure)
        sleeper.sleep(strategy.backoff)
        // Per §9.2: SCHEMA_INVALID / AUTHOR_NAME_MISMATCH /
        // HIGHLIGHTS_OUT_OF_RANGE / ONE_LINE_REVIEWS_DUPLICATE /
        // FEEDBACK_TEMPLATE_INVALID get a single retry with the prompt
        // augmented to "strictly adhere to the schema and constraints".
        // Provider-side retries (PROVIDER_UNAVAILABLE / PROVIDER_RATE_LIMITED)
        // re-send the same prompt unchanged.
        val retryInput =
            if (strategy.strengthen) {
                baseInput.copy(instructions = strengthenInstructions(baseInput.instructions, firstFailure.code))
            } else {
                baseInput
            }
        return callGeneratorRaw(record, generator, retryInput)
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

    /**
     * Emit a FAILED audit row for a retry attempt with the [previousError] code.
     * Per spec §9.2 ("각 호출은 audit log row 별도") each LLM call deserves its
     * own audit entry — without this, a successful retry would erase the fact
     * that the first attempt failed.
     */
    private fun auditRetryAttempt(record: JobRecord, previousError: GenerationError) {
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = record.model.provider,
                model = record.model.name,
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

    private fun succeed(
        record: JobRecord,
        snapshot: SessionImportV1Snapshot,
        usage: TokenUsage,
        start: Instant,
    ) {
        val cost = CostCalculator.estimate(usage, modelCatalog.pricing(record.model))
        jobStore.saveResult(record.jobId, snapshot, usage, cost)
        // Record cost BEFORE the visible status flip so a cost-guard
        // counter outage cannot leave a SUCCEEDED job without its
        // accumulated cost recorded (task_1_7 finding #8). recordUsage
        // failures must not fail the job — log and swallow so the
        // host still sees the result.
        try {
            costGuard.recordUsage(record.hostUserId, record.clubId, cost)
        } catch (
            @Suppress("TooGenericExceptionCaught") failure: RuntimeException,
        ) {
            logger.warn(
                "costGuard.recordUsage failed for jobId={}; status flip will proceed",
                record.jobId,
                failure,
            )
        }
        jobStore.updateStatus(record.jobId, JobStatus.SUCCEEDED, JobStage.READY, 100, null)
        emitJobMetrics(record, JobStatus.SUCCEEDED, usage, cost, start)
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = record.model.provider,
                model = record.model.name,
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
        start: Instant,
    ) {
        jobStore.updateStatus(
            jobId = record.jobId,
            status = JobStatus.FAILED,
            stage = null,
            progressPct = 0,
            error = GenerationError(code, message),
        )
        // Validation-failure counter is emitted at the validator (single source of truth).
        emitJobMetrics(record, JobStatus.FAILED, TokenUsage(0, 0, 0), BigDecimal.ZERO, start)
        auditPort.insert(
            AuditLogEntry(
                jobId = record.jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = record.model.provider,
                model = record.model.name,
                transcriptSha256 = null,
                usage = TokenUsage(0, 0, 0),
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
        record: JobRecord,
        status: JobStatus,
        usage: TokenUsage,
        cost: BigDecimal,
        start: Instant,
    ) {
        val elapsed = Duration.between(start, clock.instant())
        metrics.recordJobCompleted(status, record.model.provider, record.model, JobKind.FULL)
        metrics.recordLatency(record.model.provider, record.model, JobKind.FULL, elapsed)
        if (usage.inputTokens > 0) {
            metrics.recordTokens(record.model.provider, record.model, TokenDirection.INPUT, usage.inputTokens)
        }
        if (usage.cachedInputTokens > 0) {
            metrics.recordTokens(record.model.provider, record.model, TokenDirection.CACHED_INPUT, usage.cachedInputTokens)
        }
        if (usage.outputTokens > 0) {
            metrics.recordTokens(record.model.provider, record.model, TokenDirection.OUTPUT, usage.outputTokens)
        }
        if (cost > BigDecimal.ZERO) {
            metrics.recordCost(record.model.provider, record.model, cost)
        }
    }
}
