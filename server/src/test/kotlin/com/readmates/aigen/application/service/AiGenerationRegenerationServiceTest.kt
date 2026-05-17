package com.readmates.aigen.application.service

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.RegenerationOutput
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GuardDecision
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Duration
import java.util.UUID

class AiGenerationRegenerationServiceTest {
    @Test
    fun `regenerate happy path patches snapshot and writes SUCCESS audit row`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot("old summary"),
            )
        ctx.jobStore.save(record)
        ctx.regenerator.enqueueSuccess(
            RegenerationOutput(
                patchedItem = GenerationItem.SUMMARY,
                patchedValue = "fresh summary",
                usage = TokenUsage(10, 0, 5),
            ),
        )

        val result =
            ctx.service.regenerate(
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                item = GenerationItem.SUMMARY,
                model = null,
                instructions = null,
            )

        assertThat(result.item).isEqualTo(GenerationItem.SUMMARY)
        assertThat(result.value).isEqualTo("fresh summary")
        assertThat(result.tokens.inputTokens).isEqualTo(10L)
        assertThat(result.costEstimateUsd).isPositive
        val patched = ctx.jobStore.load(record.jobId)!!.result!!
        assertThat(patched.summary).isEqualTo("fresh summary")
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.kind).isEqualTo(AuditKind.REGENERATE)
        assertThat(audit.status).isEqualTo(AuditStatus.SUCCESS)
        assertThat(audit.item).isEqualTo(GenerationItem.SUMMARY)
    }

    @Test
    fun `regenerate retries once on PROVIDER_UNAVAILABLE then succeeds`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)
        ctx.regenerator.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
        ctx.regenerator.enqueueSuccess(
            RegenerationOutput(
                patchedItem = GenerationItem.SUMMARY,
                patchedValue = "summary after retry",
                usage = TokenUsage(7, 0, 3),
            ),
        )

        val result =
            ctx.service.regenerate(
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                item = GenerationItem.SUMMARY,
                model = null,
                instructions = null,
            )

        assertThat(result.value).isEqualTo("summary after retry")
        assertThat(ctx.regenerator.calls).hasSize(2)
        assertThat(ctx.sleeper.sleeps).containsExactly(Duration.ofSeconds(1))
    }

    @Test
    fun `regenerate fails after max retries when provider keeps erroring`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)
        ctx.regenerator.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_RATE_LIMITED))
        ctx.regenerator.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_RATE_LIMITED))

        assertThatThrownBy {
            ctx.service.regenerate(
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                item = GenerationItem.SUMMARY,
                model = null,
                instructions = null,
            )
        }.isInstanceOf(com.readmates.aigen.adapter.out.llm.common.LlmGenerationException::class.java)

        // Two audit rows per spec §9.2: retry-attempt audit + final failure audit.
        val auditEntries = ctx.auditPort.entries
        assertThat(auditEntries).hasSize(2)
        val audit = auditEntries.last()
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.errorCode).isEqualTo(ErrorCode.PROVIDER_RATE_LIMITED)
        assertThat(ctx.sleeper.sleeps).containsExactly(Duration.ofSeconds(5))
    }

    @Test
    fun `regenerate is blocked by cost guard deny and writes FAILED audit`() {
        val ctx = TestContext()
        ctx.costGuard.decision = GuardDecision.Deny(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.regenerate(
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                item = GenerationItem.SUMMARY,
                model = null,
                instructions = null,
            )
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
            assertThat(it.code).isEqualTo(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
        }

        assertThat(ctx.regenerator.calls).isEmpty()
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.errorCode).isEqualTo(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
    }

    @Test
    fun `regenerate rolls back and audits FAILED when patched snapshot fails validation`() {
        val ctx = TestContext()
        ctx.validator.resultProvider = { snapshot, _ ->
            // Reject ONLY the patched snapshot (the one that contains the bad new summary).
            if (snapshot.summary == "bad summary") {
                ValidationResult.Violation(ErrorCode.SCHEMA_INVALID, "blank summary")
            } else {
                ValidationResult.Ok
            }
        }
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot("good original summary"),
            )
        ctx.jobStore.save(record)
        ctx.regenerator.enqueueSuccess(
            RegenerationOutput(
                patchedItem = GenerationItem.SUMMARY,
                patchedValue = "bad summary",
                usage = TokenUsage(1, 0, 1),
            ),
        )
        ctx.regenerator.enqueueSuccess(
            RegenerationOutput(
                patchedItem = GenerationItem.SUMMARY,
                patchedValue = "bad summary",
                usage = TokenUsage(1, 0, 1),
            ),
        )

        assertThatThrownBy {
            ctx.service.regenerate(
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                item = GenerationItem.SUMMARY,
                model = null,
                instructions = null,
            )
        }.isInstanceOf(LlmGenerationException::class.java)

        // The job result must NOT have been mutated by the bad patch.
        val current = ctx.jobStore.load(record.jobId)!!.result!!
        assertThat(current.summary).isEqualTo("good original summary")
        // Audit must record a FAILED entry with the validator's error code.
        val failedAudit = ctx.auditPort.entries.firstOrNull { it.status == AuditStatus.FAILED }
        assertThat(failedAudit).isNotNull
        assertThat(failedAudit!!.errorCode).isEqualTo(ErrorCode.SCHEMA_INVALID)
    }

    @Test
    fun `regenerate blocks call when llmCallCount already at maxLlmCallsPerJob`() {
        // task_1_7 #10: counter persisted on JobRecord; incrementing past the
        // cap (3) short-circuits with MAX_CALLS_EXCEEDED without calling the
        // provider.
        val ctx = TestContext()
        val base =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        val record = base.copy(llmCallCount = 3)
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.regenerate(
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                item = GenerationItem.SUMMARY,
                model = null,
                instructions = null,
            )
        }.isInstanceOf(LlmGenerationException::class.java)

        assertThat(ctx.regenerator.calls).isEmpty()
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.errorCode).isEqualTo(ErrorCode.MAX_CALLS_EXCEEDED)
    }

    @Test
    fun `regenerate provider rate limited retry does not strengthen instruction`() {
        // Spec §9.2: provider-availability retries (PROVIDER_UNAVAILABLE /
        // PROVIDER_RATE_LIMITED) re-send the same prompt; only schema/author/etc.
        // codes trigger strengthened instructions on retry. Mirrors the Worker
        // contract in AiGenerationWorker.retryStrategyFor.
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
                instructions = "tighten the summary",
            )
        ctx.jobStore.save(record)
        ctx.regenerator.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_RATE_LIMITED))
        ctx.regenerator.enqueueSuccess(
            RegenerationOutput(
                patchedItem = GenerationItem.SUMMARY,
                patchedValue = "summary after retry",
                usage = TokenUsage(7, 0, 3),
            ),
        )

        ctx.service.regenerate(
            sessionId = ctx.sessionId,
            jobId = record.jobId,
            item = GenerationItem.SUMMARY,
            model = null,
            instructions = null,
        )

        assertThat(ctx.regenerator.calls).hasSize(2)
        val retryInstructions =
            ctx.regenerator.calls
                .last()
                .instructions
        assertThat(retryInstructions).isEqualTo("tighten the summary")
        assertThat(retryInstructions).doesNotContain("Strict:")
    }

    @Test
    fun `regenerate appends CLUB_BUDGET_80PCT to warnings when monthly cost crosses soft ratio`() {
        val ctx = TestContext()
        ctx.costGuard.clubMonthly = BigDecimal("16.50")
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.SUCCEEDED,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)
        ctx.regenerator.enqueueSuccess(
            RegenerationOutput(
                patchedItem = GenerationItem.SUMMARY,
                patchedValue = "x",
                usage = TokenUsage(1, 0, 1),
            ),
        )

        val result =
            ctx.service.regenerate(
                sessionId = ctx.sessionId,
                jobId = record.jobId,
                item = GenerationItem.SUMMARY,
                model = null,
                instructions = null,
            )

        assertThat(result.warnings).contains("CLUB_BUDGET_80PCT")
    }

    @Test
    fun `regenerate rejects jobs that are not succeeded`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
            status = JobStatus.COMMITTING,
            result = AiGenerationTestFixtures.snapshot(),
        )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.service.regenerate(ctx.sessionId, record.jobId, GenerationItem.SUMMARY, null, null)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)

        assertThat(ctx.regenerator.calls).isEmpty()
    }

    @Test
    fun `regenerate does not patch when status changes before conditional save`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
            status = JobStatus.SUCCEEDED,
            result = AiGenerationTestFixtures.snapshot("original"),
        )
        ctx.jobStore.save(record)
        ctx.jobStore.failNextConditionalSave = true
        ctx.regenerator.enqueueSuccess(
            RegenerationOutput(
                patchedItem = GenerationItem.SUMMARY,
                patchedValue = "patched",
                usage = TokenUsage(1, 0, 1),
            ),
        )

        assertThatThrownBy {
            ctx.service.regenerate(ctx.sessionId, record.jobId, GenerationItem.SUMMARY, null, null)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)

        assertThat(ctx.jobStore.load(record.jobId)!!.result!!.summary).isEqualTo("original")
        val failedAudit = ctx.auditPort.entries.single()
        assertThat(failedAudit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(failedAudit.errorCode).isEqualTo(ErrorCode.JOB_EXPIRED)
    }

    @Suppress("LongParameterList")
    private class TestContext {
        val sessionId: UUID = UUID.randomUUID()
        val clubId: UUID = UUID.randomUUID()
        val hostUserId: UUID = UUID.randomUUID()

        val jobStore = FakeJobStore()
        val regenerator = FakeContentRegenerator(provider = Provider.CLAUDE)
        val auditPort = FakeAuditPort()
        val costGuard = FakeCostGuard()
        val validator = FakeValidator()
        val modelCatalog = AiGenerationTestFixtures.defaultModelCatalog()
        val properties = AiGenerationTestFixtures.defaultProperties()
        val clock = FakeClock(AiGenerationTestFixtures.NOW)
        val sleeper = FakeSleeper()

        val service =
            AiGenerationRegenerationService(
                jobStore = jobStore,
                regenerators = mapOf(Provider.CLAUDE to regenerator),
                modelCatalog = modelCatalog,
                validator = validator,
                auditPort = auditPort,
                costGuard = costGuard,
                properties = properties,
                clock = clock,
                metrics = fakeMetrics(),
                sleeper = sleeper,
                transitionPolicy = AiGenerationJobTransitionPolicy(),
            )
    }
}
