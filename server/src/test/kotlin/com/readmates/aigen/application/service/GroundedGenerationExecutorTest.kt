package com.readmates.aigen.application.service

import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedAuthoredText
import com.readmates.aigen.application.model.GroundedFeedbackSection
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundedTextBlock
import com.readmates.aigen.application.model.GroundingStatus
import com.readmates.aigen.application.model.JobStage
import com.readmates.aigen.application.model.JobStatus
import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.aigen.application.port.out.GroundedGenerationOutput
import com.readmates.aigen.application.port.out.GroundedRenderRequest
import com.readmates.aigen.application.port.out.GroundedRequestMode
import com.readmates.aigen.application.port.out.GroundedRequestRenderer
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

class GroundedGenerationExecutorTest {
    @Test
    fun `expired provider admission fails closed before grounded provider call`() {
        val context = Context()
        context.costGuard.renewAllowed = false

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        val saved = context.jobStore.load(context.record.jobId)!!
        assertThat(saved.status).isEqualTo(JobStatus.FAILED)
        assertThat(saved.error!!.code).isEqualTo(ErrorCode.RATE_LIMITED)
        assertThat(context.claude.generateCalls).isZero()
        assertThat(saved.llmCallCount).isZero()
    }

    @Test
    fun `valid grounded draft uses one provider call and saves all sections with evidence`() {
        val context = Context()
        context.claude.generations += GroundedGenerationOutput(validDraft(), USAGE)

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        val saved = context.jobStore.load(context.record.jobId)!!
        val request = context.renderer.requests.single()
        assertThat(context.claude.generateCalls).isEqualTo(1)
        assertThat(context.claude.repairCalls).isZero()
        assertThat(saved.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(saved.revision).isEqualTo(1)
        assertThat(saved.result).isNotNull()
        assertThat(saved.evidence?.revision).isEqualTo(1)
        assertThat(saved.groundedDraft).isEqualTo(validDraft())
        assertThat(request.turns).containsExactlyElementsOf(context.turns)
        val audit = context.auditPort.entries.single()
        assertThat(audit.pipelineVersion).isEqualTo("GROUNDED_WHOLE_TRANSCRIPT")
        assertThat(audit.inputTurnCount).isEqualTo(1)
        assertThat(audit.speakerCount).isEqualTo(1)
        assertThat(audit.groundingStatus).isEqualTo("VALID")
    }

    @Test
    fun `one repairable section gets one full-context repair and then succeeds`() {
        val context = Context()
        context.claude.generations += GroundedGenerationOutput(validDraft().copy(summaryBlocks = emptyList()), USAGE)
        context.claude.repairs += GroundedSectionRepairOutput.Summary(validDraft().summaryBlocks, REPAIR_USAGE)

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        val saved = context.jobStore.load(context.record.jobId)!!
        val repairRequest = context.renderer.requests.last()
        assertThat(context.claude.generateCalls).isEqualTo(1)
        assertThat(context.claude.repairCalls).isEqualTo(1)
        assertThat(repairRequest.turns).containsExactlyElementsOf(context.turns)
        assertThat(repairRequest.requestedSection).isEqualTo(GenerationItem.SUMMARY)
        assertThat(saved.status).isEqualTo(JobStatus.SUCCEEDED)
        assertThat(saved.tokens).isEqualTo(USAGE + REPAIR_USAGE)
        assertThat(
            context.auditPort.entries
                .last()
                .groundingWarningCount,
        ).isEqualTo(1)
    }

    @Test
    fun `repair failure never exposes the invalid draft`() {
        val context = Context()
        context.claude.generations += GroundedGenerationOutput(validDraft().copy(summaryBlocks = emptyList()), USAGE)
        context.claude.repairFailures += GenerationError(ErrorCode.PROVIDER_UNAVAILABLE, "safe-provider-failure")

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        val failed = context.jobStore.load(context.record.jobId)!!
        assertThat(failed.status).isEqualTo(JobStatus.FAILED)
        assertThat(failed.result).isNull()
        assertThat(failed.evidence).isNull()
        assertThat(failed.groundedDraft).isNull()
        assertThat(failed.groundingStatus).isEqualTo(GroundingStatus.INVALID)
    }

    @Test
    fun `cancellation after provider call prevents validation and result persistence`() {
        val context = Context()
        context.claude.generations += GroundedGenerationOutput(validDraft(), USAGE)
        context.claude.afterGenerate = {
            val current = context.jobStore.load(context.record.jobId)!!
            context.jobStore.save(current.copy(status = JobStatus.CANCELLED))
        }

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        val cancelled = context.jobStore.load(context.record.jobId)!!
        assertThat(cancelled.status).isEqualTo(JobStatus.CANCELLED)
        assertThat(cancelled.result).isNull()
        assertThat(cancelled.evidence).isNull()
        assertThat(cancelled.groundedDraft).isNull()
    }

    @Test
    fun `conditional save loss never publishes a grounded draft`() {
        val context = Context()
        context.jobStore.failNextConditionalSave = true
        context.claude.generations += GroundedGenerationOutput(validDraft(), USAGE)

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        val unchanged = context.jobStore.load(context.record.jobId)!!
        assertThat(unchanged.status).isEqualTo(JobStatus.RUNNING)
        assertThat(unchanged.result).isNull()
        assertThat(unchanged.evidence).isNull()
        assertThat(unchanged.groundedDraft).isNull()
    }

    @Test
    fun `cancellation between stage transition and call reservation prevents provider call`() {
        val context = Context()
        context.claude.generations += GroundedGenerationOutput(validDraft(), USAGE)
        context.jobStore.beforeReserveLlmCall = {
            val current = context.jobStore.load(context.record.jobId)!!
            context.jobStore.save(current.copy(status = JobStatus.CANCELLED))
        }

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        assertThat(context.claude.generateCalls).isZero()
        assertThat(context.jobStore.load(context.record.jobId)?.status).isEqualTo(JobStatus.CANCELLED)
    }

    @Test
    fun `repair request is budget checked before provider call`() {
        val context = Context(contextWindowTokens = 24_700)
        context.claude.generations += GroundedGenerationOutput(validDraft().copy(summaryBlocks = emptyList()), USAGE)

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        val failed = context.jobStore.load(context.record.jobId)!!
        assertThat(context.claude.generateCalls).isEqualTo(1)
        assertThat(context.claude.repairCalls).isZero()
        assertThat(failed.status).isEqualTo(JobStatus.FAILED)
        assertThat(failed.error?.code).isEqualTo(ErrorCode.TRANSCRIPT_TOO_LONG_FOR_MODEL)
        assertThat(failed.result).isNull()
    }

    @Test
    fun `two invalid sections fail without repair`() {
        val context = Context()
        context.claude.generations +=
            GroundedGenerationOutput(
                validDraft().copy(summaryBlocks = emptyList(), highlights = emptyList()),
                USAGE,
            )

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        val failed = context.jobStore.load(context.record.jobId)!!
        assertThat(context.claude.generateCalls).isEqualTo(1)
        assertThat(context.claude.repairCalls).isZero()
        assertThat(failed.status).isEqualTo(JobStatus.FAILED)
        assertThat(failed.groundingStatus).isEqualTo(GroundingStatus.INVALID)
        assertThat(failed.result).isNull()
    }

    @Test
    fun `availability fallback uses only persisted candidate and preserves whole turns`() {
        val context = Context(eligibleFallbacks = listOf(OPENAI_MODEL))
        context.claude.generationFailures += GenerationError(ErrorCode.PROVIDER_UNAVAILABLE, "safe-unavailable")
        context.openai.generations += GroundedGenerationOutput(validDraft(), USAGE)

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        val saved = context.jobStore.load(context.record.jobId)!!
        assertThat(context.claude.generateCalls).isEqualTo(1)
        assertThat(context.openai.generateCalls).isEqualTo(1)
        assertThat(context.renderer.requests).allSatisfy { request ->
            assertThat(request.turns).containsExactlyElementsOf(context.turns)
        }
        assertThat(saved.actualModel).isEqualTo(OPENAI_MODEL)
    }

    @Test
    fun `newly available model is never consulted when it was not persisted as eligible`() {
        val context = Context()
        context.claude.generationFailures += GenerationError(ErrorCode.PROVIDER_UNAVAILABLE, "safe-unavailable")
        context.openai.generations += GroundedGenerationOutput(validDraft(), USAGE)

        context.executor.process(context.record, AiGenerationTestFixtures.NOW)

        val failed = context.jobStore.load(context.record.jobId)!!
        assertThat(context.claude.generateCalls).isEqualTo(1)
        assertThat(context.openai.generateCalls).isZero()
        assertThat(failed.status).isEqualTo(JobStatus.FAILED)
        assertThat(failed.result).isNull()
    }

    private class Context(
        eligibleFallbacks: List<ModelId> = emptyList(),
        contextWindowTokens: Long = 200_000,
    ) {
        val jobStore = FakeJobStore()
        val turns = validTurns()
        val meta = validMeta()
        val claude = FakeGroundedGenerator(Provider.CLAUDE)
        val openai = FakeGroundedGenerator(Provider.OPENAI)
        val renderer = RecordingRenderer()
        val auditPort = FakeAuditPort()
        val costGuard = FakeCostGuard()
        private val generators = mapOf(Provider.CLAUDE to claude, Provider.OPENAI to openai)
        private val modelCatalog =
            AiGenerationTestFixtures.defaultModelCatalog(
                setOf(AiGenerationTestFixtures.CLAUDE_MODEL, OPENAI_MODEL),
            )
        private val properties = AiGenerationTestFixtures.defaultProperties()
        val record =
            AiGenerationTestFixtures
                .jobRecord(status = JobStatus.RUNNING, stage = JobStage.PREPARING_TRANSCRIPT, sessionMeta = meta)
                .copy(
                    pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                    validatedTurns = turns,
                    eligibleFallbackModels = eligibleFallbacks,
                    groundingStatus = GroundingStatus.PENDING,
                ).also(jobStore::save)
        val executor =
            DefaultGroundedGenerationExecutor(
                jobStore,
                generators,
                GroundedInputBudgetGuard(
                    renderer,
                    ModelCapabilityCatalog { ModelCapability(contextWindowTokens, 64_000, true) },
                    properties,
                ),
                GroundedGenerationValidator(GroundedEvidenceProjector()),
                modelCatalog,
                auditPort,
                costGuard,
                FakeLatencyNotification(),
                properties,
                FakeClock(AiGenerationTestFixtures.NOW),
                fakeMetrics(),
                FakeSleeper(),
                ProviderFallbackChain(emptyMap(), modelCatalog, properties),
            )
    }

    private class RecordingRenderer : GroundedRequestRenderer {
        val requests = mutableListOf<GroundedRenderRequest>()

        override fun render(request: GroundedRenderRequest): RenderedGroundedRequest {
            requests += request
            val userPrompt =
                if (request.mode == GroundedRequestMode.REPAIR) {
                    "r".repeat(1_000)
                } else {
                    "whole-transcript"
                }
            return RenderedGroundedRequest("system", userPrompt, "{}", 16_384)
        }
    }

    private class FakeGroundedGenerator(
        override val provider: Provider,
    ) : WholeTranscriptGroundedGenerator {
        val generations = ArrayDeque<GroundedGenerationOutput>()
        val repairs = ArrayDeque<GroundedSectionRepairOutput>()
        val generationFailures = ArrayDeque<GenerationError>()
        val repairFailures = ArrayDeque<GenerationError>()
        var generateCalls = 0
        var repairCalls = 0
        var afterGenerate: () -> Unit = {}

        override fun generate(
            model: ModelId,
            request: RenderedGroundedRequest,
        ): GroundedGenerationOutput {
            generateCalls += 1
            generationFailures.removeFirstOrNull()?.let { throw LlmGenerationException(it) }
            return generations.removeFirst().also { afterGenerate() }
        }

        override fun repair(
            model: ModelId,
            section: GenerationItem,
            request: RenderedGroundedRequest,
        ): GroundedSectionRepairOutput {
            repairCalls += 1
            repairFailures.removeFirstOrNull()?.let { throw LlmGenerationException(it) }
            return repairs.removeFirst()
        }
    }

    private companion object {
        val OPENAI_MODEL = ModelId(Provider.OPENAI, "gpt-5.4-mini")
        val USAGE = TokenUsage(100, 0, 200)
        val REPAIR_USAGE = TokenUsage(50, 0, 75)

        fun validMeta(): SessionMeta =
            SessionMeta(
                UUID.fromString("00000000-0000-0000-0000-000000000001"),
                UUID.fromString("00000000-0000-0000-0000-000000000002"),
                7,
                "Public Test Book",
                "Public Author",
                LocalDate.of(2026, 7, 14),
                listOf("Alice"),
                AuthorNameMode.REAL,
            )

        fun validTurns(): List<ValidatedTranscriptTurn> =
            listOf(
                ValidatedTranscriptTurn(
                    "t000001",
                    "Alice",
                    UUID.fromString("00000000-0000-0000-0000-000000000011"),
                    0,
                    "A public-safe source statement.",
                ),
            )

        fun validDraft(): GroundedGenerationDraft =
            GroundedGenerationDraft(
                "readmates-grounded-generation:v2",
                7,
                "Public Test Book",
                LocalDate.of(2026, 7, 14),
                listOf(GroundedTextBlock("A careful opening.", listOf("t000001"))),
                listOf(GroundedAuthoredText("Alice", "A grounded note.", listOf("t000001"))),
                listOf(GroundedAuthoredText("Alice", "A concise review.", listOf("t000001"))),
                "session-feedback.md",
                listOf(
                    GroundedFeedbackSection("관찰자 노트", "Grounded observer note.", listOf("t000001")),
                    GroundedFeedbackSection("참여자별 피드백", participantMarkdown(), listOf("t000001")),
                ),
            )

        fun participantMarkdown(): String =
            """
            ### 01. Alice

            역할: 근거를 확인하는 참여자

            #### 참여 스타일

            발언의 전제를 확인했다.

            #### 실질 기여

            - 논의의 근거를 정리했다.

            #### 문제점과 자기모순

            ##### 1. 설명을 더 구체화할 수 있었다

            - 핵심: 설명의 범위가 좁았다.
            - 근거: 근거를 한 가지 제시했다.
            - 해석: 적용 조건을 덧붙이면 더 선명해진다.

            #### 실천 과제

            1. 다음 논의에서 적용 조건을 함께 말한다.

            #### 드러난 한 문장

            > 근거를 먼저 확인하겠습니다.

            맥락: 논의 기준을 정리하던 장면

            주석: 판단 과정을 보여준다.
            """.trimIndent()
    }
}

private operator fun TokenUsage.plus(other: TokenUsage): TokenUsage =
    TokenUsage(
        inputTokens + other.inputTokens,
        cachedInputTokens + other.cachedInputTokens,
        outputTokens + other.outputTokens,
    )
