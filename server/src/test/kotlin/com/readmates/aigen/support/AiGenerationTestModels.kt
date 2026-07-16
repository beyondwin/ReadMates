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
import tools.jackson.databind.ObjectMapper
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
class StubClaudeWholeTranscriptGroundedGenerator(
    private val objectMapper: ObjectMapper,
) : WholeTranscriptGroundedGenerator {
    override val provider: Provider = Provider.CLAUDE

    override fun generate(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GroundedGenerationOutput = GroundedGenerationOutput(draft(request), USAGE)

    override fun repair(
        model: ModelId,
        section: GenerationItem,
        request: RenderedGroundedRequest,
    ): GroundedSectionRepairOutput {
        val draft = draft(request)
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

    private fun draft(request: RenderedGroundedRequest): GroundedGenerationDraft {
        val envelope = objectMapper.readValue(request.userText, StubEnvelope::class.java)
        val sessionNumber = envelope.session.sessionNumber
        val bookTitle = envelope.session.bookTitle
        val meetingDate = LocalDate.parse(envelope.session.meetingDate)
        val speakers = envelope.allowedSpeakerNames
        val turns = envelope.turns
        val firstTurnId = turns.first().turnId
        val turnIds = turns.map(StubTurn::turnId)
        val requestedSection = envelope.requestedSection
        val summary =
            if (requestedSection == GenerationItem.SUMMARY.name) {
                "Regenerated summary for $bookTitle."
            } else if (sessionNumber == 8961) {
                "A public-safe grounded summary."
            } else {
                "Stub summary for $bookTitle (session $sessionNumber)."
            }
        val firstSpeaker = speakers.first()
        val highlights =
            (1..2).map { ordinal ->
                GroundedAuthoredText(
                    firstSpeaker,
                    "Stub highlight #$ordinal for $bookTitle",
                    listOf(firstTurnId),
                )
            }
        val reviews =
            speakers.map { speaker ->
                val speakerTurnId =
                    turns
                        .firstOrNull { it.speakerName == speaker }
                        ?.turnId
                        ?: firstTurnId
                GroundedAuthoredText(speaker, "Stub one-line review by $speaker", listOf(speakerTurnId))
            }
        return GroundedGenerationDraft(
            format = "readmates-grounded-generation:v2",
            sessionNumber = sessionNumber,
            bookTitle = bookTitle,
            meetingDate = meetingDate,
            summaryBlocks = listOf(GroundedTextBlock(summary, turnIds)),
            highlights = highlights,
            oneLineReviews = reviews,
            feedbackDocumentFileName = "session-$sessionNumber-feedback.md",
            feedbackSections =
                listOf(
                    GroundedFeedbackSection(
                        "관찰자 노트",
                        "Stub observer notes.",
                        turnIds,
                    ),
                    GroundedFeedbackSection(
                        "참여자별 피드백",
                        participantFeedback(speakers, turns.map(StubTurn::text)),
                        turnIds,
                    ),
                ),
        )
    }

    private fun participantFeedback(
        speakers: List<String>,
        quotes: List<String>,
    ): String =
        speakers
            .mapIndexed { index, speaker ->
                participantSection(index + 1, speaker, quotes.getOrElse(index) { quotes.first() })
            }.joinToString("\n\n")

    private data class StubEnvelope(
        val mode: String,
        val session: StubSession,
        val allowedSpeakerNames: List<String>,
        val hostInstructions: String? = null,
        val turns: List<StubTurn>,
        val currentDraft: Any? = null,
        val requestedSection: String? = null,
    )

    private data class StubSession(
        val sessionNumber: Int,
        val bookTitle: String,
        val bookAuthor: String,
        val meetingDate: String,
    )

    private data class StubTurn(
        val turnId: String,
        val startSeconds: Int,
        val speakerName: String,
        val text: String,
    )

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

/** Public-safe OpenAI variant that keeps the API provider matrix on the grounded-only path. */
@Component
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled", "mock"], havingValue = "true")
class StubOpenAiWholeTranscriptGroundedGenerator(
    private val delegate: StubClaudeWholeTranscriptGroundedGenerator,
) : WholeTranscriptGroundedGenerator {
    override val provider: Provider = Provider.OPENAI

    override fun generate(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GroundedGenerationOutput = delegate.generate(model, request)

    override fun repair(
        model: ModelId,
        section: GenerationItem,
        request: RenderedGroundedRequest,
    ): GroundedSectionRepairOutput = delegate.repair(model, section, request)
}
