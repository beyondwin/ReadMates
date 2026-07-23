package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.SectionReviewStatus
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.session.application.SessionRecordVisibility
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.time.LocalDate

class AiGenerationCommitRequestHasherTest {
    @Test
    fun `canonical framing is stable across review map order and separates ambiguous field boundaries`() {
        val base = snapshot(SessionImportV1Snapshot.AuthoredText("a", "b\u0000c"))
        val boundaryVariant = snapshot(SessionImportV1Snapshot.AuthoredText("a\u0000b", "c"))
        val orderedReviews =
            linkedMapOf(
                GenerationItem.SUMMARY to SectionReviewStatus.AI_GROUNDED_REVIEWED,
                GenerationItem.HIGHLIGHTS to SectionReviewStatus.USER_EDITED_CONFIRMED,
                GenerationItem.ONE_LINE_REVIEWS to SectionReviewStatus.AI_GROUNDED_REVIEWED,
                GenerationItem.FEEDBACK_DOCUMENT to SectionReviewStatus.AI_GROUNDED_REVIEWED,
            )

        val first =
            AiGenerationCommitRequestHasher.hash(
                SessionRecordVisibility.MEMBER,
                base,
                revision = 2,
                sectionReviews = orderedReviews,
                expectedDraftRevision = 7,
            )
        val reordered =
            AiGenerationCommitRequestHasher.hash(
                SessionRecordVisibility.MEMBER,
                base.copy(),
                revision = 2,
                sectionReviews = orderedReviews.entries.reversed().associate { it.toPair() },
                expectedDraftRevision = 7,
            )
        val distinct =
            AiGenerationCommitRequestHasher.hash(
                SessionRecordVisibility.MEMBER,
                boundaryVariant,
                revision = 2,
                sectionReviews = orderedReviews,
                expectedDraftRevision = 7,
            )

        assertThat(first).hasSize(64).isEqualTo(reordered)
        assertThat(distinct).isNotEqualTo(first)
    }

    private fun snapshot(highlight: SessionImportV1Snapshot.AuthoredText) =
        SessionImportV1Snapshot(
            format = "readmates-session-import:v1",
            sessionNumber = 3,
            bookTitle = "Canonical book",
            meetingDate = LocalDate.parse("2026-07-23"),
            summary = "Summary",
            highlights = listOf(highlight),
            oneLineReviews = listOf(SessionImportV1Snapshot.AuthoredText("reader", "review")),
            feedbackDocumentFileName = "feedback.md",
            feedbackDocumentMarkdown = "# Feedback\nbody",
        )
}
