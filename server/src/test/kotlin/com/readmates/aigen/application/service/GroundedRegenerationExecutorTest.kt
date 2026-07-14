package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
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
import com.readmates.aigen.application.port.out.GroundedRenderRequest
import com.readmates.aigen.application.port.out.GroundedRequestMode
import com.readmates.aigen.application.port.out.GroundedRequestRenderer
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.GuardDecision
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

class GroundedRegenerationExecutorTest {
    @Test
    fun `matching revision regenerates one section with whole transcript and increments revision`() {
        val context = Context()
        context.generator.repairOutput =
            GroundedSectionRepairOutput.Summary(
                listOf(GroundedTextBlock("A regenerated grounded summary.", listOf("t000001"))),
                USAGE,
            )

        val result = context.executor.regenerate(context.record, GenerationItem.SUMMARY, 1, null, null)

        val saved = context.jobStore.load(context.record.jobId)!!
        assertThat(context.generator.calls).isEqualTo(1)
        assertThat(context.renderer.lastRequest?.mode).isEqualTo(GroundedRequestMode.REGENERATE_SECTION)
        assertThat(context.renderer.lastRequest?.turns).containsExactlyElementsOf(context.turns)
        assertThat(result.revision).isEqualTo(2)
        assertThat(result.result?.summary).isEqualTo("A regenerated grounded summary.")
        assertThat(result.evidence?.targets).allSatisfy { target -> assertThat(target.targetId).startsWith("r2:") }
        assertThat(saved.revision).isEqualTo(2)
        assertThat(saved.result?.highlights).isEqualTo(context.record.result?.highlights)
        val audit = context.auditPort.entries.single()
        assertThat(audit.pipelineVersion).isEqualTo("GROUNDED_WHOLE_TRANSCRIPT")
        assertThat(audit.inputTurnCount).isEqualTo(1)
        assertThat(audit.speakerCount).isEqualTo(1)
        assertThat(audit.groundingStatus).isEqualTo("VALID")
    }

    @Test
    fun `stale revision returns conflict before provider cost or call counter`() {
        val context = Context()

        assertThatThrownBy {
            context.executor.regenerate(context.record, GenerationItem.SUMMARY, 0, null, null)
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) { failure ->
            assertThat(failure.code).isEqualTo(ErrorCode.STALE_GENERATION_REVISION)
        }
        assertThat(context.generator.calls).isZero()
        assertThat(context.jobStore.load(context.record.jobId)?.llmCallCount).isEqualTo(1)
        assertThat(context.costGuard.recorded).isEmpty()
    }

    @Test
    fun `grounded regeneration call cap fails without provider invocation`() {
        val context = Context(llmCallCount = 3)

        assertThatThrownBy {
            context.executor.regenerate(context.record, GenerationItem.SUMMARY, 1, null, null)
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) { failure ->
            assertThat(failure.code).isEqualTo(ErrorCode.MAX_CALLS_EXCEEDED)
        }
        assertThat(context.generator.calls).isZero()
    }

    @Test
    fun `grounded regeneration cost guard denies before call counter and provider`() {
        val context = Context()
        context.costGuard.decision = GuardDecision.Deny(ErrorCode.CLUB_MONTHLY_CAP_EXCEEDED)

        assertThatThrownBy {
            context.executor.regenerate(context.record, GenerationItem.SUMMARY, 1, null, null)
        }.isInstanceOfSatisfying(AiGenerationException.Coded::class.java) { failure ->
            assertThat(failure.code).isEqualTo(ErrorCode.CLUB_MONTHLY_CAP_EXCEEDED)
        }
        assertThat(context.generator.calls).isZero()
        assertThat(context.jobStore.load(context.record.jobId)?.llmCallCount).isEqualTo(1)
    }

    private class Context(
        llmCallCount: Int = 1,
    ) {
        val jobStore = FakeJobStore()
        val turns = validTurns()
        val meta = validMeta()
        val draft = validDraft()
        private val validator = GroundedGenerationValidator(GroundedEvidenceProjector())
        private val valid = validator.validate(draft, turns, meta, 1) as GroundedValidationResult.Valid
        val model = AiGenerationTestFixtures.CLAUDE_MODEL
        private val modelCatalog = AiGenerationTestFixtures.defaultModelCatalog(setOf(model))
        private val properties = AiGenerationTestFixtures.defaultProperties()
        val renderer = RecordingRenderer()
        val generator = FakeRepairGenerator()
        val costGuard = FakeCostGuard()
        val auditPort = FakeAuditPort()
        val record =
            AiGenerationTestFixtures
                .jobRecord(
                    status = JobStatus.SUCCEEDED,
                    stage = JobStage.READY,
                    result = valid.snapshot,
                    sessionMeta = meta,
                ).copy(
                    pipelineMode = AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT,
                    validatedTurns = turns,
                    revision = 1,
                    groundingStatus = GroundingStatus.VALID,
                    groundedDraft = draft,
                    evidence = valid.evidence,
                    llmCallCount = llmCallCount,
                ).also(jobStore::save)
        val executor =
            DefaultGroundedRegenerationExecutor(
                jobStore,
                mapOf(Provider.CLAUDE to generator),
                GroundedInputBudgetGuard(
                    renderer,
                    ModelCapabilityCatalog { ModelCapability(200_000, 64_000, true) },
                    properties,
                ),
                validator,
                modelCatalog,
                auditPort,
                costGuard,
                properties,
                FakeClock(AiGenerationTestFixtures.NOW),
                fakeMetrics(),
            )
    }

    private class RecordingRenderer : GroundedRequestRenderer {
        var lastRequest: GroundedRenderRequest? = null

        override fun render(request: GroundedRenderRequest): RenderedGroundedRequest {
            lastRequest = request
            return RenderedGroundedRequest("system", "whole-transcript", "{}", 16_384)
        }
    }

    private class FakeRepairGenerator : WholeTranscriptGroundedGenerator {
        override val provider = Provider.CLAUDE
        lateinit var repairOutput: GroundedSectionRepairOutput
        var calls = 0

        override fun generate(
            model: ModelId,
            request: RenderedGroundedRequest,
        ) = error("not used")

        override fun repair(
            model: ModelId,
            section: GenerationItem,
            request: RenderedGroundedRequest,
        ): GroundedSectionRepairOutput {
            calls += 1
            return repairOutput
        }
    }

    private companion object {
        val USAGE = TokenUsage(50, 0, 75)

        fun validMeta() =
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

        fun validTurns() =
            listOf(
                ValidatedTranscriptTurn(
                    "t000001",
                    "Alice",
                    UUID.fromString("00000000-0000-0000-0000-000000000011"),
                    0,
                    "A public-safe source statement.",
                ),
            )

        fun validDraft() =
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

        fun participantMarkdown() =
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
