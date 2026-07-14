package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.GroundedAuthoredText
import com.readmates.aigen.application.model.GroundedFeedbackSection
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundedTextBlock
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.time.LocalDate
import java.util.UUID

class GroundedEvidenceProjectorTest {
    private val projector = GroundedEvidenceProjector()

    @Test
    fun `projects target ids from revision section and ordinal`() {
        val bundle = projector.project(validDraft(), validTurns(), revision = 1)

        assertThat(bundle.targets.first().targetId).isEqualTo("r1:SUMMARY:0")
        assertThat(bundle.targets.map { it.targetId })
            .containsExactly(
                "r1:SUMMARY:0",
                "r1:HIGHLIGHTS:0",
                "r1:ONE_LINE_REVIEWS:0",
                "r1:FEEDBACK_DOCUMENT:0",
            )
    }

    @Test
    fun `excerpt is server sourced sanitized and limited by Unicode code points`() {
        val source = "😀".repeat(239) + "\u0000" + "끝추가"
        val turn = validTurns().single().copy(text = source)

        val excerpt = projector.project(validDraft(), listOf(turn), revision = 4).excerpts.single()

        assertThat(excerpt.excerpt.codePointCount(0, excerpt.excerpt.length)).isEqualTo(240)
        assertThat(excerpt.excerpt).doesNotContain("\u0000").startsWith("😀😀")
        assertThat(excerpt.truncated).isTrue()
    }

    @Test
    fun `model supplied text cannot become an evidence excerpt`() {
        val draft =
            validDraft().copy(
                summaryBlocks = listOf(GroundedTextBlock("MODEL CONTROLLED TEXT", listOf("t000001"))),
            )

        val excerpt = projector.project(draft, validTurns(), revision = 1).excerpts.single()

        assertThat(excerpt.excerpt).isEqualTo("SERVER SOURCE TEXT")
        assertThat(excerpt.excerpt).doesNotContain("MODEL CONTROLLED")
    }

    @Test
    fun `allowed transcript line and tab separators become safe whitespace`() {
        val turn = validTurns().single().copy(text = "not\nsupported\tnext")

        val excerpt = projector.project(validDraft(), listOf(turn), revision = 1).excerpts.single()

        assertThat(excerpt.excerpt).isEqualTo("not supported next")
    }

    @Test
    fun `duplicate evidence ids are deduplicated in first seen order`() {
        val turns =
            listOf(
                validTurns().single(),
                validTurns().single().copy(turnId = "t000002", startSeconds = 10, text = "SECOND SOURCE"),
            )
        val draft =
            validDraft().copy(
                summaryBlocks = listOf(GroundedTextBlock("Summary", listOf("t000002", "t000001", "t000002"))),
            )

        val bundle = projector.project(draft, turns, revision = 2)

        assertThat(bundle.targets.first().turnIds).containsExactly("t000002", "t000001")
        assertThat(bundle.excerpts.map { it.turnId }).containsExactly("t000002", "t000001")
    }

    @Test
    fun `unknown turn id fails closed without echoing the id`() {
        val draft =
            validDraft().copy(summaryBlocks = listOf(GroundedTextBlock("Summary", listOf("private-turn-value"))))

        assertThatThrownBy { projector.project(draft, validTurns(), revision = 1) }
            .isInstanceOf(IllegalArgumentException::class.java)
            .hasMessage("Evidence references an unknown turn")
            .hasMessageNotContaining("private-turn-value")
    }

    private fun validDraft(): GroundedGenerationDraft =
        GroundedGenerationDraft(
            format = "readmates-grounded-generation:v2",
            sessionNumber = 7,
            bookTitle = "Public Test Book",
            meetingDate = LocalDate.of(2026, 7, 14),
            summaryBlocks = listOf(GroundedTextBlock("Summary", listOf("t000001"))),
            highlights = listOf(GroundedAuthoredText("Alice", "Highlight", listOf("t000001"))),
            oneLineReviews = listOf(GroundedAuthoredText("Alice", "Review", listOf("t000001"))),
            feedbackDocumentFileName = "feedback.md",
            feedbackSections = listOf(GroundedFeedbackSection("관찰", "Feedback", listOf("t000001"))),
        )

    private fun validTurns(): List<ValidatedTranscriptTurn> =
        listOf(
            ValidatedTranscriptTurn(
                turnId = "t000001",
                speakerName = "Alice",
                speakerMembershipId = UUID.fromString("00000000-0000-0000-0000-000000000011"),
                startSeconds = 0,
                text = "SERVER SOURCE TEXT",
            ),
        )
}
