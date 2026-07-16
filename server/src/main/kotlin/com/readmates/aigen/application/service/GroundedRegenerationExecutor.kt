package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.CostBasis
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GROUNDED_PIPELINE_VERSION
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundingFailureReason
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderAttempt
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.`in`.RegenerationResult
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GroundedRenderRequest
import com.readmates.aigen.application.port.out.GroundedRequestMode
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.ProviderCallReservationPort
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.SaveGroundedResultCommand
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.Clock
import java.util.UUID

fun interface GroundedRegenerationExecutor {
    fun regenerate(
        record: JobRecord,
        item: GenerationItem,
        expectedRevision: Long,
        model: String?,
        instructions: String?,
    ): RegenerationResult

    data object Disabled : GroundedRegenerationExecutor {
        override fun regenerate(
            record: JobRecord,
            item: GenerationItem,
            expectedRevision: Long,
            model: String?,
            instructions: String?,
        ): RegenerationResult = throw AiGenerationException.Coded(ErrorCode.AI_DISABLED)
    }
}

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@Suppress("LongParameterList", "TooManyFunctions")
class DefaultGroundedRegenerationExecutor(
    private val jobStore: AiGenerationJobStore,
    private val wholeTranscriptGroundedGeneratorsByProvider: Map<Provider, WholeTranscriptGroundedGenerator>,
    private val budgetGuard: GroundedInputBudgetGuard,
    private val validator: GroundedGenerationValidator,
    private val modelCatalog: ModelCatalog,
    private val auditPort: AiGenerationAuditPort,
    private val costGuard: GenerationCostGuard,
    private val reservations: ProviderCallReservationPort,
    private val callCoordinator: GroundedProviderCallCoordinator,
    private val properties: AiGenerationProperties,
    private val clock: Clock,
    private val metrics: AiGenerationMetrics,
    private val callPolicy: GroundedProviderCallPolicy,
    private val fallbackChain: ProviderFallbackChain,
    private val sleeper: Sleeper,
) : GroundedRegenerationExecutor {
    override fun regenerate(
        record: JobRecord,
        item: GenerationItem,
        expectedRevision: Long,
        model: String?,
        instructions: String?,
    ): RegenerationResult {
        val currentDraft = requireCurrentDraft(record, expectedRevision)
        val selectedModel = resolveModel(model, record)
        requireGenerator(selectedModel)
        val admissionId = UUID.randomUUID()
        requireCostAllowance(record, admissionId)
        recoverUnresolvedAttempt(record, admissionId)
        val attempt = callRepairWithPolicy(record, item, currentDraft, instructions, selectedModel, admissionId)
        val merged = attempt.merged
        val nextRevision = expectedRevision + 1
        val valid = attempt.valid
        val cost = attempt.cost
        val saved =
            jobStore.saveGroundedResult(
                SaveGroundedResultCommand(
                    record.jobId,
                    JobStatus.SUCCEEDED,
                    expectedRevision,
                    valid.snapshot,
                    merged,
                    valid.evidence,
                    attempt.usage,
                    cost,
                    attempt.model,
                ),
            )
        if (!saved) staleRevision(jobStore.load(record.jobId)?.revision)
        auditSuccess(record, item, attempt.model, attempt.usage, cost, attempt.costBasis)
        emitMetrics(item, attempt.model, attempt.usage, cost)
        costGuard.releaseAdmission(record.hostUserId, record.clubId, admissionId)
        return RegenerationResult(
            item = item,
            value = sectionValue(valid.snapshot, item),
            tokens = attempt.usage,
            costEstimateUsd = cost,
            warnings = warnings(record),
            revision = nextRevision,
            result = valid.snapshot,
            evidence = valid.evidence,
        )
    }

    @Suppress("TooGenericExceptionCaught")
    private fun recoverUnresolvedAttempt(
        record: JobRecord,
        admissionId: UUID,
    ) {
        try {
            if (record.status == JobStatus.SUCCEEDED) {
                val recoveryNow = clock.instant()
                val recovery =
                    reservations.recoverStaleInFlightUnknown(
                        record.jobId,
                        recoveryNow.minus(properties.providerCalls.requestTimeout),
                        recoveryNow,
                    )
                if (recovery.activeInFlight) throw ProviderCallStillInFlightException()
            }
        } catch (failure: RuntimeException) {
            costGuard.releaseAdmission(record.hostUserId, record.clubId, admissionId)
            throw failure
        }
    }

    @Suppress("LongParameterList", "ktlint:standard:function-expression-body")
    private fun renderRegeneration(
        record: JobRecord,
        selectedModel: ModelId,
        instructions: String?,
        currentDraft: GroundedGenerationDraft,
        item: GenerationItem,
        callMode: ProviderCallMode,
    ): RenderedGroundedRequest {
        return budgetGuard
            .evaluate(
                GroundedRenderRequest(
                    provider = selectedModel.provider,
                    sessionMeta = record.toSessionMeta(),
                    turns = record.validatedTurns,
                    hostInstructions = instructions ?: record.instructions,
                    mode =
                        if (callMode == ProviderCallMode.SCHEMA_CORRECTION) {
                            GroundedRequestMode.SCHEMA_CORRECTION
                        } else {
                            GroundedRequestMode.REGENERATE_SECTION
                        },
                    currentDraft = currentDraft,
                    requestedSection = item,
                ),
                selectedModel,
                emptyList(),
            ).renderedRequest
    }

    private fun requireCurrentDraft(
        record: JobRecord,
        expectedRevision: Long,
    ): GroundedGenerationDraft {
        if (record.revision != expectedRevision) staleRevision(record.revision)
        if (record.result == null || record.evidence == null) expiredResult()
        return record.groundedDraft ?: expiredResult()
    }

    private fun requireCostAllowance(
        record: JobRecord,
        admissionId: UUID,
    ) {
        when (val decision = costGuard.checkBeforeCall(record.hostUserId, record.clubId, admissionId)) {
            is GuardDecision.Allow -> Unit
            is GuardDecision.Deny -> throw AiGenerationException.Coded(decision.code)
        }
    }

    private fun requireGenerator(model: ModelId): WholeTranscriptGroundedGenerator =
        wholeTranscriptGroundedGeneratorsByProvider[model.provider]
            ?: throw AiGenerationException.Coded(ErrorCode.AI_DISABLED)

    @Suppress("LongMethod", "LongParameterList", "ReturnCount")
    private fun callRepairWithPolicy(
        record: JobRecord,
        item: GenerationItem,
        currentDraft: GroundedGenerationDraft,
        instructions: String?,
        initialModel: ModelId,
        admissionId: UUID,
    ): RegenerationAttempt {
        var plan = callPolicy.first(initialModel, ProviderCallMode.REGENERATE_SECTION, item)
        var workingDraft = currentDraft
        var accumulatedUsage = TokenUsage.ZERO
        var accumulatedCost = BigDecimal.ZERO
        var accumulatedCostBasis = CostBasis.ACTUAL
        val history = mutableListOf(plan)
        while (true) {
            requireGenerator(plan.model)
            val request = renderRegeneration(record, plan.model, instructions, workingDraft, item, plan.mode)
            when (
                val result = executeRepairCall(record, admissionId, plan, request, item)
            ) {
                is GroundedProviderCallResult.Repaired -> {
                    val usage = accumulatedUsage + result.output.usage
                    val cost =
                        accumulatedCost.add(
                            accountedCost(result.output.usage, plan.model, result.attempt),
                        )
                    val costBasis = combinedCostBasis(accumulatedCostBasis, result.attempt.costBasis)
                    when (val validation = validateRepair(record, item, workingDraft, result.output)) {
                        is RegenerationRepairValidation.Valid ->
                            return RegenerationAttempt(
                                plan.model,
                                validation.merged,
                                validation.valid,
                                usage,
                                cost,
                                costBasis,
                            )
                        is RegenerationRepairValidation.Repairable -> {
                            workingDraft = validation.merged
                            accumulatedUsage = usage
                            accumulatedCost = cost
                            accumulatedCostBasis = costBasis
                            when (
                                val decision =
                                    callPolicy.next(
                                        history,
                                        GroundedProviderCallOutcome.RepairableGrounding(item),
                                        null,
                                    )
                            ) {
                                is GroundedProviderCallDecision.Next -> {
                                    plan = decision.call
                                    history += plan
                                }
                                GroundedProviderCallDecision.Complete ->
                                    error("repairable regeneration cannot complete")
                                GroundedProviderCallDecision.Failed -> invalidRegeneration(validation.reasons)
                            }
                        }
                    }
                }
                is GroundedProviderCallResult.Failed -> {
                    plan = nextAfterFailure(record, plan, history, result)
                    history += plan
                }
                GroundedProviderCallResult.StateChanged -> staleRevision(jobStore.load(record.jobId)?.revision)
                is GroundedProviderCallResult.Generated -> error("regeneration call cannot return a generation output")
            }
        }
    }

    @Suppress("LongParameterList")
    private fun executeRepairCall(
        record: JobRecord,
        admissionId: UUID,
        plan: GroundedProviderCallPlan,
        request: RenderedGroundedRequest,
        item: GenerationItem,
    ): GroundedProviderCallResult =
        callCoordinator.execute(
            GroundedProviderCallCommand(
                record = record,
                admissionId = admissionId,
                expectedStatus = JobStatus.SUCCEEDED,
                model = plan.model,
                mode = plan.mode,
                request = request,
                section = item,
            ),
        )

    private fun nextAfterFailure(
        record: JobRecord,
        plan: GroundedProviderCallPlan,
        history: List<GroundedProviderCallPlan>,
        result: GroundedProviderCallResult.Failed,
    ): GroundedProviderCallPlan {
        val fallback =
            fallbackChain.nextEligibleGrounded(
                plan.model,
                record.eligibleFallbackModels,
                wholeTranscriptGroundedGeneratorsByProvider,
            )
        return when (val decision = callPolicy.next(history, result.toPolicyOutcome(), fallback)) {
            is GroundedProviderCallDecision.Next -> decision.call.also { sleeper.sleep(it.delay) }
            GroundedProviderCallDecision.Complete -> error("failure cannot complete regeneration")
            GroundedProviderCallDecision.Failed -> throw AiGenerationException.Coded(result.error.code)
        }
    }

    private fun resolveModel(
        requested: String?,
        record: JobRecord,
    ): ModelId {
        if (requested == null) return record.actualModel ?: record.model
        return modelCatalog.resolveAlias(requested) ?: throw AiGenerationException.Coded(ErrorCode.AI_DISABLED)
    }

    private fun invalidRegeneration(reasons: Set<GroundingFailureReason>): Nothing {
        metrics.recordGroundingValidationFailure(reasons)
        throw AiGenerationException.Coded(ErrorCode.SCHEMA_INVALID)
    }

    private fun staleRevision(currentRevision: Long? = null): Nothing =
        throw AiGenerationException.Coded(ErrorCode.STALE_GENERATION_REVISION, currentRevision = currentRevision)

    private fun expiredResult(): Nothing = throw AiGenerationException.Coded(ErrorCode.JOB_EXPIRED)

    @Suppress("LongParameterList")
    private fun validateRepair(
        record: JobRecord,
        item: GenerationItem,
        currentDraft: GroundedGenerationDraft,
        output: GroundedSectionRepairOutput,
    ): RegenerationRepairValidation {
        val merged = mergeGroundedRepair(currentDraft, item, output)
        return when (
            val validation =
                validator.validate(
                    merged,
                    record.validatedTurns,
                    record.toSessionMeta(),
                    record.revision + 1,
                )
        ) {
            is GroundedValidationResult.Valid -> RegenerationRepairValidation.Valid(merged, validation)
            is GroundedValidationResult.Repairable ->
                RegenerationRepairValidation.Repairable(merged, validation.reasons)
            is GroundedValidationResult.Invalid -> invalidRegeneration(validation.reasons)
        }
    }

    private fun sectionValue(
        snapshot: SessionImportV1Snapshot,
        item: GenerationItem,
    ): Any =
        when (item) {
            GenerationItem.SUMMARY -> snapshot.summary
            GenerationItem.HIGHLIGHTS -> snapshot.highlights
            GenerationItem.ONE_LINE_REVIEWS -> snapshot.oneLineReviews
            GenerationItem.FEEDBACK_DOCUMENT -> snapshot.feedbackDocumentMarkdown
        }

    private fun warnings(record: JobRecord): List<String> {
        val threshold = properties.caps.clubMonthlyCostUsd.multiply(properties.caps.softWarningRatio)
        return if (costGuard.clubMonthlyCost(record.clubId) >= threshold) listOf("CLUB_BUDGET_80PCT") else emptyList()
    }

    private fun auditSuccess(
        record: JobRecord,
        item: GenerationItem,
        model: ModelId,
        usage: TokenUsage,
        cost: BigDecimal,
        costBasis: CostBasis,
    ) {
        auditPort.insert(
            AuditLogEntry(
                record.jobId,
                record.sessionId,
                record.clubId,
                record.hostUserId,
                AuditKind.REGENERATE,
                item,
                model.provider,
                model.name,
                null,
                usage,
                cost,
                AuditStatus.SUCCESS,
                null,
                null,
                0,
                clock.instant(),
                pipelineVersion = GROUNDED_PIPELINE_VERSION,
                inputTurnCount = record.validatedTurns.size,
                speakerCount =
                    record.validatedTurns
                        .map { it.speakerMembershipId }
                        .distinct()
                        .size,
                groundingStatus = GroundingStatus.VALID.name,
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
        item: GenerationItem,
        model: ModelId,
        usage: TokenUsage,
        cost: BigDecimal,
    ) {
        val kind =
            when (item) {
                GenerationItem.SUMMARY -> JobKind.REGENERATE_SUMMARY
                GenerationItem.HIGHLIGHTS -> JobKind.REGENERATE_HIGHLIGHTS
                GenerationItem.ONE_LINE_REVIEWS -> JobKind.REGENERATE_ONE_LINE_REVIEWS
                GenerationItem.FEEDBACK_DOCUMENT -> JobKind.REGENERATE_FEEDBACK_DOCUMENT
            }
        metrics.recordJobCompleted(JobStatus.SUCCEEDED, model.provider, model, kind)
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

    private data class RegenerationAttempt(
        val model: ModelId,
        val merged: GroundedGenerationDraft,
        val valid: GroundedValidationResult.Valid,
        val usage: TokenUsage,
        val cost: BigDecimal,
        val costBasis: CostBasis,
    )

    private sealed interface RegenerationRepairValidation {
        data class Valid(
            val merged: GroundedGenerationDraft,
            val valid: GroundedValidationResult.Valid,
        ) : RegenerationRepairValidation

        data class Repairable(
            val merged: GroundedGenerationDraft,
            val reasons: Set<GroundingFailureReason>,
        ) : RegenerationRepairValidation
    }
}
