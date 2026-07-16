package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.CostBasis
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GROUNDED_PIPELINE_VERSION
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundingFailureReason
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderAttempt
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AiGenerationLatencyNotification
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GroundedGenerationOutput
import com.readmates.aigen.application.port.out.GroundedRenderRequest
import com.readmates.aigen.application.port.out.GroundedRequestMode
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.SaveGroundedResultCommand
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import com.readmates.aigen.config.AiGenerationProperties
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
    private val callCoordinator: GroundedProviderCallCoordinator,
    private val latencyNotification: AiGenerationLatencyNotification,
    private val properties: AiGenerationProperties,
    private val clock: Clock,
    private val metrics: AiGenerationMetrics,
    private val sleeper: Sleeper,
    private val fallbackChain: ProviderFallbackChain,
    private val callPolicy: GroundedProviderCallPolicy,
) : GroundedGenerationExecutor {
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
        var plan = callPolicy.first(record.model)
        val history = mutableListOf(plan)
        while (true) {
            val renderMode =
                if (plan.mode == com.readmates.aigen.application.model.ProviderCallMode.SCHEMA_CORRECTION) {
                    GroundedRequestMode.SCHEMA_CORRECTION
                } else {
                    GroundedRequestMode.PRIMARY
                }
            val request = render(record, plan.model, renderMode, null, null, start) ?: return null
            when (
                val result =
                    callCoordinator.execute(
                        GroundedProviderCallCommand(
                            record = record,
                            admissionId = record.jobId,
                            expectedStatus = JobStatus.RUNNING,
                            model = plan.model,
                            mode = plan.mode,
                            request = request,
                        ),
                    )
            ) {
                is GroundedProviderCallResult.Generated ->
                    return GroundedAttempt(
                        output = result.output,
                        model = plan.model,
                        history = history.toList(),
                        cost = accountedCost(result.output.usage, plan.model, result.attempt),
                        costBasis = result.attempt.costBasis,
                    )
                is GroundedProviderCallResult.Repaired -> error("generation call cannot return a repair output")
                GroundedProviderCallResult.StateChanged -> return null
                is GroundedProviderCallResult.Failed -> {
                    val fallback =
                        fallbackChain.nextEligibleGrounded(
                            plan.model,
                            record.eligibleFallbackModels,
                            wholeTranscriptGroundedGeneratorsByProvider,
                        )
                    when (val decision = callPolicy.next(history, result.toPolicyOutcome(), fallback)) {
                        is GroundedProviderCallDecision.Next -> {
                            sleeper.sleep(decision.call.delay)
                            plan = decision.call
                            if (history.last().ordinal == plan.ordinal) {
                                history[history.lastIndex] = plan
                            } else {
                                history += plan
                            }
                        }
                        GroundedProviderCallDecision.Complete -> error("failure cannot complete generation")
                        GroundedProviderCallDecision.Failed ->
                            return fail(record, result.error.code, plan.model, result.error.message, start)
                    }
                }
            }
        }
    }

    @Suppress("LongMethod", "ReturnCount")
    private fun repairOnce(
        record: JobRecord,
        attempt: GroundedAttempt,
        repairable: GroundedValidationResult.Repairable,
        start: Instant,
    ) {
        metrics.recordGroundingValidationFailure(repairable.reasons)
        if (!moveStage(record.jobId, JobStage.REPAIRING_RECORD, PROGRESS_REPAIRING)) return
        val repairPlan =
            when (
                val decision =
                    callPolicy.next(
                        attempt.history,
                        GroundedProviderCallOutcome.RepairableGrounding(repairable.section),
                        null,
                    )
            ) {
                is GroundedProviderCallDecision.Next -> decision.call
                GroundedProviderCallDecision.Complete,
                GroundedProviderCallDecision.Failed,
                -> {
                    fail(record, ErrorCode.MAX_CALLS_EXCEEDED, attempt.model, "Per-job LLM call cap exceeded", start)
                    return
                }
            }
        sleeper.sleep(repairPlan.delay)
        val request =
            render(
                record,
                repairPlan.model,
                GroundedRequestMode.REPAIR,
                attempt.output.draft,
                repairable.section,
                start,
            ) ?: return
        val repairCall =
            when (
                val call =
                    callCoordinator.execute(
                        GroundedProviderCallCommand(
                            record = record,
                            admissionId = record.jobId,
                            expectedStatus = JobStatus.RUNNING,
                            model = repairPlan.model,
                            mode = repairPlan.mode,
                            request = request,
                            section = repairable.section,
                        ),
                    )
            ) {
                is GroundedProviderCallResult.Repaired -> call
                GroundedProviderCallResult.StateChanged -> return
                is GroundedProviderCallResult.Generated -> error("repair call cannot return a generation output")
                is GroundedProviderCallResult.Failed -> {
                    metrics.recordGroundingRepairOutcome(GroundingRepairOutcome.FAILED)
                    fail(record, call.error.code, repairPlan.model, call.error.message, start, groundingInvalid = true)
                    return
                }
            }
        val repaired = repairCall.output
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
                    attempt.copy(
                        output =
                            GroundedGenerationOutput(
                                merged,
                                attempt.output.usage + repaired.usage,
                                attempt.output.usageComplete && repaired.usageComplete,
                            ),
                        cost = attempt.cost.add(accountedCost(repaired.usage, repairPlan.model, repairCall.attempt)),
                        costBasis = combinedCostBasis(attempt.costBasis, repairCall.attempt.costBasis),
                    ),
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
        val cost = attempt.cost
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
            costBasis = attempt.costBasis,
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
        costBasis: CostBasis = CostBasis.NONE,
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
                pipelineVersion = GROUNDED_PIPELINE_VERSION,
                inputTurnCount = record.validatedTurns.size,
                speakerCount =
                    record.validatedTurns
                        .map { it.speakerMembershipId }
                        .distinct()
                        .size,
                groundingStatus = auditedGroundingStatus,
                groundingWarningCount = groundingWarningCount,
                costBasis = costBasis,
            ),
        )
    }

    private fun accountedCost(
        usage: TokenUsage,
        model: ModelId,
        attempt: ProviderAttempt,
    ): BigDecimal =
        when (attempt.costBasis) {
            CostBasis.ACTUAL -> CostCalculator.actual(usage, modelCatalog.pricing(model))
            CostBasis.ESTIMATED_UNKNOWN -> attempt.reservedCostUsd
            CostBasis.NONE -> error("Reconciled provider attempt must have a cost basis")
        }

    private fun combinedCostBasis(
        first: CostBasis,
        second: CostBasis,
    ): CostBasis =
        if (first == CostBasis.ACTUAL && second == CostBasis.ACTUAL) {
            CostBasis.ACTUAL
        } else {
            CostBasis.ESTIMATED_UNKNOWN
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

    private data class GroundedAttempt(
        val output: GroundedGenerationOutput,
        val model: ModelId,
        val history: List<GroundedProviderCallPlan>,
        val cost: BigDecimal,
        val costBasis: CostBasis,
    )

    private companion object {
        const val PROGRESS_GENERATING = 10
        const val PROGRESS_VALIDATING = 80
        const val PROGRESS_REPAIRING = 90
        const val PROGRESS_REVALIDATING = 95
    }
}

internal fun GroundedProviderCallResult.Failed.toPolicyOutcome(): GroundedProviderCallOutcome =
    when (failureClass) {
        ProviderFailureClass.PRE_TRANSPORT -> GroundedProviderCallOutcome.PreTransportRejection
        ProviderFailureClass.TRANSIENT -> GroundedProviderCallOutcome.TransientFailure(retryAfter)
        ProviderFailureClass.RATE_LIMITED -> GroundedProviderCallOutcome.RateLimited(retryAfter)
        ProviderFailureClass.SCHEMA_OR_PARSE -> GroundedProviderCallOutcome.SchemaOrParseFailure
        ProviderFailureClass.TERMINAL -> GroundedProviderCallOutcome.TerminalFailure
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
