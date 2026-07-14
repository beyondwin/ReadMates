package com.readmates.aigen.application.service

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.`in`.JobNotFoundException
import com.readmates.aigen.application.port.`in`.JobSessionMismatchException
import com.readmates.aigen.application.port.`in`.StartGenerationCommand
import com.readmates.aigen.application.port.out.ActiveClubMember
import com.readmates.aigen.application.port.out.AuditKind
import com.readmates.aigen.application.port.out.AuditStatus
import com.readmates.aigen.application.port.out.GroundedRequestRenderer
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.JobKind
import com.readmates.aigen.application.port.out.LoadAiGenerationClubMembersPort
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.shared.security.Sha256
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.util.UUID

class AiGenerationOrchestratorTest {
    @Test
    fun `invalid grounded speaker rejects before Redis Kafka cost or audit work`() {
        val ctx =
            TestContext(
                pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                activeMembers = emptyList(),
            )

        assertThatThrownBy {
            ctx.orchestrator.start(ctx.commandWithSpeaker("외부인"))
        }.isInstanceOf(AiGenerationException.InvalidTranscriptSpeakers::class.java)

        assertThat(ctx.jobStore.records).isEmpty()
        assertThat(ctx.queue.published).isEmpty()
        assertThat(ctx.costGuard.checked).isEmpty()
        assertThat(ctx.auditPort.entries).isEmpty()
    }

    @Test
    fun `grounded start binds membership identity before saving job`() {
        val membershipId = UUID.randomUUID()
        val ctx =
            TestContext(
                pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                activeMembers = listOf(ActiveClubMember(membershipId, "가람")),
            )

        ctx.orchestrator.start(ctx.commandWithSpeaker("가람"))

        val savedJobs = ctx.jobStore.records.values
        val savedJob = savedJobs.single()
        val savedTurn = savedJob.validatedTurns.single()
        assertThat(savedTurn.speakerMembershipId).isEqualTo(membershipId)
        assertThat(savedTurn.speakerName).isEqualTo("가람")
    }

    @Test
    fun `grounded start stores only whole-request-compatible fallback models`() {
        val ctx =
            TestContext(
                pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                activeMembers = listOf(ActiveClubMember(UUID.randomUUID(), "가람")),
                fallbackChain = listOf(AiGenerationTestFixtures.CLAUDE_FALLBACK.name),
            )

        ctx.orchestrator.start(ctx.commandWithSpeaker("가람"))

        val savedJob =
            ctx.jobStore.records.values
                .single()
        assertThat(savedJob.eligibleFallbackModels).containsExactly(AiGenerationTestFixtures.CLAUDE_FALLBACK)
    }

    @Test
    fun `unknown grounded capability rejects before Redis Kafka cost or audit work`() {
        val ctx =
            TestContext(
                pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                activeMembers = listOf(ActiveClubMember(UUID.randomUUID(), "가람")),
                capabilities = emptyMap(),
            )

        assertThatThrownBy { ctx.orchestrator.start(ctx.commandWithSpeaker("가람")) }
            .isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
                assertThat(it.code).isEqualTo(ErrorCode.MODEL_CAPABILITY_UNAVAILABLE)
            }

        assertThat(ctx.jobStore.records).isEmpty()
        assertThat(ctx.queue.published).isEmpty()
        assertThat(ctx.costGuard.checked).isEmpty()
        assertThat(ctx.auditPort.entries).isEmpty()
    }

    @Test
    fun `oversized grounded request rejects before Redis Kafka cost or audit work`() {
        val ctx =
            TestContext(
                pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                activeMembers = listOf(ActiveClubMember(UUID.randomUUID(), "가람")),
                capabilities = mapOf(AiGenerationTestFixtures.CLAUDE_MODEL to ModelCapability(24_576, 16_384, true)),
            )

        assertThatThrownBy { ctx.orchestrator.start(ctx.commandWithSpeaker("가람")) }
            .isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
                assertThat(it.code).isEqualTo(ErrorCode.TRANSCRIPT_TOO_LONG_FOR_MODEL)
            }

        assertThat(ctx.jobStore.records).isEmpty()
        assertThat(ctx.queue.published).isEmpty()
        assertThat(ctx.costGuard.checked).isEmpty()
        assertThat(ctx.auditPort.entries).isEmpty()
    }

    @Test
    fun `start uses club default when command omits model`() {
        val ctx = TestContext()
        ctx.clubDefaults.set(ctx.clubId, AiGenerationTestFixtures.CLAUDE_MODEL.name)

        val result = ctx.orchestrator.start(ctx.command(model = null))

        val saved =
            ctx.jobStore.records.values
                .single()
        assertThat(saved.model.name).isEqualTo(AiGenerationTestFixtures.CLAUDE_MODEL.name)
        assertThat(result.status).isEqualTo(JobStatus.PENDING)
        assertThat(result.expiresAt).isEqualTo(saved.expiresAt)
    }

    @Test
    fun `start falls back to properties default when club default missing and model not provided`() {
        val ctx = TestContext()

        ctx.orchestrator.start(ctx.command(model = null))

        val saved =
            ctx.jobStore.records.values
                .single()
        assertThat(saved.model.name).isEqualTo(AiGenerationTestFixtures.CLAUDE_FALLBACK.name)
    }

    @Test
    fun `start compensates JobRecord and audits when queue publish fails`() {
        // task_1_7 #5: a Kafka producer outage must NOT leave a PENDING JobRecord
        // hanging in Redis for the TTL. The orchestrator should transition the
        // record to FAILED, audit QUEUE_UNAVAILABLE, and rethrow as
        // LlmGenerationException so the controller surfaces 503.
        val ctx = TestContext()
        ctx.queue.throwOnPublish = RuntimeException("kafka down")

        val thrown =
            assertThatThrownBy {
                ctx.orchestrator.start(ctx.command(model = AiGenerationTestFixtures.CLAUDE_MODEL.name))
            }
        thrown.isInstanceOf(LlmGenerationException::class.java)

        val saved =
            ctx.jobStore.records.values
                .single()
        assertThat(saved.status).isEqualTo(JobStatus.FAILED)
        assertThat(saved.error!!.code).isEqualTo(ErrorCode.QUEUE_UNAVAILABLE)
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.errorCode).isEqualTo(ErrorCode.QUEUE_UNAVAILABLE)
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
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
            assertThat(it.code).isEqualTo(ErrorCode.AI_DISABLED)
        }

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
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) {
            assertThat(it.code).isEqualTo(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
        }

        val audit = ctx.auditPort.entries.single()
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.errorCode).isEqualTo(ErrorCode.HOST_DAILY_CAP_EXCEEDED)
        assertThat(ctx.queue.published).isEmpty()
    }

    @Test
    fun `failed start audit row pins the zero-value boilerplate fields`() {
        // Locks the constant fields the AuditLogEntry.failed factory absorbs, so a
        // future factory edit that drops or changes any of them is caught.
        val ctx = TestContext(modelEnabled = emptySet())

        assertThatThrownBy {
            ctx.orchestrator.start(ctx.command(model = AiGenerationTestFixtures.CLAUDE_MODEL.name))
        }.isInstanceOf(AiGenerationException.Coded::class.java)

        val audit = ctx.auditPort.entries.single()
        assertThat(audit.kind).isEqualTo(AuditKind.FULL)
        assertThat(audit.status).isEqualTo(AuditStatus.FAILED)
        assertThat(audit.item).isNull()
        assertThat(audit.usage).isEqualTo(TokenUsage(0, 0, 0))
        assertThat(audit.costEstimateUsd).isEqualTo(BigDecimal.ZERO)
        assertThat(audit.latencyMs).isEqualTo(0)
        assertThat(audit.transcriptSha256).isEqualTo(Sha256.hex("the transcript"))
        assertThat(audit.sessionId).isEqualTo(ctx.sessionId)
        assertThat(audit.clubId).isEqualTo(ctx.clubId)
        assertThat(audit.hostUserId).isEqualTo(ctx.hostUserId)
        assertThat(audit.createdAt).isEqualTo(AiGenerationTestFixtures.NOW)
    }

    @Test
    fun `get returns JobView for an existing record`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
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
        val record =
            AiGenerationTestFixtures.jobRecord(
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
        val record =
            AiGenerationTestFixtures.jobRecord(
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
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
            )
        ctx.jobStore.save(record)

        val view = ctx.orchestrator.get(ctx.sessionId, record.jobId)

        assertThat(view.warnings).doesNotContain("CLUB_BUDGET_80PCT")
    }

    @Test
    fun `recent skips unrecoverable jobs and returns latest recoverable job for session`() {
        val ctx = TestContext()
        val recoverable =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.SUCCEEDED,
                stage = JobStage.READY,
                result = AiGenerationTestFixtures.snapshot(),
                createdAt = AiGenerationTestFixtures.NOW.plusSeconds(10),
                lastUpdatedAt = AiGenerationTestFixtures.NOW.plusSeconds(10),
            )
        val committed =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.COMMITTED,
                stage = null,
                createdAt = AiGenerationTestFixtures.NOW.plusSeconds(20),
                lastUpdatedAt = AiGenerationTestFixtures.NOW.plusSeconds(20),
            )
        val fatalFailure =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.FAILED,
                stage = null,
                error = GenerationError(ErrorCode.SCHEMA_INVALID, "not retryable"),
                createdAt = AiGenerationTestFixtures.NOW.plusSeconds(30),
                lastUpdatedAt = AiGenerationTestFixtures.NOW.plusSeconds(30),
            )
        val otherSession =
            AiGenerationTestFixtures.jobRecord(
                sessionId = UUID.randomUUID(),
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.RUNNING,
                stage = JobStage.TRANSCRIPT_LOADED,
                createdAt = AiGenerationTestFixtures.NOW.plusSeconds(40),
                lastUpdatedAt = AiGenerationTestFixtures.NOW.plusSeconds(40),
            )
        listOf(recoverable, committed, fatalFailure, otherSession).forEach(ctx.jobStore::save)

        val recent = ctx.orchestrator.recent(ctx.sessionId)

        assertThat(recent).isNotNull
        assertThat(recent!!.jobId).isEqualTo(recoverable.jobId)
        assertThat(recent.createdAt).isEqualTo(recoverable.createdAt)
        assertThat(recent.lastUpdatedAt).isEqualTo(recoverable.lastUpdatedAt)
    }

    @Test
    fun `recent treats retry-safe failed job as recoverable`() {
        val ctx = TestContext()
        val retryable =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.FAILED,
                stage = null,
                error = GenerationError(ErrorCode.PROVIDER_RATE_LIMITED, "retry later"),
                createdAt = AiGenerationTestFixtures.NOW.plusSeconds(10),
                lastUpdatedAt = AiGenerationTestFixtures.NOW.plusSeconds(10),
            )
        ctx.jobStore.save(retryable)

        val recent = ctx.orchestrator.recent(ctx.sessionId)

        assertThat(recent?.jobId).isEqualTo(retryable.jobId)
        assertThat(recent?.error?.code).isEqualTo(ErrorCode.PROVIDER_RATE_LIMITED)
    }

    @Test
    fun `cancel marks job cancelled and deletes transient payload while keeping hash`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.RUNNING,
                stage = JobStage.GENERATING_SUMMARY,
                result = AiGenerationTestFixtures.snapshot(),
            )
        ctx.jobStore.save(record)

        ctx.orchestrator.cancel(ctx.sessionId, record.jobId, ctx.hostUserId)

        val stored = ctx.jobStore.load(record.jobId)!!
        assertThat(stored.status).isEqualTo(JobStatus.CANCELLED)
        assertThat(stored.result).isNull()
        assertThat(ctx.jobStore.transientPayloadDeleted).containsExactly(record.jobId)
        val audit = ctx.auditPort.entries.single()
        assertThat(audit.kind).isEqualTo(AuditKind.CANCEL)
        assertThat(audit.status).isEqualTo(AuditStatus.CANCELLED)
    }

    @Test
    fun `cancel rejects when hostUserId does not match the job's host`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
            )
        ctx.jobStore.save(record)

        val intruder = UUID.randomUUID()
        assertThatThrownBy {
            ctx.orchestrator.cancel(ctx.sessionId, record.jobId, intruder)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)

        assertThat(ctx.jobStore.deleted).isEmpty()
        assertThat(ctx.auditPort.entries).isEmpty()
    }

    @Test
    fun `cancel rejects committed job`() {
        val ctx = TestContext()
        val record =
            AiGenerationTestFixtures.jobRecord(
                sessionId = ctx.sessionId,
                clubId = ctx.clubId,
                hostUserId = ctx.hostUserId,
                status = JobStatus.COMMITTED,
                stage = null,
            )
        ctx.jobStore.save(record)

        assertThatThrownBy {
            ctx.orchestrator.cancel(ctx.sessionId, record.jobId, ctx.hostUserId)
        }.isInstanceOf(AiGenerationException.IllegalGenerationState::class.java)

        assertThat(ctx.auditPort.entries).isEmpty()
    }

    private class TestContext(
        modelEnabled: Set<com.readmates.aigen.application.model.ModelId> =
            setOf(AiGenerationTestFixtures.CLAUDE_MODEL, AiGenerationTestFixtures.CLAUDE_FALLBACK),
        pipelineMode: AiGenerationPipelineMode = AiGenerationPipelineMode.LEGACY,
        activeMembers: List<ActiveClubMember> = emptyList(),
        capabilities: Map<com.readmates.aigen.application.model.ModelId, ModelCapability>? = null,
        fallbackChain: List<String> = emptyList(),
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
        val properties =
            AiGenerationTestFixtures.defaultProperties().copy(
                pipelineMode = pipelineMode,
                fallbackChain = fallbackChain,
            )
        val clock = FakeClock(AiGenerationTestFixtures.NOW)
        val memberDirectory = LoadAiGenerationClubMembersPort { activeMembers }

        val orchestrator =
            AiGenerationOrchestrator(
                jobStore = jobStore,
                queue = queue,
                auditPort = auditPort,
                costGuard = costGuard,
                clubDefaultPort = clubDefaults,
                modelCatalog = modelCatalog,
                properties = properties,
                clock = clock,
                metrics = fakeMetrics(),
                transitionPolicy = AiGenerationJobTransitionPolicy(),
                groundedPreflightService =
                    GroundedTranscriptPreflightService(
                        TranscriptParser(),
                        memberDirectory,
                        TranscriptMembershipValidator(),
                    ),
                groundedInputBudgetGuard =
                    GroundedInputBudgetGuard(
                        renderer =
                            GroundedRequestRenderer {
                                RenderedGroundedRequest("system", "user", "schema", 16_384)
                            },
                        capabilityCatalog =
                            ModelCapabilityCatalog { model ->
                                if (capabilities == null) {
                                    ModelCapability(1_000_000, 64_000, true)
                                } else {
                                    capabilities[model]
                                }
                            },
                        properties = properties,
                    ),
            )

        fun command(model: String?): StartGenerationCommand =
            StartGenerationCommand(
                sessionId = sessionId,
                clubId = clubId,
                hostUserId = hostUserId,
                transcript = "the transcript",
                model = model,
                authorNameMode = AuthorNameMode.REAL,
                instructions = null,
                sessionMeta = AiGenerationTestFixtures.sessionMeta(sessionId = sessionId, clubId = clubId),
            )

        fun commandWithSpeaker(speaker: String): StartGenerationCommand =
            command(model = AiGenerationTestFixtures.CLAUDE_MODEL.name).copy(
                transcript = "$speaker 00:00\n공개 테스트 발언입니다.",
            )
    }
}
