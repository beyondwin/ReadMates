package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.CostBasis
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.ProviderAttempt
import com.readmates.aigen.application.model.ProviderAttemptState
import com.readmates.aigen.application.model.ProviderCallMode
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AiTraceContextPort
import com.readmates.aigen.application.port.out.GroundedGenerationOutput
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.ProviderCallGate
import com.readmates.aigen.application.port.out.ProviderCallPermit
import com.readmates.aigen.application.port.out.ProviderCallReconciliationCommand
import com.readmates.aigen.application.port.out.ProviderCallReconciliationResult
import com.readmates.aigen.application.port.out.ProviderCallReservationCommand
import com.readmates.aigen.application.port.out.ProviderCallReservationPort
import com.readmates.aigen.application.port.out.ProviderCallReservationResult
import com.readmates.aigen.application.port.out.ProviderCircuitOutcome
import com.readmates.aigen.application.port.out.ProviderGateRejection
import com.readmates.aigen.application.port.out.ProviderPermitDecision
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

class GroundedProviderCallCoordinatorTest {
    @Test
    fun `successful call follows the exact permit reservation transport reconciliation lifecycle`() {
        val context = Context()

        val result = context.coordinator.execute(context.command())

        assertThat(result).isInstanceOf(GroundedProviderCallResult.Generated::class.java)
        assertThat(context.events).containsExactly(
            "gate.acquire",
            "reservation.reserve",
            "generator.generate-or-repair",
            "reservation.reconcile",
            "permit.record",
            "permit.close",
            "audit",
        )
        val audit = context.audit.entries.single()
        assertThat(audit.providerAttempt).isEqualTo(1)
        assertThat(audit.providerCallMode).isEqualTo(ProviderCallMode.PRIMARY)
        assertThat(audit.traceId).isEqualTo(TRACE_ID)
        assertThat(audit.costBasis).isEqualTo(CostBasis.ACTUAL)
    }

    @Test
    fun `repair mode performs exactly one repair and uses the same lifecycle`() {
        val context = Context()

        val result =
            context.coordinator.execute(
                context.command(mode = ProviderCallMode.SECTION_REPAIR, section = GenerationItem.SUMMARY),
            )

        assertThat(result).isInstanceOf(GroundedProviderCallResult.Repaired::class.java)
        assertThat(context.generator.generateCalls).isZero()
        assertThat(context.generator.repairCalls).isEqualTo(1)
    }

    @Test
    fun `gate and reservation rejection never enter provider transport`() {
        val gateRejected = Context(gateDecision = ProviderPermitDecision.Rejected(ProviderGateRejection.CIRCUIT_OPEN))
        val reservationRejected = Context(reservationResult = ProviderCallReservationResult.CallCapExceeded)

        val gateResult = gateRejected.coordinator.execute(gateRejected.command())
        val reservationResult = reservationRejected.coordinator.execute(reservationRejected.command())

        assertThat(gateResult).isInstanceOf(GroundedProviderCallResult.Failed::class.java)
        assertThat(gateRejected.generator.physicalCalls).isZero()
        assertThat(gateRejected.events).containsExactly("gate.acquire")
        assertThat(reservationResult).isInstanceOf(GroundedProviderCallResult.Failed::class.java)
        assertThat(reservationRejected.generator.physicalCalls).isZero()
        assertThat(reservationRejected.events).containsExactly(
            "gate.acquire",
            "reservation.reserve",
            "permit.record",
            "permit.close",
        )
    }

    @Test
    fun `uncertain provider failure reconciles estimated unknown and records transient circuit failure`() {
        val context = Context()
        context.generator.failure =
            com.readmates.aigen.adapter.out.llm.common.LlmGenerationException(
                com.readmates.aigen.application.model.GenerationError(
                    ErrorCode.PROVIDER_UNAVAILABLE,
                    "safe unavailable",
                ),
            )

        val result = context.coordinator.execute(context.command())

        assertThat(result).isInstanceOf(GroundedProviderCallResult.Failed::class.java)
        assertThat(
            context.reservations.reconciliations
                .single()
                .terminalState,
        ).isEqualTo(ProviderAttemptState.UNKNOWN)
        assertThat(
            context.reservations.reconciliations
                .single()
                .actualCostUsd,
        ).isNull()
        assertThat(context.permit.outcome).isEqualTo(ProviderCircuitOutcome.TRANSIENT_FAILURE)
        assertThat(
            context.audit.entries
                .single()
                .costBasis,
        ).isEqualTo(CostBasis.ESTIMATED_UNKNOWN)
    }

    @Test
    fun `confirmed pre-transport option failure releases the reservation without retryable uncertainty`() {
        val context = Context()
        context.generator.failure =
            com.readmates.aigen.adapter.out.llm.common.LlmGenerationException(
                com.readmates.aigen.application.model.GenerationError(
                    ErrorCode.MODEL_CAPABILITY_UNAVAILABLE,
                    "Grounded model capability unavailable",
                ),
            )

        val result = context.coordinator.execute(context.command()) as GroundedProviderCallResult.Failed

        assertThat(result.failureClass).isEqualTo(ProviderFailureClass.PRE_TRANSPORT)
        val reconciliation = context.reservations.reconciliations.single()
        assertThat(reconciliation.terminalState).isEqualTo(ProviderAttemptState.FAILED)
        assertThat(reconciliation.actualCostUsd).isEqualByComparingTo(BigDecimal.ZERO)
        assertThat(context.permit.outcome).isEqualTo(ProviderCircuitOutcome.IGNORED_FAILURE)
    }

    @Test
    fun `confirmed failure reconciliation requires an explicit released or charged cost`() {
        val context = Context()

        assertThatThrownBy {
            ProviderCallReconciliationCommand(
                attemptId = UUID.randomUUID(),
                jobId = context.record.jobId,
                clubId = context.record.clubId,
                terminalState = ProviderAttemptState.FAILED,
                actualCostUsd = null,
                safeErrorCode = ErrorCode.MODEL_CAPABILITY_UNAVAILABLE,
                now = Instant.parse("2026-07-17T00:00:00Z"),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
            .hasMessageContaining("confirmed failure reconciliation")
    }

    @Test
    fun `complete usage reconciles actual cost`() {
        val context = Context()

        context.coordinator.execute(context.command())

        val reconciliation = context.reservations.reconciliations.single()
        assertThat(reconciliation.terminalState).isEqualTo(ProviderAttemptState.SUCCEEDED)
        assertThat(reconciliation.actualCostUsd).isEqualByComparingTo("0.0018")
    }

    @Test
    fun `incomplete usage keeps the maximum reservation as estimated unknown`() {
        val context = Context()
        context.generator.usageComplete = false

        context.coordinator.execute(context.command())

        val reconciliation = context.reservations.reconciliations.single()
        assertThat(reconciliation.terminalState).isEqualTo(ProviderAttemptState.SUCCEEDED)
        assertThat(reconciliation.actualCostUsd).isNull()
        assertThat(
            context.audit.entries
                .single()
                .costBasis,
        ).isEqualTo(CostBasis.ESTIMATED_UNKNOWN)
    }

    @Test
    fun `reservation worst case uses the rendered request output maximum`() {
        val context = Context()
        val request = RenderedGroundedRequest("system", "synthetic request", "{}", 4_096)

        context.coordinator.execute(context.command(request = request))

        val reservation = context.reservations.reservationCommands.single()
        assertThat(reservation.maximumCostUsd)
            .isEqualByComparingTo(
                CostCalculator.worstCase(
                    request.estimatedInputTokens(),
                    request.maxOutputTokens.toLong(),
                    context.modelCatalog.pricing(context.model),
                    cacheWritePossible = true,
                ),
            )
    }

    @Test
    fun `reconciliation failure after transport never issues a second request in one invocation`() {
        val context = Context(reconcileFailure = IllegalStateException("redis unavailable"))

        assertThatThrownBy { context.coordinator.execute(context.command()) }
            .isInstanceOf(ProviderCallReconciliationException::class.java)

        assertThat(context.generator.physicalCalls).isEqualTo(1)
        assertThat(context.permit.recordCalls).isEqualTo(1)
        assertThat(context.permit.closeCalls).isEqualTo(1)
    }

    @Test
    fun `audit runs after permit close and its failure cannot repeat the physical request`() {
        val context = Context(auditFailure = IllegalStateException("audit unavailable"))

        val result = context.coordinator.execute(context.command())

        assertThat(result).isInstanceOf(GroundedProviderCallResult.Generated::class.java)
        assertThat(context.events).containsExactly(
            "gate.acquire",
            "reservation.reserve",
            "generator.generate-or-repair",
            "reservation.reconcile",
            "permit.record",
            "permit.close",
            "audit",
        )
        assertThat(context.generator.physicalCalls).isEqualTo(1)
        assertThat(context.permit.closeCalls).isEqualTo(1)
    }

    private class Context(
        gateDecision: ProviderPermitDecision? = null,
        reservationResult: ProviderCallReservationResult? = null,
        reconcileFailure: RuntimeException? = null,
        auditFailure: RuntimeException? = null,
    ) {
        val events = mutableListOf<String>()
        val permit = RecordingPermit(events)
        val generator = RecordingGenerator(events)
        val audit =
            FakeAuditPort().apply {
                onInsert = {
                    events += "audit"
                    auditFailure?.let { throw it }
                }
            }
        val record = AiGenerationTestFixtures.jobRecord(status = JobStatus.RUNNING)
        val model = AiGenerationTestFixtures.CLAUDE_MODEL
        val reservations = RecordingReservations(events, record, model, reservationResult, reconcileFailure)
        val modelCatalog = AiGenerationTestFixtures.defaultModelCatalog(setOf(model))
        private val gate =
            ProviderCallGate {
                events += "gate.acquire"
                gateDecision ?: ProviderPermitDecision.Acquired(permit)
            }
        val coordinator =
            GroundedProviderCallCoordinator(
                gate = gate,
                reservations = reservations,
                generators = mapOf(Provider.CLAUDE to generator),
                modelCatalog = modelCatalog,
                auditPort = audit,
                traceContext = AiTraceContextPort { TRACE_ID },
                clock = FakeClock(NOW),
                maxCalls = 3,
            )

        fun command(
            mode: ProviderCallMode = ProviderCallMode.PRIMARY,
            section: GenerationItem? = null,
            request: RenderedGroundedRequest = RenderedGroundedRequest("system", "synthetic request", "{}", 100),
        ) = GroundedProviderCallCommand(
            record = record,
            admissionId = record.jobId,
            expectedStatus = JobStatus.RUNNING,
            model = model,
            mode = mode,
            request = request,
            section = section,
        )
    }

    private class RecordingPermit(
        private val events: MutableList<String>,
    ) : ProviderCallPermit {
        var outcome: ProviderCircuitOutcome? = null
        var recordCalls = 0
        var closeCalls = 0

        override fun record(
            outcome: ProviderCircuitOutcome,
            elapsed: Duration,
        ) {
            events += "permit.record"
            this.outcome = outcome
            recordCalls += 1
        }

        override fun close() {
            events += "permit.close"
            closeCalls += 1
        }
    }

    private class RecordingReservations(
        private val events: MutableList<String>,
        private val record: com.readmates.aigen.application.port.out.JobRecord,
        private val model: ModelId,
        private val reservationResult: ProviderCallReservationResult?,
        private val reconcileFailure: RuntimeException?,
    ) : ProviderCallReservationPort {
        val reconciliations = mutableListOf<ProviderCallReconciliationCommand>()
        val reservationCommands = mutableListOf<ProviderCallReservationCommand>()
        private val attempt = attempt(record.jobId, model)

        override fun reserve(command: ProviderCallReservationCommand): ProviderCallReservationResult {
            events += "reservation.reserve"
            reservationCommands += command
            return reservationResult ?: ProviderCallReservationResult.Reserved(attempt)
        }

        override fun reconcile(command: ProviderCallReconciliationCommand): ProviderCallReconciliationResult {
            events += "reservation.reconcile"
            reconciliations += command
            reconcileFailure?.let { throw it }
            val terminal =
                attempt.copy(
                    state = command.terminalState,
                    costBasis = if (command.actualCostUsd == null) CostBasis.ESTIMATED_UNKNOWN else CostBasis.ACTUAL,
                    safeErrorCode = command.safeErrorCode,
                    completedAt = command.now,
                )
            return ProviderCallReconciliationResult.Reconciled(terminal)
        }

        override fun recoverStaleInFlightUnknown(
            jobId: UUID,
            staleBefore: Instant,
            now: Instant,
        ) = com.readmates.aigen.application.port.out
            .ProviderCallRecoveryResult(emptyList(), false)

        override fun clubMonthlyCost(clubId: UUID) = BigDecimal.ZERO
    }

    private class RecordingGenerator(
        private val events: MutableList<String>,
    ) : WholeTranscriptGroundedGenerator {
        override val provider = Provider.CLAUDE
        var generateCalls = 0
        var repairCalls = 0
        var failure: RuntimeException? = null
        var usageComplete = true
        val physicalCalls get() = generateCalls + repairCalls

        override fun generate(
            model: ModelId,
            request: RenderedGroundedRequest,
        ): GroundedGenerationOutput {
            events += "generator.generate-or-repair"
            generateCalls += 1
            failure?.let { throw it }
            return GroundedGenerationOutput(GroundedGenerationDraftFixture.value, USAGE, usageComplete)
        }

        override fun repair(
            model: ModelId,
            section: GenerationItem,
            request: RenderedGroundedRequest,
        ): GroundedSectionRepairOutput {
            events += "generator.generate-or-repair"
            repairCalls += 1
            failure?.let { throw it }
            return GroundedSectionRepairOutput.Summary(emptyList(), USAGE, usageComplete)
        }
    }

    private object GroundedGenerationDraftFixture {
        val value: GroundedGenerationDraft =
            GroundedGenerationDraft(
                format = "readmates-grounded-generation:v2",
                sessionNumber = 1,
                bookTitle = "Synthetic Book",
                meetingDate = java.time.LocalDate.of(2026, 7, 16),
                summaryBlocks = emptyList(),
                highlights = emptyList(),
                oneLineReviews = emptyList(),
                feedbackDocumentFileName = "synthetic.md",
                feedbackSections = emptyList(),
            )
    }

    private companion object {
        val NOW: Instant = Instant.parse("2026-07-16T00:00:00Z")
        const val TRACE_ID = "0123456789abcdef0123456789abcdef"
        val USAGE = TokenUsage(100, 0, 0, 100)

        fun attempt(
            jobId: UUID,
            model: ModelId,
        ) = ProviderAttempt(
            attemptId = UUID.randomUUID(),
            ordinal = 1,
            jobId = jobId,
            provider = model.provider,
            model = model,
            mode = ProviderCallMode.PRIMARY,
            state = ProviderAttemptState.IN_FLIGHT,
            reservedCostUsd = BigDecimal("0.0004"),
            costBasis = CostBasis.NONE,
            safeErrorCode = null,
            startedAt = NOW,
            completedAt = null,
        )
    }
}
