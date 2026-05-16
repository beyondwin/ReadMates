package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationOutput
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditStatus
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID

class AiGenerationWorkerTest {

    @Test
    fun `process happy path persists snapshot, audits SUCCESS, and records cost`() {
        val ctx = TestContext()
        val record = ctx.savedRecord()
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot(),
                usage = TokenUsage(100, 0, 200),
            ),
        )

        ctx.worker.process(record.jobId)

        val updated = ctx.jobStore.load(record.jobId)!!
        assertThat(updated.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(updated.result).isNotNull
        assertThat(ctx.costGuard.recorded).hasSize(1)
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.kind).isEqualTo(AuditKind.FULL)
        assertThat(audit.status).isEqualTo(AuditStatus.SUCCESS)
    }

    @Test
    fun `process retries once on PROVIDER_RATE_LIMITED with a 5s backoff and then succeeds`() {
        val ctx = TestContext()
        val record = ctx.savedRecord()
        ctx.generator.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_RATE_LIMITED))
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot(),
                usage = TokenUsage(50, 0, 100),
            ),
        )

        ctx.worker.process(record.jobId)

        assertThat(ctx.generator.calls).hasSize(2)
        assertThat(ctx.sleeper.sleeps).containsExactly(Duration.ofSeconds(5))
        val updated = ctx.jobStore.load(record.jobId)!!
        assertThat(updated.status).isEqualTo(JobStatus.SUCCEEDED)
        // Per spec §9.2: each LLM call gets its own audit row. The retry-attempt
        // audit captures the first-attempt failure code BEFORE the successful retry
        // erases it from the terminal status.
        val auditEntries = ctx.auditPort.entries
        assertThat(auditEntries).hasSize(2)
        val retryAudit = auditEntries.first()
        assertThat(retryAudit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(retryAudit.errorCode).isEqualTo(ErrorCode.PROVIDER_RATE_LIMITED)
        val finalAudit = auditEntries.last()
        assertThat(finalAudit.status).isEqualTo(AuditStatus.SUCCESS)
    }

    @Test
    fun `process retries once on validator SCHEMA_INVALID with strengthened instructions`() {
        val ctx = TestContext()
        val record = ctx.savedRecord()
        var validateCount = 0
        ctx.validator.resultProvider = { snapshot ->
            validateCount += 1
            if (validateCount == 1) ValidationResult.Violation(ErrorCode.SCHEMA_INVALID) else ValidationResult.Ok
        }
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot("first"),
                usage = TokenUsage(10, 0, 20),
            ),
        )
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot("second"),
                usage = TokenUsage(10, 0, 20),
            ),
        )

        ctx.worker.process(record.jobId)

        assertThat(ctx.generator.calls).hasSize(2)
        // Strengthened instructions should be present on the retry call.
        assertThat(ctx.generator.calls.last().instructions).contains("Strict: SCHEMA_INVALID")
        val updated = ctx.jobStore.load(record.jobId)!!
        assertThat(updated.status).isEqualTo(JobStatus.SUCCEEDED)
    }

    @Test
    fun `process marks job FAILED after retries exhausted and audits FAILED`() {
        val ctx = TestContext()
        val record = ctx.savedRecord()
        ctx.generator.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))
        ctx.generator.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_UNAVAILABLE))

        ctx.worker.process(record.jobId)

        val updated = ctx.jobStore.load(record.jobId)!!
        assertThat(updated.status).isEqualTo(JobStatus.FAILED)
        assertThat(updated.error!!.code).isEqualTo(ErrorCode.PROVIDER_UNAVAILABLE)
        // Two audit rows: the retry-attempt audit (per spec §9.2) + the final failure audit.
        val auditEntries = ctx.auditPort.entries
        assertThat(auditEntries).hasSize(2)
        val audit = auditEntries.last()
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
    }

    @Test
    fun `process invokes latency notification when elapsed time exceeds threshold`() {
        val start = AiGenerationTestFixtures.NOW
        val ctx = TestContext(
            clock = FakeClock(start, start.plusSeconds(90L)),
            notificationThreshold = Duration.ofSeconds(60),
        )
        val record = ctx.savedRecord()
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot(),
                usage = TokenUsage(5, 0, 5),
            ),
        )

        ctx.worker.process(record.jobId)

        assertThat(ctx.latencyNotification.notified).hasSize(1)
        assertThat(ctx.latencyNotification.notified.single().jobId).isEqualTo(record.jobId)
    }

    @Test
    fun `process does not notify when elapsed time below threshold`() {
        val start = AiGenerationTestFixtures.NOW
        val ctx = TestContext(
            clock = FakeClock(start, start.plusSeconds(5L)),
            notificationThreshold = Duration.ofSeconds(60),
        )
        val record = ctx.savedRecord()
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot(),
                usage = TokenUsage(5, 0, 5),
            ),
        )

        ctx.worker.process(record.jobId)

        assertThat(ctx.latencyNotification.notified).isEmpty()
    }

    @Test
    fun `process passes session meta from JobRecord into the generator input`() {
        val ctx = TestContext()
        val record = ctx.savedRecord()
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot(),
                usage = TokenUsage(5, 0, 5),
            ),
        )

        ctx.worker.process(record.jobId)

        val passed = ctx.generator.calls.single().sessionMeta
        // The integration regression: the auth-supplied SessionMeta must reach the generator,
        // not a degenerate (sessionNumber=0, bookTitle="") meta synthesized inside the worker.
        assertThat(passed.sessionNumber).isEqualTo(record.sessionMeta.sessionNumber)
        assertThat(passed.bookTitle).isEqualTo(record.sessionMeta.bookTitle)
        assertThat(passed.expectedAuthorNames).isEqualTo(record.sessionMeta.expectedAuthorNames)
        assertThat(passed.meetingDate).isEqualTo(record.sessionMeta.meetingDate)
    }

    @Test
    fun `process retries once on generator SCHEMA_INVALID with strengthened instructions`() {
        // task_1_7 #4: generator-thrown SCHEMA_INVALID (and AUTHOR_NAME_MISMATCH /
        // HIGHLIGHTS_OUT_OF_RANGE / ONE_LINE_REVIEWS_DUPLICATE / FEEDBACK_TEMPLATE_INVALID)
        // get a single retry with strengthened instructions — same semantics as the
        // validator-side retry, but emanating from the adapter via LlmGenerationException.
        val ctx = TestContext()
        val record = ctx.savedRecord()
        ctx.generator.enqueueFailure(AiGenerationTestFixtures.providerError(ErrorCode.SCHEMA_INVALID))
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot("after retry"),
                usage = TokenUsage(20, 0, 30),
            ),
        )

        ctx.worker.process(record.jobId)

        assertThat(ctx.generator.calls).hasSize(2)
        val allCalls = ctx.generator.calls
        val lastCall = allCalls[allCalls.lastIndex]
        val lastInstructions = lastCall.instructions
        assertThat(lastInstructions).contains("Strict: SCHEMA_INVALID")
        val updated = ctx.jobStore.load(record.jobId)!!
        assertThat(updated.status).isEqualTo(JobStatus.SUCCEEDED)
    }

    @Test
    fun `process retries once on generator AUTHOR_NAME_MISMATCH with strengthened instructions`() {
        val ctx = TestContext()
        val record = ctx.savedRecord()
        ctx.generator.enqueueFailure(
            AiGenerationTestFixtures.providerError(ErrorCode.AUTHOR_NAME_MISMATCH),
        )
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot("after retry"),
                usage = TokenUsage(1, 0, 1),
            ),
        )

        ctx.worker.process(record.jobId)

        val allCalls = ctx.generator.calls
        val lastCall = allCalls[allCalls.lastIndex]
        val lastInstructions = lastCall.instructions
        assertThat(lastInstructions).contains("Strict: AUTHOR_NAME_MISMATCH")
        val updated = ctx.jobStore.load(record.jobId)!!
        assertThat(updated.status).isEqualTo(JobStatus.SUCCEEDED)
    }

    @Test
    fun `process increments LLM call counter and caps at maxLlmCallsPerJob`() {
        // task_1_7 #10: counter increments per LLM call attempt including retries;
        // when the counter would exceed maxLlmCallsPerJob, the worker short-circuits
        // with MAX_CALLS_EXCEEDED instead of calling the generator again.
        val ctx = TestContext()
        // Pre-populate the record with llmCallCount = maxLlmCallsPerJob (3) so the
        // first generator call attempt would push it to 4 — over the cap.
        val base = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
        )
        val record = base.copy(llmCallCount = 3)
        ctx.jobStore.save(record)

        ctx.worker.process(record.jobId)

        // Generator must NOT have been called once the cap is reached.
        assertThat(ctx.generator.calls).isEmpty()
        val updated = ctx.jobStore.load(record.jobId)!!
        assertThat(updated.status).isEqualTo(JobStatus.FAILED)
        assertThat(updated.error!!.code).isEqualTo(ErrorCode.MAX_CALLS_EXCEEDED)
    }

    @Test
    fun `process counts both initial call and retry against maxLlmCallsPerJob`() {
        // task_1_7 #10: increment per ATTEMPT, INCLUDING retries.
        val ctx = TestContext()
        // initial + 1 retry would push counter to 4 -> over cap of 3
        val base = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
        )
        val record = base.copy(llmCallCount = 2)
        ctx.jobStore.save(record)
        ctx.generator.enqueueFailure(
            AiGenerationTestFixtures.providerError(ErrorCode.PROVIDER_RATE_LIMITED),
        )
        // The retry attempt would itself increment the counter to 4 — over cap — so
        // the worker must short-circuit BEFORE invoking the generator a second time.
        ctx.generator.enqueueSuccess(
            GenerationOutput(
                result = AiGenerationTestFixtures.snapshot(),
                usage = TokenUsage(1, 0, 1),
            ),
        )

        ctx.worker.process(record.jobId)

        // First call happened (counter went 2 -> 3, still <= cap); retry was blocked (would push to 4).
        assertThat(ctx.generator.calls).hasSize(1)
        val updated = ctx.jobStore.load(record.jobId)!!
        assertThat(updated.status).isEqualTo(JobStatus.FAILED)
        assertThat(updated.error!!.code).isEqualTo(ErrorCode.MAX_CALLS_EXCEEDED)
    }

    @Test
    fun `process audits FAILED AI_DISABLED when model is no longer enabled`() {
        val ctx = TestContext(modelEnabled = emptySet())
        val record = ctx.savedRecord()

        ctx.worker.process(record.jobId)

        assertThat(ctx.generator.calls).isEmpty()
        val updated = ctx.jobStore.load(record.jobId)!!
        assertThat(updated.status).isEqualTo(JobStatus.FAILED)
        assertThat(updated.error!!.code).isEqualTo(ErrorCode.AI_DISABLED)
    }

    private class TestContext(
        modelEnabled: Set<com.readmates.aigen.application.model.ModelId> =
            setOf(AiGenerationTestFixtures.CLAUDE_MODEL, AiGenerationTestFixtures.CLAUDE_FALLBACK),
        val clock: FakeClock = FakeClock(AiGenerationTestFixtures.NOW),
        notificationThreshold: Duration = Duration.ofSeconds(60),
    ) {
        val sessionId: UUID = UUID.randomUUID()
        val clubId: UUID = UUID.randomUUID()
        val hostUserId: UUID = UUID.randomUUID()

        val jobStore = FakeJobStore()
        val generator = FakeContentGenerator(provider = Provider.CLAUDE)
        val auditPort = FakeAuditPort()
        val costGuard = FakeCostGuard()
        val validator = FakeValidator()
        val latencyNotification = FakeLatencyNotification()
        val sleeper = FakeSleeper()
        val modelCatalog = AiGenerationTestFixtures.defaultModelCatalog(enabled = modelEnabled)
        val properties = AiGenerationTestFixtures.defaultProperties(
            notificationThreshold = notificationThreshold,
        )

        val worker = AiGenerationWorker(
            jobStore = jobStore,
            generators = mapOf(Provider.CLAUDE to generator),
            modelCatalog = modelCatalog,
            validator = validator,
            auditPort = auditPort,
            costGuard = costGuard,
            latencyNotification = latencyNotification,
            properties = properties,
            clock = clock,
            metrics = fakeMetrics(),
            sleeper = sleeper,
        )

        fun savedRecord(): com.readmates.aigen.application.port.out.JobRecord {
            val record = AiGenerationTestFixtures.jobRecord(
                sessionId = sessionId,
                clubId = clubId,
                hostUserId = hostUserId,
            )
            jobStore.save(record)
            return record
        }
    }
}
