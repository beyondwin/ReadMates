package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedAuthoredText
import com.readmates.aigen.application.model.GroundedFeedbackSection
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundedTextBlock
import com.readmates.aigen.application.model.GroundingFailureReason
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.feedback.application.FeedbackDocumentParser
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import java.time.LocalDate
import java.util.UUID

class GroundedGenerationValidatorTest {
    private val projector = GroundedEvidenceProjector()
    private val validator = GroundedGenerationValidator(projector)
    private val turns = validTurns()
    private val meta = validMeta()

    @Test
    fun `valid draft builds existing import snapshot and evidence for every block`() {
        val result = validator.validate(validDraft(), turns, meta, revision = 1)

        assertThat(result).isInstanceOf(GroundedValidationResult.Valid::class.java)
        val valid = result as GroundedValidationResult.Valid
        assertThat(valid.snapshot.format).isEqualTo("readmates-session-import:v1")
        assertThat(valid.snapshot.summary).isEqualTo("A careful opening.\n\nA practical conclusion.")
        assertThat(valid.snapshot.oneLineReviews.map { it.authorName }).containsExactly("Alice", "Bob")
        assertThat(valid.snapshot.feedbackDocumentMarkdown)
            .startsWith("<!-- readmates-feedback:v1 -->\n\n# 독서모임 7차 피드백")
            .contains("## 메타", "## 관찰자 노트", "## 참여자별 피드백")
        val parsedFeedback = FeedbackDocumentParser().parse(valid.snapshot.feedbackDocumentMarkdown)
        assertThat(parsedFeedback.participants.map { it.name }).containsExactly("Alice", "Bob")
        assertThat(valid.evidence.targets).hasSize(8)
        assertThat(valid.evidence.targets.map { it.targetId }).contains("r1:SUMMARY:0", "r1:FEEDBACK_DOCUMENT:1")
    }

    @Test
    fun `session metadata mismatch is terminal`() {
        val result = validator.validate(validDraft().copy(bookTitle = "Different"), turns, meta, revision = 1)

        assertInvalid(result, GroundingFailureReason.SESSION_METADATA_MISMATCH)
    }

    @Test
    fun `highlight count outside one through six is repairable as highlights only`() {
        val result = validator.validate(validDraft().copy(highlights = emptyList()), turns, meta, revision = 1)

        assertRepairable(result, GenerationItem.HIGHLIGHTS, GroundingFailureReason.HIGHLIGHTS_OUT_OF_RANGE)
    }

    @Test
    fun `one line reviews must contain each transcript speaker exactly once`() {
        val duplicate =
            validDraft().oneLineReviews.map { it.copy(authorName = "Alice", evidenceTurnIds = listOf("t000001")) }

        val result = validator.validate(validDraft().copy(oneLineReviews = duplicate), turns, meta, revision = 1)

        assertRepairable(result, GenerationItem.ONE_LINE_REVIEWS, GroundingFailureReason.ONE_LINE_AUTHOR_SET_MISMATCH)
    }

    @Test
    fun `author names require exact normalized transcript identity`() {
        val result =
            validator.validate(
                validDraft().copy(highlights = listOf(validDraft().highlights.first().copy(authorName = " Alice "))),
                turns,
                meta,
                revision = 1,
            )

        assertRepairable(result, GenerationItem.HIGHLIGHTS, GroundingFailureReason.AUTHOR_NOT_ALLOWED)
    }

    @Test
    fun `canonical composed author matches a decomposed validated speaker identity`() {
        val decomposedAlice = "A\u0301lice"
        val composedAlice = "Álice"
        val canonicalTurns =
            turns.map { turn ->
                if (turn.speakerName == "Alice") turn.copy(speakerName = decomposedAlice) else turn
            }
        val draft =
            validDraft().copy(
                highlights =
                    validDraft().highlights.map { item ->
                        if (item.authorName == "Alice") item.copy(authorName = composedAlice) else item
                    },
                oneLineReviews =
                    validDraft().oneLineReviews.map { item ->
                        if (item.authorName == "Alice") item.copy(authorName = composedAlice) else item
                    },
                feedbackSections = validFeedbackSections(composedAlice, "Bob"),
            )

        val result = validator.validate(draft, canonicalTurns, meta, revision = 1)

        assertThat(result).isInstanceOf(GroundedValidationResult.Valid::class.java)
    }

    @Test
    fun `every block requires current evidence turn ids`() {
        val missing = validDraft().summaryBlocks.first().copy(evidenceTurnIds = emptyList())
        val unknown = validDraft().summaryBlocks.last().copy(evidenceTurnIds = listOf("t999999"))

        val result =
            validator.validate(
                validDraft().copy(summaryBlocks = listOf(missing, unknown)),
                turns,
                meta,
                revision = 1,
            )

        assertThat(result).isInstanceOf(GroundedValidationResult.Repairable::class.java)
        assertThat((result as GroundedValidationResult.Repairable).reasons)
            .containsExactlyInAnyOrder(
                GroundingFailureReason.EVIDENCE_REQUIRED,
                GroundingFailureReason.EVIDENCE_TURN_NOT_FOUND,
            )
    }

    @Test
    fun `authored evidence must include a turn by the same author`() {
        val result =
            validator.validate(
                validDraft().copy(
                    highlights =
                        listOf(
                            GroundedAuthoredText("Alice", "A grounded note.", listOf("t000002")),
                        ),
                ),
                turns,
                meta,
                revision = 1,
            )

        assertRepairable(result, GenerationItem.HIGHLIGHTS, GroundingFailureReason.AUTHOR_EVIDENCE_MISMATCH)
    }

    @Test
    fun `feedback document wrapper is server owned and section structure is validated`() {
        val result =
            validator.validate(
                validDraft().copy(
                    feedbackSections = listOf(GroundedFeedbackSection("bad\nheading", "Body", listOf("t000001"))),
                ),
                turns,
                meta,
                revision = 1,
            )

        assertRepairable(result, GenerationItem.FEEDBACK_DOCUMENT, GroundingFailureReason.FEEDBACK_TEMPLATE_INVALID)
    }

    @Test
    fun `feedback section markdown cannot inject server owned marker or top level headings`() {
        val injected =
            validFeedbackSections("Alice", "Bob").map { section ->
                if (section.heading == "관찰자 노트") {
                    section.copy(markdown = "Grounded observer note.\n\n## 참여자별 피드백\n\nInjected structure")
                } else {
                    section
                }
            }

        val result = validator.validate(validDraft().copy(feedbackSections = injected), turns, meta, revision = 1)

        assertRepairable(result, GenerationItem.FEEDBACK_DOCUMENT, GroundingFailureReason.FEEDBACK_TEMPLATE_INVALID)
    }

    @ParameterizedTest
    @ValueSource(strings = ["../feedback.md", "folder\\feedback.md", "FEEDBACK.MD"])
    fun `feedback filename matches downstream import safety rules`(unsafeFileName: String) {
        val result =
            validator.validate(
                validDraft().copy(feedbackDocumentFileName = unsafeFileName),
                turns,
                meta,
                revision = 1,
            )

        assertRepairable(result, GenerationItem.FEEDBACK_DOCUMENT, GroundingFailureReason.FEEDBACK_TEMPLATE_INVALID)
    }

    @Test
    fun `feedback filename is included in deterministic pii rejection`() {
        val result =
            validator.validate(
                validDraft().copy(feedbackDocumentFileName = "person@example.com.md"),
                turns,
                meta,
                revision = 1,
            )

        assertRepairable(result, GenerationItem.FEEDBACK_DOCUMENT, GroundingFailureReason.PII_DETECTED)
    }

    @ParameterizedTest
    @ValueSource(
        strings = [
            "contact person@example.com later",
            "call 010-1234-5678 later",
            "identifier 900101-1234567 must not appear",
        ],
    )
    fun `deterministic pii patterns reject generated section text`(unsafe: String) {
        val result =
            validator.validate(
                validDraft().copy(summaryBlocks = listOf(GroundedTextBlock(unsafe, listOf("t000001")))),
                turns,
                meta,
                revision = 1,
            )

        assertRepairable(result, GenerationItem.SUMMARY, GroundingFailureReason.PII_DETECTED)
    }

    @Test
    fun `benign numeric and at-sign text is not classified as pii`() {
        val safe = "Version 1.2 met at 10:30 and scored 010 points."

        val result =
            validator.validate(
                validDraft().copy(summaryBlocks = listOf(GroundedTextBlock(safe, listOf("t000001")))),
                turns,
                meta,
                revision = 1,
            )

        assertThat(result).isInstanceOf(GroundedValidationResult.Valid::class.java)
    }

    @Test
    fun `multiple invalid sections are terminal instead of requesting multiple repairs`() {
        val result =
            validator.validate(
                validDraft().copy(
                    summaryBlocks = emptyList(),
                    oneLineReviews = emptyList(),
                ),
                turns,
                meta,
                revision = 1,
            )

        assertThat(result).isInstanceOf(GroundedValidationResult.Invalid::class.java)
        assertThat((result as GroundedValidationResult.Invalid).reasons)
            .contains(GroundingFailureReason.SECTION_EMPTY, GroundingFailureReason.ONE_LINE_AUTHOR_SET_MISMATCH)
    }

    private fun assertRepairable(
        result: GroundedValidationResult,
        section: GenerationItem,
        reason: GroundingFailureReason,
    ) {
        assertThat(result).isInstanceOf(GroundedValidationResult.Repairable::class.java)
        val repairable = result as GroundedValidationResult.Repairable
        assertThat(repairable.section).isEqualTo(section)
        assertThat(repairable.reasons).contains(reason)
    }

    private fun assertInvalid(
        result: GroundedValidationResult,
        reason: GroundingFailureReason,
    ) {
        assertThat(result).isInstanceOf(GroundedValidationResult.Invalid::class.java)
        assertThat((result as GroundedValidationResult.Invalid).reasons).contains(reason)
    }

    private fun validDraft(): GroundedGenerationDraft =
        GroundedGenerationDraft(
            format = "readmates-grounded-generation:v2",
            sessionNumber = 7,
            bookTitle = "Public Test Book",
            meetingDate = LocalDate.of(2026, 7, 14),
            summaryBlocks =
                listOf(
                    GroundedTextBlock("A careful opening.", listOf("t000001")),
                    GroundedTextBlock("A practical conclusion.", listOf("t000002")),
                ),
            highlights =
                listOf(
                    GroundedAuthoredText("Alice", "A grounded note.", listOf("t000001")),
                    GroundedAuthoredText("Bob", "A second grounded note.", listOf("t000002")),
                ),
            oneLineReviews =
                listOf(
                    GroundedAuthoredText("Alice", "A concise review.", listOf("t000001")),
                    GroundedAuthoredText("Bob", "Another concise review.", listOf("t000002")),
                ),
            feedbackDocumentFileName = "session-feedback.md",
            feedbackSections = validFeedbackSections("Alice", "Bob"),
        )

    private fun validFeedbackSections(
        firstName: String,
        secondName: String,
    ): List<GroundedFeedbackSection> =
        listOf(
            GroundedFeedbackSection("관찰자 노트", "Grounded observer note.", listOf("t000001")),
            GroundedFeedbackSection(
                "참여자별 피드백",
                validParticipantMarkdown(firstName, secondName),
                listOf("t000001", "t000002"),
            ),
        )

    private fun validParticipantMarkdown(
        firstName: String,
        secondName: String,
    ): String =
        listOf(firstName, secondName)
            .mapIndexed { index, name ->
                """
                ### ${(index + 1).toString().padStart(2, '0')}. $name

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
            }.joinToString("\n\n")

    private fun validTurns(): List<ValidatedTranscriptTurn> =
        listOf(
            ValidatedTranscriptTurn(
                "t000001",
                "Alice",
                UUID.fromString("00000000-0000-0000-0000-000000000011"),
                0,
                "A public-safe source statement.",
            ),
            ValidatedTranscriptTurn(
                "t000002",
                "Bob",
                UUID.fromString("00000000-0000-0000-0000-000000000012"),
                65,
                "Another public-safe source statement.",
            ),
        )

    private fun validMeta(): SessionMeta =
        SessionMeta(
            sessionId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
            sessionNumber = 7,
            bookTitle = "Public Test Book",
            bookAuthor = "Public Author",
            meetingDate = LocalDate.of(2026, 7, 14),
            expectedAuthorNames = listOf("Alice", "Bob"),
            authorNameMode = AuthorNameMode.REAL,
        )
}
