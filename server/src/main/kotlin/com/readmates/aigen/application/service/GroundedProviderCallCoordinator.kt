package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.CostBasis
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GROUNDED_PIPELINE_VERSION
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderAttempt
import com.readmates.aigen.application.model.ProviderAttemptState
import com.readmates.aigen.application.model.ProviderCallException
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AiGenerationAuditPort
import com.readmates.aigen.application.port.out.AiProviderObservationContext
import com.readmates.aigen.application.port.out.AiProviderObservationPort
import com.readmates.aigen.application.port.out.AiTraceContextPort
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditLogEntry
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GroundedGenerationOutput
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.JobRecord
import com.readmates.aigen.application.port.out.ModelCatalog
import com.readmates.aigen.application.port.out.ProviderCallGate
import com.readmates.aigen.application.port.out.ProviderCallReconciliationCommand
import com.readmates.aigen.application.port.out.ProviderCallReconciliationResult
import com.readmates.aigen.application.port.out.ProviderCallReservationCommand
import com.readmates.aigen.application.port.out.ProviderCallReservationPort
import com.readmates.aigen.application.port.out.ProviderCallReservationResult
import com.readmates.aigen.application.port.out.ProviderCircuitOutcome
import com.readmates.aigen.application.port.out.ProviderPermitDecision
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.UUID

data class GroundedProviderCallCommand(
    val record: JobRecord,
    val admissionId: UUID,
    val expectedStatus: JobStatus,
    val model: ModelId,
    val mode: ProviderCallMode,
    val request: RenderedGroundedRequest,
    val section: GenerationItem? = null,
)

enum class ProviderFailureClass {
    PRE_TRANSPORT,
    TRANSIENT,
    RATE_LIMITED,
    SCHEMA_OR_PARSE,
    TERMINAL,
}

sealed interface GroundedProviderCallResult {
    data class Generated(
        val output: GroundedGenerationOutput,
        val attempt: ProviderAttempt,
    ) : GroundedProviderCallResult

    data class Repaired(
        val output: GroundedSectionRepairOutput,
        val attempt: ProviderAttempt,
    ) : GroundedProviderCallResult

    data class Failed(
        val error: GenerationError,
        val failureClass: ProviderFailureClass,
        val attempt: ProviderAttempt?,
        val retryAfter: Duration? = null,
    ) : GroundedProviderCallResult

    data object StateChanged : GroundedProviderCallResult
}

class ProviderCallReconciliationException(
    cause: Throwable,
) : RuntimeException("Provider request completed but cost reconciliation failed", cause)

/** Owns the complete lifecycle of exactly one physical grounded provider request. */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@Suppress("LongParameterList", "TooManyFunctions")
class GroundedProviderCallCoordinator private constructor(
    private val gate: ProviderCallGate,
    private val reservations: ProviderCallReservationPort,
    private val generators: Map<Provider, WholeTranscriptGroundedGenerator>,
    private val modelCatalog: ModelCatalog,
    private val auditPort: AiGenerationAuditPort,
    private val traceContext: AiTraceContextPort,
    private val observations: AiProviderObservationPort,
    private val metrics: AiGenerationMetrics?,
    private val clock: Clock,
    private val maxCalls: Int,
) {
    private val logger = LoggerFactory.getLogger(GroundedProviderCallCoordinator::class.java)

    @Autowired
    constructor(
        gate: ProviderCallGate,
        reservations: ProviderCallReservationPort,
        generators: Map<Provider, WholeTranscriptGroundedGenerator>,
        modelCatalog: ModelCatalog,
        auditPort: AiGenerationAuditPort,
        traceContext: AiTraceContextPort,
        observations: AiProviderObservationPort,
        metrics: AiGenerationMetrics,
        clock: Clock,
        properties: com.readmates.aigen.config.AiGenerationProperties,
    ) : this(
        gate,
        reservations,
        generators,
        modelCatalog,
        auditPort,
        traceContext,
        observations,
        metrics,
        clock,
        properties.job.maxLlmCallsPerJob,
    )

    internal constructor(
        gate: ProviderCallGate,
        reservations: ProviderCallReservationPort,
        generators: Map<Provider, WholeTranscriptGroundedGenerator>,
        modelCatalog: ModelCatalog,
        auditPort: AiGenerationAuditPort,
        traceContext: AiTraceContextPort,
        clock: Clock,
        maxCalls: Int,
        observations: AiProviderObservationPort = AiProviderObservationPort.PASSTHROUGH,
        metrics: AiGenerationMetrics? = null,
        @Suppress("UNUSED_PARAMETER") testConstruction: Unit = Unit,
    ) : this(
        gate,
        reservations,
        generators,
        modelCatalog,
        auditPort,
        traceContext,
        observations,
        metrics,
        clock,
        maxCalls,
    )

    @Suppress("ReturnCount", "SwallowedException", "TooGenericExceptionCaught")
    fun execute(command: GroundedProviderCallCommand): GroundedProviderCallResult {
        val generator = generators[command.model.provider] ?: return preTransportUnavailable()
        val acquired = gate.tryAcquire(command.model.provider)
        if (acquired is ProviderPermitDecision.Rejected) return preTransportUnavailable()
        val permit = (acquired as ProviderPermitDecision.Acquired).permit
        val startedAt = clock.instant()
        var circuitOutcome: ProviderCircuitOutcome? = null
        val completed =
            try {
                val reservation = reserve(command)
                if (reservation !is ProviderCallReservationResult.Reserved) {
                    return rejected(command.model.provider, reservation)
                }
                val attempt = reservation.attempt
                val transport =
                    try {
                        observations.observe(
                            AiProviderObservationContext(
                                provider = command.model.provider,
                                model = command.model,
                                mode = command.mode,
                                attemptOrdinal = attempt.ordinal,
                                jobId = command.record.jobId,
                            ),
                        ) {
                            callOnce(generator, command)
                        }
                    } catch (failure: ProviderCallException) {
                        PhysicalResult.Failure(failure.error, classify(failure.error.code), failure.retryAfter)
                    } catch (failure: RuntimeException) {
                        PhysicalResult.Failure(UNKNOWN_PROVIDER_OUTCOME, ProviderFailureClass.TRANSIENT)
                    }
                circuitOutcome = transport.circuitOutcome()
                val reconciled = reconcile(command, attempt, transport)
                recordReconciledCost(command.model, reconciled, transport)
                CompletedCall(reconciled, transport)
            } finally {
                try {
                    circuitOutcome?.let { outcome ->
                        permit.record(outcome, Duration.between(startedAt, clock.instant()).nonNegative())
                    }
                } finally {
                    permit.close()
                }
            }
        auditSafely(command, completed.attempt, completed.transport, startedAt)
        return completed.transport.toResult(completed.attempt)
    }

    @Suppress("SwallowedException", "TooGenericExceptionCaught")
    private fun auditSafely(
        command: GroundedProviderCallCommand,
        attempt: ProviderAttempt,
        result: PhysicalResult,
        startedAt: Instant,
    ) {
        try {
            audit(command, attempt, result, startedAt)
        } catch (failure: RuntimeException) {
            logger.warn("Provider attempt audit failed after reconciliation; provider request will not be repeated")
        }
    }

    private fun reserve(command: GroundedProviderCallCommand): ProviderCallReservationResult =
        reservations.reserve(
            ProviderCallReservationCommand(
                attemptId = UUID.randomUUID(),
                jobId = command.record.jobId,
                clubId = command.record.clubId,
                admissionId = command.admissionId,
                expectedStatus = command.expectedStatus,
                model = command.model,
                mode = command.mode,
                maximumCostUsd =
                    CostCalculator.worstCase(
                        command.request.estimatedInputTokens(),
                        command.request.maxOutputTokens.toLong(),
                        modelCatalog.pricing(command.model),
                        cacheWritePossible = command.model.provider == Provider.CLAUDE,
                    ),
                maxCalls = maxCalls,
                now = clock.instant(),
            ),
        )

    private fun callOnce(
        generator: WholeTranscriptGroundedGenerator,
        command: GroundedProviderCallCommand,
    ): PhysicalResult =
        if (command.section != null) {
            PhysicalResult.Repaired(
                generator.repair(command.model, requireNotNull(command.section), command.request),
            )
        } else {
            PhysicalResult.Generated(generator.generate(command.model, command.request))
        }

    @Suppress("TooGenericExceptionCaught")
    private fun reconcile(
        command: GroundedProviderCallCommand,
        attempt: ProviderAttempt,
        result: PhysicalResult,
    ): ProviderAttempt {
        val reconciliation =
            ProviderCallReconciliationCommand(
                attemptId = attempt.attemptId,
                jobId = command.record.jobId,
                clubId = command.record.clubId,
                terminalState = result.terminalState,
                actualCostUsd = actualCost(command.model, result),
                safeErrorCode = result.error?.code,
                releaseCallSlot =
                    result is PhysicalResult.Failure &&
                        result.failureClass == ProviderFailureClass.PRE_TRANSPORT,
                now = clock.instant(),
            )
        val reconciled =
            try {
                reservations.reconcile(reconciliation)
            } catch (failure: RuntimeException) {
                throw ProviderCallReconciliationException(failure)
            }
        return when (reconciled) {
            is ProviderCallReconciliationResult.Reconciled -> reconciled.attempt
            is ProviderCallReconciliationResult.AlreadyTerminal -> reconciled.attempt
            ProviderCallReconciliationResult.AttemptNotFound ->
                throw ProviderCallReconciliationException(IllegalStateException("Reserved provider attempt missing"))
        }
    }

    private fun recordReconciledCost(
        model: ModelId,
        attempt: ProviderAttempt,
        result: PhysicalResult,
    ) {
        val amount =
            when (attempt.costBasis) {
                CostBasis.ACTUAL -> actualCost(model, result) ?: return
                CostBasis.ESTIMATED_UNKNOWN -> attempt.reservedCostUsd
                CostBasis.NONE -> return
            }
        if (amount > BigDecimal.ZERO) {
            metrics?.recordProviderCost(model.provider, attempt.costBasis, amount)
        }
    }

    private fun audit(
        command: GroundedProviderCallCommand,
        attempt: ProviderAttempt,
        result: PhysicalResult,
        startedAt: Instant,
    ) {
        val usage = result.usage ?: TokenUsage.ZERO
        val actualCost = actualCost(command.model, result)
        auditPort.insert(
            AuditLogEntry(
                jobId = command.record.jobId,
                sessionId = command.record.sessionId,
                clubId = command.record.clubId,
                hostUserId = command.record.hostUserId,
                kind =
                    if (command.mode == ProviderCallMode.REGENERATE_SECTION) {
                        AuditKind.REGENERATE
                    } else {
                        AuditKind.FULL
                    },
                item = command.section,
                provider = command.model.provider,
                model = command.model.name,
                transcriptSha256 = null,
                usage = usage,
                costEstimateUsd = actualCost ?: attempt.reservedCostUsd,
                status = if (result.error == null) AuditStatus.SUCCESS else AuditStatus.FAILED,
                errorCode = result.error?.code,
                errorMessage = result.error?.message,
                latencyMs =
                    Duration
                        .between(startedAt, clock.instant())
                        .toMillis()
                        .coerceIn(0, Int.MAX_VALUE.toLong())
                        .toInt(),
                createdAt = clock.instant(),
                pipelineVersion = GROUNDED_PIPELINE_VERSION,
                inputTurnCount = command.record.validatedTurns.size,
                speakerCount =
                    command.record.validatedTurns
                        .map { it.speakerMembershipId }
                        .distinct()
                        .size,
                traceId = traceContext.currentTraceId(),
                providerAttempt = attempt.ordinal,
                providerCallMode = command.mode,
                costBasis = attempt.costBasis,
            ),
        )
    }

    private fun rejected(
        provider: Provider,
        result: ProviderCallReservationResult,
    ): GroundedProviderCallResult =
        when (result) {
            ProviderCallReservationResult.StateChanged -> GroundedProviderCallResult.StateChanged
            ProviderCallReservationResult.AdmissionExpired ->
                failed(
                    ErrorCode.RATE_LIMITED,
                    "Provider admission expired before call",
                    ProviderFailureClass.TERMINAL,
                )
            ProviderCallReservationResult.CallCapExceeded -> {
                metrics?.recordPhysicalCallCapExhausted(provider)
                failed(
                    ErrorCode.MAX_CALLS_EXCEEDED,
                    "Per-job LLM call cap exceeded",
                    ProviderFailureClass.TERMINAL,
                )
            }
            ProviderCallReservationResult.ModeAlreadyUsed ->
                failed(
                    ErrorCode.MAX_CALLS_EXCEEDED,
                    "Provider call mode already used for job",
                    ProviderFailureClass.TERMINAL,
                )
            ProviderCallReservationResult.MonthlyCostCapExceeded ->
                failed(
                    ErrorCode.CLUB_MONTHLY_CAP_EXCEEDED,
                    "Club monthly AI cost cap exceeded",
                    ProviderFailureClass.TERMINAL,
                )
            is ProviderCallReservationResult.Reserved -> error("handled above")
        }

    private fun preTransportUnavailable(): GroundedProviderCallResult.Failed =
        GroundedProviderCallResult.Failed(
            GenerationError(ErrorCode.PROVIDER_UNAVAILABLE, "Grounded provider unavailable"),
            ProviderFailureClass.PRE_TRANSPORT,
            null,
        )

    private fun failed(
        code: ErrorCode,
        message: String,
        failureClass: ProviderFailureClass,
    ) = GroundedProviderCallResult.Failed(GenerationError(code, message), failureClass, null)

    private fun classify(code: ErrorCode): ProviderFailureClass =
        when (code) {
            ErrorCode.MODEL_CAPABILITY_UNAVAILABLE -> ProviderFailureClass.PRE_TRANSPORT
            ErrorCode.PROVIDER_UNAVAILABLE -> ProviderFailureClass.TRANSIENT
            ErrorCode.PROVIDER_RATE_LIMITED -> ProviderFailureClass.RATE_LIMITED
            ErrorCode.SCHEMA_INVALID -> ProviderFailureClass.SCHEMA_OR_PARSE
            else -> ProviderFailureClass.TERMINAL
        }

    private fun actualCost(
        model: ModelId,
        result: PhysicalResult,
    ): BigDecimal? =
        when (result) {
            is PhysicalResult.Failure ->
                if (result.failureClass == ProviderFailureClass.PRE_TRANSPORT) BigDecimal.ZERO else null
            else ->
                result.usage
                    ?.takeIf { result.usageComplete }
                    ?.let { CostCalculator.actual(it, modelCatalog.pricing(model)) }
        }

    private sealed interface PhysicalResult {
        val usage: TokenUsage?
        val usageComplete: Boolean
        val error: GenerationError?
        val terminalState: ProviderAttemptState

        data class Generated(
            val output: GroundedGenerationOutput,
        ) : PhysicalResult {
            override val usage = output.usage
            override val usageComplete = output.usageComplete
            override val error: GenerationError? = null
            override val terminalState = ProviderAttemptState.SUCCEEDED
        }

        data class Repaired(
            val output: GroundedSectionRepairOutput,
        ) : PhysicalResult {
            override val usage = output.usage
            override val usageComplete = output.usageComplete
            override val error: GenerationError? = null
            override val terminalState = ProviderAttemptState.SUCCEEDED
        }

        data class Failure(
            override val error: GenerationError,
            val failureClass: ProviderFailureClass,
            val retryAfter: Duration? = null,
        ) : PhysicalResult {
            override val usage: TokenUsage? = null
            override val usageComplete = false
            override val terminalState =
                if (failureClass == ProviderFailureClass.PRE_TRANSPORT) {
                    ProviderAttemptState.FAILED
                } else {
                    ProviderAttemptState.UNKNOWN
                }
        }

        fun circuitOutcome(): ProviderCircuitOutcome? =
            when (this) {
                is Generated, is Repaired -> ProviderCircuitOutcome.SUCCESS
                is Failure ->
                    when (failureClass) {
                        ProviderFailureClass.PRE_TRANSPORT -> null
                        ProviderFailureClass.TRANSIENT -> ProviderCircuitOutcome.TRANSIENT_FAILURE
                        ProviderFailureClass.RATE_LIMITED,
                        ProviderFailureClass.SCHEMA_OR_PARSE,
                        ProviderFailureClass.TERMINAL,
                        -> ProviderCircuitOutcome.IGNORED_FAILURE
                    }
            }

        fun toResult(attempt: ProviderAttempt): GroundedProviderCallResult =
            when (this) {
                is Generated -> GroundedProviderCallResult.Generated(output, attempt)
                is Repaired -> GroundedProviderCallResult.Repaired(output, attempt)
                is Failure -> GroundedProviderCallResult.Failed(error, failureClass, attempt, retryAfter)
            }
    }

    private data class CompletedCall(
        val attempt: ProviderAttempt,
        val transport: PhysicalResult,
    )

    private companion object {
        val UNKNOWN_PROVIDER_OUTCOME =
            GenerationError(ErrorCode.PROVIDER_UNAVAILABLE, "Provider request outcome unknown")
    }
}

private fun Duration.nonNegative(): Duration = if (isNegative) Duration.ZERO else this
