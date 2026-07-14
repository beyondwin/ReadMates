package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundingFailureReason
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
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
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.LlmCallReservation
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.SaveGroundedResultCommand
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.Clock

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
    private val properties: AiGenerationProperties,
    private val clock: Clock,
    private val metrics: AiGenerationMetrics,
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
        requireCostAllowance(record)
        val generator = requireGenerator(selectedModel)
        val rendered = renderRegeneration(record, selectedModel, instructions, currentDraft, item)
        val repair = callRepair(record, generator, selectedModel, item, rendered)
        val merged = mergeGroundedRepair(currentDraft, item, repair)
        val nextRevision = expectedRevision + 1
        val valid =
            when (
                val validation =
                    validator.validate(
                        merged,
                        record.validatedTurns,
                        record.toSessionMeta(),
                        nextRevision,
                    )
            ) {
                is GroundedValidationResult.Valid -> validation
                is GroundedValidationResult.Repairable -> invalidRegeneration(validation.reasons)
                is GroundedValidationResult.Invalid -> invalidRegeneration(validation.reasons)
            }
        val cost = CostCalculator.estimate(repair.usage, modelCatalog.pricing(selectedModel))
        costGuard.recordUsage(record.hostUserId, record.clubId, cost)
        val saved =
            jobStore.saveGroundedResult(
                SaveGroundedResultCommand(
                    record.jobId,
                    JobStatus.SUCCEEDED,
                    expectedRevision,
                    valid.snapshot,
                    merged,
                    valid.evidence,
                    repair.usage,
                    cost,
                    selectedModel,
                ),
            )
        if (!saved) staleRevision(jobStore.load(record.jobId)?.revision)
        auditSuccess(record, item, selectedModel, repair.usage, cost)
        emitMetrics(item, selectedModel, repair.usage, cost)
        return RegenerationResult(
            item = item,
            value = sectionValue(valid.snapshot, item),
            tokens = repair.usage,
            costEstimateUsd = cost,
            warnings = warnings(record),
            revision = nextRevision,
            result = valid.snapshot,
            evidence = valid.evidence,
        )
    }

    @Suppress("LongParameterList", "ktlint:standard:function-expression-body")
    private fun renderRegeneration(
        record: JobRecord,
        selectedModel: ModelId,
        instructions: String?,
        currentDraft: GroundedGenerationDraft,
        item: GenerationItem,
    ): RenderedGroundedRequest {
        return budgetGuard
            .evaluate(
                GroundedRenderRequest(
                    provider = selectedModel.provider,
                    sessionMeta = record.toSessionMeta(),
                    turns = record.validatedTurns,
                    hostInstructions = instructions ?: record.instructions,
                    mode = GroundedRequestMode.REGENERATE_SECTION,
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

    private fun requireCostAllowance(record: JobRecord) {
        when (val decision = costGuard.checkBeforeCall(record.hostUserId, record.clubId)) {
            is GuardDecision.Allow -> Unit
            is GuardDecision.Deny -> throw AiGenerationException.Coded(decision.code)
        }
    }

    private fun requireGenerator(model: ModelId): WholeTranscriptGroundedGenerator =
        wholeTranscriptGroundedGeneratorsByProvider[model.provider]
            ?: throw AiGenerationException.Coded(ErrorCode.AI_DISABLED)

    private fun callRepair(
        record: JobRecord,
        generator: WholeTranscriptGroundedGenerator,
        model: ModelId,
        item: GenerationItem,
        request: com.readmates.aigen.application.port.out.RenderedGroundedRequest,
    ): com.readmates.aigen.application.port.out.GroundedSectionRepairOutput {
        when (jobStore.reserveLlmCall(record.jobId, JobStatus.SUCCEEDED, properties.job.maxLlmCallsPerJob)) {
            LlmCallReservation.RESERVED -> Unit
            LlmCallReservation.CAP_EXCEEDED -> throw AiGenerationException.Coded(ErrorCode.MAX_CALLS_EXCEEDED)
            LlmCallReservation.STATE_CHANGED -> staleRevision(jobStore.load(record.jobId)?.revision)
        }
        return generator.repair(model, item, request)
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
            ),
        )
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
        if (usage.inputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.INPUT, usage.inputTokens)
        }
        if (usage.cachedInputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.CACHED_INPUT, usage.cachedInputTokens)
        }
        if (usage.outputTokens > 0) {
            metrics.recordTokens(model.provider, model, TokenDirection.OUTPUT, usage.outputTokens)
        }
        if (cost > BigDecimal.ZERO) metrics.recordCost(model.provider, model, cost)
    }
}
