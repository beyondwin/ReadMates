package com.readmates.aigen.application.service

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.JobView
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.`in`.CancelGenerationUseCase
import com.readmates.aigen.application.port.`in`.GetJobUseCase
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.aigen.application.port.`in`.StartGenerationCommand
import com.readmates.aigen.application.port.`in`.StartGenerationResult
import com.readmates.aigen.application.port.`in`.StartGenerationUseCase
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiGenerationClubDefaultPort
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import com.readmates.aigen.application.port.out.AiGenerationJobStore
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GenerationCostGuard
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.security.MessageDigest
import java.time.Clock
import java.util.UUID

/**
 * Implements the start, get, and cancel use cases for AI session generation
 * (spec §7.1, §7.2, §7.5).
 *
 * - start: model resolution (command → club default → properties fallback),
 *   enabled-model check, cost-guard pre-check, JobRecord persistence,
 *   Kafka publish without transcript, then return jobId+expiresAt.
 * - get: rehydrates JobView and applies the soft 80% budget warning.
 * - cancel: deletes the 3 Redis keys and writes a CANCEL audit row.
 *
 * Wired only when `readmates.aigen.enabled=true`.
 */
@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class AiGenerationOrchestrator(
    private val jobStore: AiGenerationJobStore,
    private val queue: AiGenerationJobQueue,
    private val auditPort: AiGenerationAuditPort,
    private val costGuard: GenerationCostGuard,
    private val clubDefaultPort: AiGenerationClubDefaultPort,
    private val modelCatalog: ModelCatalog,
    private val properties: AiGenerationProperties,
    private val clock: Clock,
    private val metrics: AiGenerationMetrics,
) : StartGenerationUseCase,
    GetJobUseCase,
    CancelGenerationUseCase {
    override fun start(command: StartGenerationCommand): StartGenerationResult {
        metrics.recordJobStarted()
        val modelId =
            resolveModelId(command.model, command.clubId)
                ?: failStart(command, ErrorCode.AI_DISABLED, "Requested model is not enabled")

        if (!modelCatalog.isEnabled(modelId)) {
            failStart(command, modelId, ErrorCode.AI_DISABLED, "Model not enabled")
        }

        when (val decision = costGuard.checkBeforeCall(command.hostUserId, command.clubId)) {
            is GuardDecision.Allow -> Unit
            is GuardDecision.Deny -> failStart(command, modelId, decision.code, "Cost guard denied call")
        }

        val now = clock.instant()
        val jobId = UUID.randomUUID()
        val expiresAt = now.plus(properties.job.redisTtl)
        val record =
            JobRecord(
                jobId = jobId,
                sessionId = command.sessionId,
                clubId = command.clubId,
                hostUserId = command.hostUserId,
                model = modelId,
                authorNameMode = command.authorNameMode,
                instructions = command.instructions,
                transcript = command.transcript,
                sessionMeta = command.sessionMeta.copy(authorNameMode = command.authorNameMode),
                status = JobStatus.PENDING,
                stage = JobStage.QUEUED,
                progressPct = 0,
                result = null,
                error = null,
                tokens = TokenUsage(0, 0, 0),
                costAccumulatedUsd = BigDecimal.ZERO,
                expiresAt = expiresAt,
            )
        jobStore.save(record)
        try {
            queue.publish(
                jobId = jobId,
                sessionId = command.sessionId,
                clubId = command.clubId,
                hostUserId = command.hostUserId,
                provider = modelId.provider,
                model = modelId.name,
                kind = JobKind.FULL,
            )
        } catch (
            // Compensate: a PENDING JobRecord lives in Redis for TTL hours otherwise
            // (task_1_7 finding #5). Audit QUEUE_UNAVAILABLE, transition the record to
            // FAILED so /get returns the correct state, then rethrow a wrapped
            // LlmGenerationException so the caller sees the failure code. We catch
            // Throwable on purpose so a producer-thread Error doesn't leak an
            // orphaned PENDING record.
            @Suppress("TooGenericExceptionCaught") failure: Throwable,
        ) {
            compensateQueuePublishFailure(record, failure)
        }
        return StartGenerationResult(jobId, JobStatus.PENDING, expiresAt)
    }

    private fun compensateQueuePublishFailure(
        record: JobRecord,
        failure: Throwable,
    ): Nothing {
        val message = "Failed publishing AI generation job ${record.jobId} to queue"
        val error = GenerationError(ErrorCode.QUEUE_UNAVAILABLE, message)
        runCatching {
            jobStore.updateStatus(
                jobId = record.jobId,
                status = JobStatus.FAILED,
                stage = null,
                progressPct = 0,
                error = error,
            )
        }
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
                transcriptSha256 = sha256(record.transcript),
                usage = TokenUsage(0, 0, 0),
                costEstimateUsd = BigDecimal.ZERO,
                status = AuditStatus.FAILED,
                errorCode = ErrorCode.QUEUE_UNAVAILABLE,
                errorMessage = message,
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
        throw LlmGenerationException(error, failure)
    }

    override fun get(
        sessionId: UUID,
        jobId: UUID,
    ): JobView {
        val record = jobStore.load(jobId) ?: throw JobNotFoundException(jobId)
        if (record.sessionId != sessionId) {
            throw JobSessionMismatchException(jobId, sessionId, record.sessionId)
        }
        val warnings = mutableListOf<String>()
        val monthlyCost = costGuard.clubMonthlyCost(record.clubId)
        val threshold = properties.caps.clubMonthlyCostUsd.multiply(properties.caps.softWarningRatio)
        if (monthlyCost >= threshold) {
            warnings += SOFT_WARNING_CLUB_BUDGET_80PCT
        }
        return JobView(
            jobId = record.jobId,
            sessionId = record.sessionId,
            clubId = record.clubId,
            hostUserId = record.hostUserId,
            status = record.status,
            stage = record.stage,
            progressPct = record.progressPct,
            model = record.model,
            result = record.result,
            error = record.error,
            tokens = record.tokens,
            costEstimateUsd = record.costAccumulatedUsd,
            warnings = warnings,
            expiresAt = record.expiresAt,
        )
    }

    override fun cancel(
        sessionId: UUID,
        jobId: UUID,
        hostUserId: UUID,
    ) {
        val record = jobStore.load(jobId) ?: throw JobNotFoundException(jobId)
        if (record.sessionId != sessionId) {
            throw JobSessionMismatchException(jobId, sessionId, record.sessionId)
        }
        if (record.hostUserId != hostUserId) {
            throw AiGenerationException.IllegalGenerationState(
                jobId = jobId,
                currentStatus = record.status.name,
                attemptedAction = "cancel (host mismatch)",
            )
        }
        jobStore.delete(jobId)
        auditPort.insert(
            AuditLogEntry(
                jobId = jobId,
                sessionId = record.sessionId,
                clubId = record.clubId,
                hostUserId = record.hostUserId,
                kind = AuditKind.CANCEL,
                item = null,
                provider = record.model.provider,
                model = record.model.name,
                transcriptSha256 = null,
                usage = TokenUsage(0, 0, 0),
                costEstimateUsd = BigDecimal.ZERO,
                status = AuditStatus.CANCELLED,
                errorCode = null,
                errorMessage = null,
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
    }

    private fun resolveModelId(
        commandModel: String?,
        clubId: UUID,
    ): ModelId? {
        val candidate =
            commandModel
                ?: clubDefaultPort.load(clubId)?.defaultModel
                ?: properties.fallbackDefaultModel
        // Prefer an allowlisted resolution via the catalog. If catalog rejects, return null
        // so the caller can audit AI_DISABLED with the same code path used for explicit deny.
        return modelCatalog.resolveAlias(candidate)
            ?: providerFromName(candidate)?.let { ModelId(it, candidate) }
    }

    private fun providerFromName(name: String): Provider? =
        when {
            name.startsWith("claude-") -> Provider.CLAUDE
            name.startsWith("gemini-") -> Provider.GEMINI
            name.startsWith("gpt-") -> Provider.OPENAI
            OPENAI_O_SERIES_REGEX.matches(name) -> Provider.OPENAI
            else -> null
        }

    private fun failStart(
        command: StartGenerationCommand,
        modelId: ModelId,
        code: ErrorCode,
        message: String,
    ): Nothing {
        auditPort.insert(
            AuditLogEntry(
                jobId = UUID.randomUUID(),
                sessionId = command.sessionId,
                clubId = command.clubId,
                hostUserId = command.hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = modelId.provider,
                model = modelId.name,
                transcriptSha256 = sha256(command.transcript),
                usage = TokenUsage(0, 0, 0),
                costEstimateUsd = BigDecimal.ZERO,
                status = AuditStatus.FAILED,
                errorCode = code,
                errorMessage = message,
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
        throw IllegalStateException("$code: $message")
    }

    /**
     * Failure path used when model resolution itself produced no [ModelId] (e.g. the configured
     * fallback isn't allowlisted and the name prefix matches no known provider). The provider
     * audit field is best-effort: we try the name prefix first, then fall back to the first
     * allowlisted provider from the catalog, instead of hardcoding [Provider.CLAUDE]. If no
     * providers are allowlisted at all, we surface [Provider.CLAUDE] as a last resort so the
     * audit row still records a value of the right type.
     */
    private fun failStart(
        command: StartGenerationCommand,
        code: ErrorCode,
        message: String,
    ): Nothing {
        val candidateModel = command.model ?: properties.fallbackDefaultModel
        val provider =
            providerFromName(candidateModel)
                ?: modelCatalog.allowlisted().firstOrNull()?.provider
                ?: Provider.CLAUDE
        auditPort.insert(
            AuditLogEntry(
                jobId = UUID.randomUUID(),
                sessionId = command.sessionId,
                clubId = command.clubId,
                hostUserId = command.hostUserId,
                kind = AuditKind.FULL,
                item = null,
                provider = provider,
                model = candidateModel,
                transcriptSha256 = sha256(command.transcript),
                usage = TokenUsage(0, 0, 0),
                costEstimateUsd = BigDecimal.ZERO,
                status = AuditStatus.FAILED,
                errorCode = code,
                errorMessage = message,
                latencyMs = 0,
                createdAt = clock.instant(),
            ),
        )
        throw IllegalStateException("$code: $message")
    }

    private fun sha256(text: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        val bytes = digest.digest(text.toByteArray(Charsets.UTF_8))
        return bytes.joinToString("") { "%02x".format(it) }
    }

    private companion object {
        private const val SOFT_WARNING_CLUB_BUDGET_80PCT = "CLUB_BUDGET_80PCT"
        private val OPENAI_O_SERIES_REGEX = Regex("^o\\d.*")
    }
}
