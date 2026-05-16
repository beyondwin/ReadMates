package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.aigen.application.port.`in`.StartGenerationCommand
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.JobKind
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.util.UUID

class AiGenerationOrchestratorTest {

    @Test
    fun `start uses club default when command omits model`() {
        val ctx = TestContext()
        ctx.clubDefaults.set(ctx.clubId, AiGenerationTestFixtures.CLAUDE_MODEL.name)

        val result = ctx.orchestrator.start(ctx.command(model = null))

        val saved = ctx.jobStore.records.values.single()
        assertThat(saved.model.name).isEqualTo(AiGenerationTestFixtures.CLAUDE_MODEL.name)
        assertThat(result.status).isEqualTo(JobStatus.PENDING)
        assertThat(result.expiresAt).isEqualTo(saved.expiresAt)
    }

    @Test
    fun `start falls back to properties default when club default missing and model not provided`() {
        val ctx = TestContext()

        ctx.orchestrator.start(ctx.command(model = null))

        val saved = ctx.jobStore.records.values.single()
        assertThat(saved.model.name).isEqualTo(AiGenerationTestFixtures.CLAUDE_FALLBACK.name)
    }

    @Test
    fun `start publishes job-routing message without transcript`() {
        val ctx = TestContext()

        val result = ctx.orchestrator.start(ctx.command(model = AiGenerationTestFixtures.CLAUDE_MODEL.name))

        val published = ctx.queue.published.single()
        assertThat(published.jobId).isEqualTo(result.jobId)
        assertThat(published.sessionId).isEqualTo(ctx.sessionId)
        assertThat(published.clubId).isEqualTo(ctx.clubId)
        assertThat(published.hostUserId).isEqualTo(ctx.hostUserId)
        assertThat(published.provider.name).isEqualTo("CLAUDE")
        assertThat(published.model).isEqualTo(AiGenerationTestFixtures.CLAUDE_MODEL.name)
        assertThat(published.kind).isEqualTo(JobKind.FULL)
        // Sanity: nothing on the queue type carries transcript bytes
        assertThat(published::class.java.declaredFields.map { it.name })
            .doesNotContain("transcript")
    }

    @Test
    fun `start with disabled model throws and writes FAILED audit row with AI_DISABLED`() {
        val ctx = TestContext(modelEnabled = emptySet())

        assertThatThrownBy {
            ctx.orchestrator.start(ctx.command(model = AiGenerationTestFixtures.CLAUDE_MODEL.name))
        }.isInstanceOf(IllegalStateException::class.java)

        val audit = ctx.auditPort.entries.single()
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.errorCode).isEqualTo(ErrorCode.AI_DISABLED)
        assertThat(audit.kind).isEqualTo(AuditKind.FULL)
        assertThat(ctx.queue.published).isEmpty()
    }

    @Test
    fun `start with cost guard deny throws and writes FAILED audit row with deny code`() {
        val ctx = TestContext()
        ctx.costGuard.decision = GuardDecision.Deny(ErrorCode.HOST_DAILY_CAP_EXCEEDED)

        assertThatThrownBy {
            ctx.orchestrator.start(ctx.command(model = AiGenerationTestFixtures.CLAUDE_MODEL.name))
        }.isInstanceOf(IllegalStateException::class.java)

        val audit = ctx.auditPort.entries.single()
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.errorCode).isEqualTo(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
        assertThat(ctx.queue.published).isEmpty()
    }

    @Test
    fun `get returns JobView for an existing record`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
            status = JobStatus.SUCCEEDED,
            stage = JobStage.READY,
            result = AiGenerationTestFixtures.snapshot(),
        )
        ctx.jobStore.save(record)

        val view = ctx.orchestrator.get(ctx.sessionId, record.jobId)

        assertThat(view.jobId).isEqualTo(record.jobId)
        assertThat(view.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(view.stage).isEqualTo(JobStage.READY)
        assertThat(view.result).isNotNull
    }

    @Test
    fun `get throws JobNotFoundException when record missing`() {
        val ctx = TestContext()
        assertThatThrownBy {
            ctx.orchestrator.get(ctx.sessionId, UUID.randomUUID())
        }.isInstanceOf(JobNotFoundException::class.java)
    }

    @Test
    fun `get throws JobSessionMismatchException when sessionId does not match`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = UUID.randomUUID(),
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
        )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.orchestrator.get(ctx.sessionId, record.jobId)
        }.isInstanceOf(JobSessionMismatchException::class.java)
    }

    @Test
    fun `get appends CLUB_BUDGET_80PCT warning when monthly cost crosses softWarningRatio`() {
        val ctx = TestContext()
        ctx.costGuard.clubMonthly = BigDecimal("16.50") // > 0.80 * 20.00
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
        )
        ctx.jobStore.save(record)

        val view = ctx.orchestrator.get(ctx.sessionId, record.jobId)

        assertThat(view.warnings).contains("CLUB_BUDGET_80PCT")
    }

    @Test
    fun `get omits CLUB_BUDGET_80PCT warning when monthly cost below soft threshold`() {
        val ctx = TestContext()
        ctx.costGuard.clubMonthly = BigDecimal("1.00")
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
        )
        ctx.jobStore.save(record)

        val view = ctx.orchestrator.get(ctx.sessionId, record.jobId)

        assertThat(view.warnings).doesNotContain("CLUB_BUDGET_80PCT")
    }

    @Test
    fun `cancel deletes job record and writes CANCEL audit row`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
        )
        ctx.jobStore.save(record)

        ctx.orchestrator.cancel(ctx.sessionId, record.jobId, ctx.hostUserId)

        assertThat(ctx.jobStore.deleted).containsExactly(record.jobId)
        assertThat(ctx.jobStore.records).doesNotContainKey(record.jobId)
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.kind).isEqualTo(AuditKind.CANCEL)
        assertThat(audit.status).isEqualTo(AuditStatus.CANCELLED)
    }

    @Test
    fun `cancel rejects when hostUserId does not match the job's host`() {
        val ctx = TestContext()
        val record = AiGenerationTestFixtures.jobRecord(
            sessionId = ctx.sessionId,
            clubId = ctx.clubId,
            hostUserId = ctx.hostUserId,
        )
        ctx.jobStore.save(record)

        val intruder = UUID.randomUUID()
        assertThatThrownBy {
            ctx.orchestrator.cancel(ctx.sessionId, record.jobId, intruder)
        }.isInstanceOf(IllegalStateException::class.java)

        assertThat(ctx.jobStore.deleted).isEmpty()
        assertThat(ctx.auditPort.entries).isEmpty()
    }

    private class TestContext(
        modelEnabled: Set<com.readmates.aigen.application.model.ModelId> =
            setOf(AiGenerationTestFixtures.CLAUDE_MODEL, AiGenerationTestFixtures.CLAUDE_FALLBACK),
    ) {
        val sessionId: UUID = UUID.randomUUID()
        val clubId: UUID = UUID.randomUUID()
        val hostUserId: UUID = UUID.randomUUID()

        val jobStore = FakeJobStore()
        val queue = FakeJobQueue()
        val auditPort = FakeAuditPort()
        val costGuard = FakeCostGuard()
        val clubDefaults = FakeClubDefaultPort()
        val modelCatalog = AiGenerationTestFixtures.defaultModelCatalog(enabled = modelEnabled)
        val properties = AiGenerationTestFixtures.defaultProperties()
        val clock = FakeClock(AiGenerationTestFixtures.NOW)

        val orchestrator = AiGenerationOrchestrator(
            jobStore = jobStore,
            queue = queue,
            auditPort = auditPort,
            costGuard = costGuard,
            clubDefaultPort = clubDefaults,
            modelCatalog = modelCatalog,
            properties = properties,
            clock = clock,
        )

        fun command(model: String?): StartGenerationCommand = StartGenerationCommand(
            sessionId = sessionId,
            clubId = clubId,
            hostUserId = hostUserId,
            transcript = "the transcript",
            model = model,
            authorNameMode = AuthorNameMode.REAL,
            instructions = null,
            sessionMeta = AiGenerationTestFixtures.sessionMeta(sessionId = sessionId, clubId = clubId),
        )
    }
}
