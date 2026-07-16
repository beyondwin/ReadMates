package com.readmates.aigen.application.service

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundingFailureReason
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AiGenerationLatencyNotification
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GroundedGenerationOutput
import com.readmates.aigen.application.port.out.GroundedRenderRequest
import com.readmates.aigen.application.port.out.GroundedRequestMode
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.LlmCallReservation
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.SaveGroundedResultCommand
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import com.readmates.aigen.config.AiGenerationProperties
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.Clock
import java.time.Duration
import java.time.Instant

fun interface GroundedGenerationExecutor {
    fun process(
        record: JobRecord,
        start: Instant,
    )

    data object Disabled : GroundedGenerationExecutor {
        override fun process(
            record: JobRecord,
            start: Instant,
        ) = Unit
    }
}

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@Suppress("LongParameterList", "TooManyFunctions")
class DefaultGroundedGenerationExecutor(
    private val jobStore: AiGenerationJobStore,
    private val wholeTranscriptGroundedGeneratorsByProvider: Map<Provider, WholeTranscriptGroundedGenerator>,
    private val budgetGuard: GroundedInputBudgetGuard,
    private val validator: GroundedGenerationValidator,
    private val modelCatalog: ModelCatalog,
    private val auditPort: AiGenerationAuditPort,
    private val costGuard: GenerationCostGuard,
    private val latencyNotification: AiGenerationLatencyNotification,
    private val properties: AiGenerationProperties,
    private val clock: Clock,
    private val metrics: AiGenerationMetrics,
    private val sleeper: Sleeper,
    private val fallbackChain: ProviderFallbackChain,
) : GroundedGenerationExecutor {
    private val logger = LoggerFactory.getLogger(DefaultGroundedGenerationExecutor::class.java)

    @Suppress("ReturnCount")
    override fun process(
        record: JobRecord,
        start: Instant,
    ) {
        if (!moveStage(record.jobId, JobStage.GENERATING_RECORD, PROGRESS_GENERATING)) return
        val attempt = generateWithPersistedFallback(record, start) ?: return
        if (!moveStage(record.jobId, JobStage.VALIDATING_GROUNDING, PROGRESS_VALIDATING)) return
        val validation =
            validator.validate(
                attempt.output.draft,
                record.validatedTurns,
                record.toSessionMeta(),
                record.revision + 1,
            )
        when (validation) {
            is GroundedValidationResult.Valid -> persistValid(record, attempt, validation, start)
            is GroundedValidationResult.Repairable -> repairOnce(record, attempt, validation, start)
            is GroundedValidationResult.Invalid -> failValidation(record, attempt.model, validation.reasons, start)
        }
    }

    @Suppress("ReturnCount")
    private fun generateWithPersistedFallback(
        record: JobRecord,
        start: Instant,
    ): GroundedAttempt? {
        val primary = record.model
        val primaryGenerator =
            wholeTranscriptGroundedGeneratorsByProvider[primary.provider]
                ?: return fail(record, ErrorCode.AI_DISABLED, primary, "Grounded provider unavailable", start)
        val primaryRequest = render(record, primary, GroundedRequestMode.PRIMARY, null, null, start) ?: return null
        return when (val first = callGenerate(record) { primaryGenerator.generate(primary, primaryRequest) }) {
            is GroundedCall.Success -> GroundedAttempt(first.output, primary, primaryGenerator)
            GroundedCall.StateChanged -> null
            is GroundedCall.Failure -> {
                if (!isAvailabilityFailure(first.error.code)) {
                    fail(record, first.error.code, primary, first.error.message, start)
                } else {
                    auditRetry(record, primary, first.error, start)
                    sleeper.sleep(backoff(first.error.code))
                    val fallback =
                        fallbackChain.nextEligibleGrounded(
                            primary,
                            record.eligibleFallbackModels,
                            wholeTranscriptGroundedGeneratorsByProvider,
                        ) ?: return fail(record, first.error.code, primary, "No eligible grounded fallback", start)
                    val fallbackGenerator = wholeTranscriptGroundedGeneratorsByProvider.getValue(fallback.provider)
                    val fallbackRequest =
                        render(record, fallback, GroundedRequestMode.PRIMARY, null, null, start) ?: return null
                    when (val second = callGenerate(record) { fallbackGenerator.generate(fallback, fallbackRequest) }) {
                        is GroundedCall.Success -> GroundedAttempt(second.output, fallback, fallbackGenerator)
                        GroundedCall.StateChanged -> null
                        is GroundedCall.Failure ->
                            fail(record, second.error.code, fallback, second.error.message, start)
                    }
                }
            }
        }
    }

    @Suppress("ReturnCount")
    private fun repairOnce(
        record: JobRecord,
        attempt: GroundedAttempt,
        repairable: GroundedValidationResult.Repairable,
        start: Instant,
    ) {
        metrics.recordGroundingValidationFailure(repairable.reasons)
        if (!moveStage(record.jobId, JobStage.REPAIRING_RECORD, PROGRESS_REPAIRING)) return
        val request =
            render(
                record,
                attempt.model,
                GroundedRequestMode.REPAIR,
                attempt.output.draft,
                repairable.section,
                start,
            ) ?: return
        val repaired =
            when (
                val call =
                    callRepair(record) {
                        attempt.generator.repair(attempt.model, repairable.section, request)
                    }
            ) {
                is GroundedRepairCall.Success -> call.output
                GroundedRepairCall.StateChanged -> return
                is GroundedRepairCall.Failure -> {
                    metrics.recordGroundingRepairOutcome(GroundingRepairOutcome.FAILED)
                    fail(record, call.error.code, attempt.model, call.error.message, start, groundingInvalid = true)
                    return
                }
            }
        val merged = mergeGroundedRepair(attempt.output.draft, repairable.section, repaired)
        if (!moveStage(record.jobId, JobStage.VALIDATING_GROUNDING, PROGRESS_REVALIDATING)) return
        val validation =
            validator.validate(
                merged,
                record.validatedTurns,
                record.toSessionMeta(),
                record.revision + 1,
            )
        when (validation) {
            is GroundedValidationResult.Valid -> {
                metrics.recordGroundingRepairOutcome(GroundingRepairOutcome.SUCCEEDED)
                persistValid(
                    record,
                    attempt.copy(output = GroundedGenerationOutput(merged, attempt.output.usage + repaired.usage)),
                    validation,
                    start,
                    groundingWarningCount = 1,
                )
            }
            is GroundedValidationResult.Repairable -> {
                metrics.recordGroundingRepairOutcome(GroundingRepairOutcome.FAILED)
                failValidation(record, attempt.model, validation.reasons, start)
            }
            is GroundedValidationResult.Invalid -> {
                metrics.recordGroundingRepairOutcome(GroundingRepairOutcome.FAILED)
                failValidation(record, attempt.model, validation.reasons, start)
            }
        }
    }

    private fun persistValid(
        record: JobRecord,
        attempt: GroundedAttempt,
        valid: GroundedValidationResult.Valid,
        start: Instant,
        groundingWarningCount: Int = 0,
    ) {
        val cost = CostCalculator.actual(attempt.output.usage, modelCatalog.pricing(attempt.model))
        recordUsage(record, cost)
        val saved =
            jobStore.saveGroundedResult(
                SaveGroundedResultCommand(
                    jobId = record.jobId,
                    expectedStatus = JobStatus.RUNNING,
                    expectedRevision = record.revision,
                    result = valid.snapshot,
                    draft = attempt.output.draft,
                    evidence = valid.evidence,
                    usage = attempt.output.usage,
                    cost = cost,
                    actualModel = attempt.model,
                ),
            )
        if (!saved) return
        emitMetrics(JobStatus.SUCCEEDED, attempt.model, attempt.output.usage, cost, start)
        audit(
            record,
            attempt.model,
            AuditStatus.SUCCESS,
            null,
            null,
            attempt.output.usage,
            cost,
            start,
            groundingWarningCount,
        )
        maybeNotifyLong(record, start)
    }

    private fun failValidation(
        record: JobRecord,
        model: ModelId,
        reasons: Set<GroundingFailureReason>,
        start: Instant,
    ) {
        metrics.recordGroundingValidationFailure(reasons)
        val safeReasons = reasons.map(GroundingFailureReason::name).sorted().joinToString(",")
        fail(record, ErrorCode.SCHEMA_INVALID, model, "Grounding validation failed: $safeReasons", start)
    }

    private fun fail(
        record: JobRecord,
        code: ErrorCode,
        model: ModelId,
        safeMessage: String,
        start: Instant,
        groundingInvalid: Boolean = false,
    ): GroundedAttempt? {
        val transitioned =
            jobStore.transitionStatus(
                record.jobId,
                setOf(JobStatus.RUNNING),
                JobStatus.FAILED,
                null,
                0,
                GenerationError(code, safeMessage),
                if (groundingInvalid || code == ErrorCode.SCHEMA_INVALID) GroundingStatus.INVALID else null,
            )
        if (transitioned) {
            emitMetrics(JobStatus.FAILED, model, TokenUsage.ZERO, BigDecimal.ZERO, start)
            audit(
                record,
                model,
                AuditStatus.FAILED,
                code,
                safeMessage,
                TokenUsage.ZERO,
                BigDecimal.ZERO,
                start,
                groundingStatus =
                    if (groundingInvalid || code == ErrorCode.SCHEMA_INVALID) GroundingStatus.INVALID else null,
            )
            maybeNotifyLong(record, start)
        }
        return null
    }

    private fun moveStage(
        jobId: java.util.UUID,
        stage: JobStage,
        progress: Int,
    ): Boolean = jobStore.transitionStatus(jobId, setOf(JobStatus.RUNNING), JobStatus.RUNNING, stage, progress, null)

    @Suppress("ktlint:standard:function-expression-body")
    private fun render(
        record: JobRecord,
        model: ModelId,
        mode: GroundedRequestMode,
        currentDraft: GroundedGenerationDraft?,
        section: GenerationItem?,
        start: Instant,
    ): RenderedGroundedRequest? {
        val request =
            GroundedRenderRequest(
                provider = model.provider,
                sessionMeta = record.toSessionMeta(),
                turns = record.validatedTurns,
                hostInstructions = record.instructions,
                mode = mode,
                currentDraft = currentDraft,
                requestedSection = section,
            )
        return try {
            budgetGuard.evaluate(request, model, emptyList()).renderedRequest
        } catch (failure: AiGenerationException.Coded) {
            fail(record, failure.code, model, "Grounded request budget validation failed", start)
            null
        }
    }

    private inline fun callGenerate(
        record: JobRecord,
        block: () -> GroundedGenerationOutput,
    ): GroundedCall {
        if (!costGuard.renewAdmission(record.hostUserId, record.clubId, record.jobId)) {
            return GroundedCall.Failure(providerAdmissionExpiredError())
        }
        return when (reserveCall(record)) {
            LlmCallReservation.CAP_EXCEEDED -> GroundedCall.Failure(maxCallsError())
            LlmCallReservation.STATE_CHANGED -> GroundedCall.StateChanged
            LlmCallReservation.RESERVED -> {
                try {
                    GroundedCall.Success(block())
                } catch (failure: LlmGenerationException) {
                    GroundedCall.Failure(failure.error)
                }
            }
        }
    }

    private inline fun callRepair(
        record: JobRecord,
        block: () -> GroundedSectionRepairOutput,
    ): GroundedRepairCall {
        if (!costGuard.renewAdmission(record.hostUserId, record.clubId, record.jobId)) {
            return GroundedRepairCall.Failure(providerAdmissionExpiredError())
        }
        return when (reserveCall(record)) {
            LlmCallReservation.CAP_EXCEEDED -> GroundedRepairCall.Failure(maxCallsError())
            LlmCallReservation.STATE_CHANGED -> GroundedRepairCall.StateChanged
            LlmCallReservation.RESERVED -> {
                try {
                    GroundedRepairCall.Success(block())
                } catch (failure: LlmGenerationException) {
                    GroundedRepairCall.Failure(failure.error)
                }
            }
        }
    }

    private fun reserveCall(record: JobRecord): LlmCallReservation =
        jobStore.reserveLlmCall(record.jobId, JobStatus.RUNNING, properties.job.maxLlmCallsPerJob)

    private fun maxCallsError() = GenerationError(ErrorCode.MAX_CALLS_EXCEEDED, "Per-job LLM call cap exceeded")

    private fun providerAdmissionExpiredError() =
        GenerationError(
            ErrorCode.RATE_LIMITED,
            "Provider admission expired before call",
        )

    private fun recordUsage(
        record: JobRecord,
        cost: BigDecimal,
    ) {
        runCatching { costGuard.recordUsage(record.hostUserId, record.clubId, record.jobId, cost) }
            .onFailure { failure ->
                logger.warn("Grounded usage accounting failed for jobId={}", record.jobId, failure)
            }
    }

    private fun auditRetry(
        record: JobRecord,
        model: ModelId,
        error: GenerationError,
        start: Instant,
    ) {
        audit(
            record,
            model,
            AuditStatus.FAILED,
            error.code,
            error.message,
            TokenUsage.ZERO,
            BigDecimal.ZERO,
            start,
        )
    }

    @Suppress("LongParameterList")
    private fun audit(
        record: JobRecord,
        model: ModelId,
        status: AuditStatus,
        errorCode: ErrorCode?,
        errorMessage: String?,
        usage: TokenUsage,
        cost: BigDecimal,
        start: Instant,
        groundingWarningCount: Int = 0,
        groundingStatus: GroundingStatus? = null,
    ) {
        val auditedGroundingStatus =
            groundingStatus?.name
                ?: if (status == AuditStatus.SUCCESS) GroundingStatus.VALID.name else record.groundingStatus?.name
        auditPort.insert(
            AuditLogEntry(
                record.jobId,
                record.sessionId,
                record.clubId,
                record.hostUserId,
                AuditKind.FULL,
                null,
                model.provider,
                model.name,
                null,
                usage,
                cost,
                status,
                errorCode,
                errorMessage,
                elapsedMillis(start),
                clock.instant(),
                pipelineVersion = record.pipelineMode.name,
                inputTurnCount = record.validatedTurns.size,
                speakerCount =
                    record.validatedTurns
                        .map { it.speakerMembershipId }
                        .distinct()
                        .size,
                groundingStatus = auditedGroundingStatus,
                groundingWarningCount = groundingWarningCount,
            ),
        )
    }

    private fun emitMetrics(
        status: JobStatus,
        model: ModelId,
        usage: TokenUsage,
        cost: BigDecimal,
        start: Instant,
    ) {
        metrics.recordJobCompleted(status, model.provider, model, JobKind.FULL)
        metrics.recordLatency(
            model.provider,
            model,
            JobKind.FULL,
            Duration.between(start, clock.instant()),
        )
        if (usage.nonCachedInputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.INPUT, usage.nonCachedInputTokens)
        }
        if (usage.cacheWriteInputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.CACHE_WRITE_INPUT, usage.cacheWriteInputTokens)
        }
        if (usage.cacheReadInputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.CACHE_READ_INPUT, usage.cacheReadInputTokens)
        }
        if (usage.outputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.OUTPUT, usage.outputTokens)
        }
        if (cost > BigDecimal.ZERO) metrics.recordCost(model.provider, model, cost)
    }

    private fun maybeNotifyLong(
        record: JobRecord,
        start: Instant,
    ) {
        if (Duration.between(start, clock.instant()) > properties.job.notificationLatencyThreshold) {
            latencyNotification.notifyLongGeneration(
                record.jobId,
                record.sessionId,
                record.clubId,
                record.hostUserId,
            )
        }
    }

    private fun elapsedMillis(start: Instant): Int =
        Duration
            .between(start, clock.instant())
            .toMillis()
            .coerceAtMost(Int.MAX_VALUE.toLong())
            .toInt()

    private fun isAvailabilityFailure(code: ErrorCode): Boolean =
        code == ErrorCode.PROVIDER_UNAVAILABLE || code == ErrorCode.PROVIDER_RATE_LIMITED

    private fun backoff(code: ErrorCode): Duration =
        if (code == ErrorCode.PROVIDER_RATE_LIMITED) {
            Duration.ofSeconds(PROVIDER_RATE_LIMIT_BACKOFF_SECONDS)
        } else {
            Duration.ofSeconds(1)
        }

    private data class GroundedAttempt(
        val output: GroundedGenerationOutput,
        val model: ModelId,
        val generator: WholeTranscriptGroundedGenerator,
    )

    private sealed interface GroundedCall {
        data object StateChanged : GroundedCall

        data class Success(
            val output: GroundedGenerationOutput,
        ) : GroundedCall

        data class Failure(
            val error: GenerationError,
        ) : GroundedCall
    }

    private sealed interface GroundedRepairCall {
        data object StateChanged : GroundedRepairCall

        data class Success(
            val output: GroundedSectionRepairOutput,
        ) : GroundedRepairCall

        data class Failure(
            val error: GenerationError,
        ) : GroundedRepairCall
    }

    private companion object {
        const val PROGRESS_GENERATING = 10
        const val PROGRESS_VALIDATING = 80
        const val PROGRESS_REPAIRING = 90
        const val PROGRESS_REVALIDATING = 95
    }
}

internal fun mergeGroundedRepair(
    draft: GroundedGenerationDraft,
    requested: GenerationItem,
    repaired: GroundedSectionRepairOutput,
): GroundedGenerationDraft {
    require(repaired.section == requested) { "Grounded repair returned an unexpected section" }
    return when (repaired) {
        is GroundedSectionRepairOutput.Summary -> draft.copy(summaryBlocks = repaired.blocks)
        is GroundedSectionRepairOutput.Highlights -> draft.copy(highlights = repaired.items)
        is GroundedSectionRepairOutput.OneLineReviews -> draft.copy(oneLineReviews = repaired.items)
        is GroundedSectionRepairOutput.FeedbackDocument ->
            draft.copy(feedbackDocumentFileName = repaired.fileName, feedbackSections = repaired.sections)
    }
}
