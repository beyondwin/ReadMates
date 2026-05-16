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
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AiGenerationLatencyNotification
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.SessionContentGenerator
import com.readmates.aigen.config.AiGenerationProperties
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
    private val sleeper: Sleeper = Sleeper.Default,
) {

    fun process(jobId: UUID) {
        val record = jobStore.load(jobId) ?: return // expired / already cleaned
        val start = clock.instant()

        if (!modelCatalog.isEnabled(record.model)) {
            failJob(record, ErrorCode.AI_DISABLED, "Model ${record.model.name} no longer enabled", start)
            return
        }

        jobStore.updateStatus(jobId, JobStatus.RUNNING, JobStage.TRANSCRIPT_LOADED, 5, null)

        val generator = generators[record.model.provider]
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
        data class Success(val snapshot: SessionImportV1Snapshot, val usage: TokenUsage) : Outcome()
        data class Failure(val error: GenerationError) : Outcome()
    }

    private fun runGenerationWithValidationRetry(
        record: JobRecord,
        generator: SessionContentGenerator,
    ): Outcome {
        val baseInput = GenerationInput(
            transcript = record.transcript,
            sessionMeta = buildSessionMeta(record),
            model = record.model,
            instructions = record.instructions,
        )
        // First generator attempt with provider-error retry.
        val firstAttempt = callGeneratorWithRetry(generator, baseInput) ?: return Outcome.Failure(
            GenerationError(ErrorCode.UNKNOWN, "Generator failed with no error"),
        )
        if (firstAttempt is CallResult.Failure) {
            return Outcome.Failure(firstAttempt.error)
        }
        val successOutput = (firstAttempt as CallResult.Success).output
        return when (val validation = validator.validate(successOutput.result, baseInput.sessionMeta)) {
            is ValidationResult.Ok -> Outcome.Success(successOutput.result, successOutput.usage)
            is ValidationResult.Violation -> retryAfterValidationFailure(
                generator = generator,
                baseInput = baseInput,
                violation = validation,
            )
        }
    }

    private fun retryAfterValidationFailure(
        generator: SessionContentGenerator,
        baseInput: GenerationInput,
        violation: ValidationResult.Violation,
    ): Outcome {
        val strengthenedInput = baseInput.copy(
            instructions = strengthenInstructions(baseInput.instructions, violation.code),
        )
        val retry = try {
            generator.generateFull(strengthenedInput)
        } catch (failure: LlmGenerationException) {
            return Outcome.Failure(failure.error)
        }
        return when (val validation = validator.validate(retry.result, baseInput.sessionMeta)) {
            is ValidationResult.Ok -> Outcome.Success(retry.result, retry.usage)
            is ValidationResult.Violation -> Outcome.Failure(
                GenerationError(validation.code, validation.message),
            )
        }
    }

    private sealed class CallResult {
        data class Success(val output: GenerationOutput) : CallResult()
        data class Failure(val error: GenerationError) : CallResult()
    }

    private fun callGeneratorWithRetry(
        generator: SessionContentGenerator,
        baseInput: GenerationInput,
    ): CallResult {
        return try {
            CallResult.Success(generator.generateFull(baseInput))
        } catch (firstFailure: LlmGenerationException) {
            val backoff = backoffFor(firstFailure.error.code)
                ?: return CallResult.Failure(firstFailure.error)
            sleeper.sleep(backoff)
            try {
                CallResult.Success(generator.generateFull(baseInput))
            } catch (secondFailure: LlmGenerationException) {
                CallResult.Failure(secondFailure.error)
            }
        }
    }

    private fun backoffFor(code: ErrorCode): Duration? = when (code) {
        ErrorCode.PROVIDER_UNAVAILABLE -> Duration.ofSeconds(1)
        ErrorCode.PROVIDER_RATE_LIMITED -> Duration.ofSeconds(5)
        else -> null
    }

    private fun strengthenInstructions(base: String?, code: ErrorCode): String {
        val prefix = "Strict: $code"
        return if (base.isNullOrBlank()) prefix else "$prefix\n$base"
    }

    private fun buildSessionMeta(record: JobRecord): SessionMeta =
        record.sessionMeta.copy(authorNameMode = record.authorNameMode)

    private fun succeed(
        record: JobRecord,
        snapshot: SessionImportV1Snapshot,
        usage: TokenUsage,
        start: Instant,
    ) {
        val cost = CostCalculator.estimate(usage, modelCatalog.pricing(record.model))
        jobStore.saveResult(record.jobId, snapshot, usage, cost)
        jobStore.updateStatus(record.jobId, JobStatus.SUCCEEDED, JobStage.READY, 100, null)
        costGuard.recordUsage(record.hostUserId, record.clubId, cost)
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

    private fun maybeNotifyLong(record: JobRecord, start: Instant) {
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
        Duration.between(start, clock.instant()).toMillis().coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
}
