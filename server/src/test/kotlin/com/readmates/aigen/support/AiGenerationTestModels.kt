package com.readmates.aigen.support

import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedAuthoredText
import com.readmates.aigen.application.model.GroundedFeedbackSection
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundedTextBlock
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.GroundedGenerationOutput
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.time.LocalDate

data class SyntheticTranscriptTurn(
    val speaker: String,
    val at: String,
    val text: String,
)

/**
 * Canonical model IDs that the AI session-generation tests should reference.
 *
 * Production model IDs live in `application.yml` under
 * `readmates.aigen.pricing.*`. These constants mirror that allowlist so that
 * swapping a provider's default for a newer release is a one-line change here
 * (and matching `application.yml` pricing key), instead of editing scattered
 * hardcoded strings across every test fixture.
 */
object AiGenerationTestModels {
    const val CLAUDE_DEFAULT: String = "claude-sonnet-4-6"
    const val OPENAI_DEFAULT: String = "gpt-5.4-mini"
    const val GEMINI_DEFAULT: String = "gemini-3-flash-preview"

    fun groundedTranscript(turns: List<SyntheticTranscriptTurn>): String =
        buildList {
            add("Public Test Reading Club")
            add("2026. 7. 14. 오후 7:30 · 42분 10초")
            add(turns.map { it.speaker }.distinct().joinToString(", "))
            add("")
            turns.forEach { turn ->
                add("${turn.speaker} ${turn.at}")
                add(turn.text)
                add("")
            }
        }.joinToString("\n")
}

/** Public-safe deterministic provider used only by the grounded integration profile. */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled", "mock"], havingValue = "true")
class StubClaudeWholeTranscriptGroundedGenerator : WholeTranscriptGroundedGenerator {
    override val provider: Provider = Provider.CLAUDE

    override fun generate(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GroundedGenerationOutput = GroundedGenerationOutput(draft(), USAGE)

    override fun repair(
        model: ModelId,
        section: GenerationItem,
        request: RenderedGroundedRequest,
    ): GroundedSectionRepairOutput {
        val draft = draft()
        return when (section) {
            GenerationItem.SUMMARY -> GroundedSectionRepairOutput.Summary(draft.summaryBlocks, USAGE)
            GenerationItem.HIGHLIGHTS -> GroundedSectionRepairOutput.Highlights(draft.highlights, USAGE)
            GenerationItem.ONE_LINE_REVIEWS -> GroundedSectionRepairOutput.OneLineReviews(draft.oneLineReviews, USAGE)
            GenerationItem.FEEDBACK_DOCUMENT ->
                GroundedSectionRepairOutput.FeedbackDocument(
                    draft.feedbackDocumentFileName,
                    draft.feedbackSections,
                    USAGE,
                )
        }
    }

    private fun draft(): GroundedGenerationDraft =
        GroundedGenerationDraft(
            format = "readmates-grounded-generation:v2",
            sessionNumber = 8961,
            bookTitle = "Public Test Book",
            meetingDate = LocalDate.of(2026, 7, 14),
            summaryBlocks =
                listOf(
                    GroundedTextBlock(
                        "A public-safe grounded summary.",
                        listOf("t000001", "t000002"),
                    ),
                ),
            highlights =
                listOf(
                    GroundedAuthoredText("PublicMemberA", "A public-safe first highlight.", listOf("t000001")),
                    GroundedAuthoredText("PublicMemberB", "A public-safe second highlight.", listOf("t000002")),
                ),
            oneLineReviews =
                listOf(
                    GroundedAuthoredText("PublicMemberA", "A public-safe first review.", listOf("t000001")),
                    GroundedAuthoredText("PublicMemberB", "A public-safe second review.", listOf("t000002")),
                ),
            feedbackDocumentFileName = "session-8961-feedback.md",
            feedbackSections =
                listOf(
                    GroundedFeedbackSection(
                        "관찰자 노트",
                        "두 참여자는 공개 합성 문장으로 근거를 확인했다.",
                        listOf("t000001", "t000002"),
                    ),
                    GroundedFeedbackSection(
                        "참여자별 피드백",
                        participantFeedback(),
                        listOf("t000001", "t000002"),
                    ),
                ),
        )

    private fun participantFeedback(): String =
        listOf(
            participantSection(1, "PublicMemberA", "첫 공개 합성 발언"),
            participantSection(2, "PublicMemberB", "둘째 공개 합성 발언"),
        ).joinToString("\n\n")

    private fun participantSection(
        ordinal: Int,
        speaker: String,
        quote: String,
    ): String =
        """
        ### ${ordinal.toString().padStart(2, '0')}. $speaker

        역할: 공개 합성 테스트 참여자

        #### 참여 스타일

        근거를 차분히 확인했다.

        #### 실질 기여

        - 공개 합성 관찰을 공유했다.

        #### 문제점과 자기모순

        ##### 1. 설명을 더 구체화할 수 있었다

        - 핵심: 설명 범위가 짧았다.
        - 근거: 하나의 합성 예시를 제시했다.
        - 해석: 적용 조건을 덧붙이면 더 선명하다.

        #### 실천 과제

        1. 다음 공개 테스트에서 적용 조건을 함께 말한다.

        #### 드러난 한 문장

        > $quote

        맥락: 공개 합성 테스트 장면

        주석: 테스트 판단 과정을 보여준다.
        """.trimIndent()

    private companion object {
        val USAGE =
            TokenUsage(
                nonCachedInputTokens = 100,
                cacheWriteInputTokens = 0,
                cacheReadInputTokens = 0,
                outputTokens = 200,
            )
    }
}
