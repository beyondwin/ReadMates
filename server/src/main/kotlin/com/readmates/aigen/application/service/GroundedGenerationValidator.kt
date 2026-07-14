package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedAuthoredText
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundingFailureReason
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import com.readmates.feedback.application.FeedbackDocumentParser
import org.springframework.stereotype.Component
import java.text.Normalizer

sealed interface GroundedValidationResult {
    data class Valid(
        val snapshot: SessionImportV1Snapshot,
        val evidence: GroundedEvidenceBundle,
    ) : GroundedValidationResult

    data class Repairable(
        val section: GenerationItem,
        val reasons: Set<GroundingFailureReason>,
    ) : GroundedValidationResult

    data class Invalid(
        val reasons: Set<GroundingFailureReason>,
    ) : GroundedValidationResult
}

@Component
class GroundedGenerationValidator(
    private val evidenceProjector: GroundedEvidenceProjector,
) {
    fun validate(
        draft: GroundedGenerationDraft,
        turns: List<ValidatedTranscriptTurn>,
        sessionMeta: SessionMeta,
        revision: Long,
    ): GroundedValidationResult {
        require(revision > 0) { "Generation revision must be positive" }
        val globalReasons = linkedSetOf<GroundingFailureReason>()
        val sectionReasons = linkedMapOf<GenerationItem, MutableSet<GroundingFailureReason>>()
        val turnsById = turns.associateBy { it.turnId }

        if (turns.isEmpty() || turnsById.size != turns.size) {
            globalReasons += GroundingFailureReason.SOURCE_TURNS_INVALID
        }
        if (!metadataMatches(draft, sessionMeta)) {
            globalReasons += GroundingFailureReason.SESSION_METADATA_MISMATCH
        }

        validateSummary(draft, turnsById, sectionReasons)
        validateHighlights(draft, turnsById, sectionReasons)
        validateOneLineReviews(draft, turnsById, sectionReasons)
        validateFeedback(draft, turnsById, sessionMeta, sectionReasons)

        return when {
            globalReasons.isNotEmpty() || sectionReasons.size > 1 ->
                GroundedValidationResult.Invalid(
                    buildSet {
                        addAll(globalReasons)
                        sectionReasons.values.forEach(::addAll)
                    },
                )
            sectionReasons.size == 1 -> {
                val (section, reasons) = sectionReasons.entries.single()
                GroundedValidationResult.Repairable(section, reasons.toSet())
            }
            else ->
                GroundedValidationResult.Valid(
                    snapshot = projectSnapshot(draft, sessionMeta, turns),
                    evidence = evidenceProjector.project(draft, turns, revision),
                )
        }
    }

    private fun metadataMatches(
        draft: GroundedGenerationDraft,
        meta: SessionMeta,
    ): Boolean =
        draft.format == GROUNDED_FORMAT &&
            draft.sessionNumber == meta.sessionNumber &&
            draft.bookTitle == meta.bookTitle &&
            draft.meetingDate == meta.meetingDate

    private fun validateSummary(
        draft: GroundedGenerationDraft,
        turnsById: Map<String, ValidatedTranscriptTurn>,
        reasons: MutableMap<GenerationItem, MutableSet<GroundingFailureReason>>,
    ) {
        val section = GenerationItem.SUMMARY
        if (draft.summaryBlocks.isEmpty() || draft.summaryBlocks.any { it.text.isBlank() }) {
            reasons.add(section, GroundingFailureReason.SECTION_EMPTY)
        }
        draft.summaryBlocks.forEach { block ->
            validateEvidence(section, block.evidenceTurnIds, turnsById, reasons)
            if (GroundedPiiDetector.contains(block.text)) reasons.add(section, GroundingFailureReason.PII_DETECTED)
        }
    }

    private fun validateHighlights(
        draft: GroundedGenerationDraft,
        turnsById: Map<String, ValidatedTranscriptTurn>,
        reasons: MutableMap<GenerationItem, MutableSet<GroundingFailureReason>>,
    ) {
        val section = GenerationItem.HIGHLIGHTS
        if (draft.highlights.size !in HIGHLIGHTS_RANGE) {
            reasons.add(section, GroundingFailureReason.HIGHLIGHTS_OUT_OF_RANGE)
        }
        validateAuthoredItems(section, draft.highlights, turnsById, reasons)
    }

    private fun validateOneLineReviews(
        draft: GroundedGenerationDraft,
        turnsById: Map<String, ValidatedTranscriptTurn>,
        reasons: MutableMap<GenerationItem, MutableSet<GroundingFailureReason>>,
    ) {
        val section = GenerationItem.ONE_LINE_REVIEWS
        val speakerNames = turnsById.values.map { normalizeAuthorName(it.speakerName) }.toSet()
        val authorNames = draft.oneLineReviews.map { it.authorName }
        if (authorNames.size != authorNames.toSet().size || authorNames.toSet() != speakerNames) {
            reasons.add(section, GroundingFailureReason.ONE_LINE_AUTHOR_SET_MISMATCH)
        }
        validateAuthoredItems(section, draft.oneLineReviews, turnsById, reasons)
    }

    private fun validateAuthoredItems(
        section: GenerationItem,
        items: List<GroundedAuthoredText>,
        turnsById: Map<String, ValidatedTranscriptTurn>,
        reasons: MutableMap<GenerationItem, MutableSet<GroundingFailureReason>>,
    ) {
        val speakerNames = turnsById.values.map { normalizeAuthorName(it.speakerName) }.toSet()
        items.forEach { item ->
            if (item.text.isBlank()) reasons.add(section, GroundingFailureReason.SECTION_EMPTY)
            if (item.authorName !in speakerNames || normalizeAuthorName(item.authorName) != item.authorName) {
                reasons.add(section, GroundingFailureReason.AUTHOR_NOT_ALLOWED)
            }
            validateEvidence(section, item.evidenceTurnIds, turnsById, reasons)
            val hasOwnEvidence =
                item.evidenceTurnIds
                    .mapNotNull(turnsById::get)
                    .any { normalizeAuthorName(it.speakerName) == item.authorName }
            if (!hasOwnEvidence) reasons.add(section, GroundingFailureReason.AUTHOR_EVIDENCE_MISMATCH)
            if (GroundedPiiDetector.contains(item.text)) reasons.add(section, GroundingFailureReason.PII_DETECTED)
        }
    }

    private fun validateFeedback(
        draft: GroundedGenerationDraft,
        turnsById: Map<String, ValidatedTranscriptTurn>,
        meta: SessionMeta,
        reasons: MutableMap<GenerationItem, MutableSet<GroundingFailureReason>>,
    ) {
        val section = GenerationItem.FEEDBACK_DOCUMENT
        val fileName = draft.feedbackDocumentFileName
        val validHeadings = draft.feedbackSections.map { it.heading } == FEEDBACK_SECTION_HEADINGS
        if (!isSafeFeedbackFileName(fileName) || !validHeadings) {
            reasons.add(section, GroundingFailureReason.FEEDBACK_TEMPLATE_INVALID)
        }
        if (GroundedPiiDetector.contains(fileName)) reasons.add(section, GroundingFailureReason.PII_DETECTED)
        draft.feedbackSections.forEach { feedback ->
            if (
                !isSafeFeedbackHeading(feedback.heading) ||
                feedback.markdown.isBlank() ||
                containsServerOwnedFeedbackStructure(feedback.markdown)
            ) {
                reasons.add(section, GroundingFailureReason.FEEDBACK_TEMPLATE_INVALID)
            }
            validateEvidence(section, feedback.evidenceTurnIds, turnsById, reasons)
            if (feedbackContainsPii(feedback.heading, feedback.markdown)) {
                reasons.add(section, GroundingFailureReason.PII_DETECTED)
            }
        }
        val speakerNames = turnsById.values.map { normalizeAuthorName(it.speakerName) }.distinct()
        val feedbackDocument = buildFeedbackDocument(draft, meta, speakerNames)
        if (!validFeedbackDocument(feedbackDocument, speakerNames)) {
            reasons.add(section, GroundingFailureReason.FEEDBACK_TEMPLATE_INVALID)
        }
    }

    private fun validateEvidence(
        section: GenerationItem,
        evidenceTurnIds: List<String>,
        turnsById: Map<String, ValidatedTranscriptTurn>,
        reasons: MutableMap<GenerationItem, MutableSet<GroundingFailureReason>>,
    ) {
        if (evidenceTurnIds.isEmpty()) {
            reasons.add(section, GroundingFailureReason.EVIDENCE_REQUIRED)
        }
        if (evidenceTurnIds.any { it !in turnsById }) {
            reasons.add(section, GroundingFailureReason.EVIDENCE_TURN_NOT_FOUND)
        }
    }

    private fun projectSnapshot(
        draft: GroundedGenerationDraft,
        meta: SessionMeta,
        turns: List<ValidatedTranscriptTurn>,
    ): SessionImportV1Snapshot =
        SessionImportV1Snapshot(
            format = IMPORT_FORMAT,
            sessionNumber = meta.sessionNumber,
            bookTitle = meta.bookTitle,
            meetingDate = meta.meetingDate,
            summary = draft.summaryBlocks.joinToString("\n\n") { it.text.trim() },
            highlights = draft.highlights.map { SessionImportV1Snapshot.AuthoredText(it.authorName, it.text.trim()) },
            oneLineReviews =
                draft.oneLineReviews.map { SessionImportV1Snapshot.AuthoredText(it.authorName, it.text.trim()) },
            feedbackDocumentFileName = draft.feedbackDocumentFileName,
            feedbackDocumentMarkdown =
                buildFeedbackDocument(
                    draft,
                    meta,
                    turns.map { normalizeAuthorName(it.speakerName) }.distinct(),
                ),
        )

    private fun buildFeedbackDocument(
        draft: GroundedGenerationDraft,
        meta: SessionMeta,
        speakerNames: List<String>,
    ): String =
        buildString {
            appendLine(FEEDBACK_MARKER)
            appendLine()
            appendLine("# 독서모임 ${meta.sessionNumber}차 피드백")
            appendLine()
            appendLine("${meta.bookTitle} · ${meta.meetingDate}")
            appendLine()
            appendLine("## 메타")
            appendLine()
            appendLine("- 일시: ${meta.meetingDate}")
            append("- 책: ${meta.bookTitle}")
            meta.bookAuthor?.takeIf { it.isNotBlank() }?.let { append(" · ${it.trim()}") }
            appendLine()
            appendLine("- 참여자: ${speakerNames.joinToString(", ")}")
            draft.feedbackSections.forEach { section ->
                appendLine()
                appendLine("## ${section.heading}")
                appendLine()
                append(section.markdown.trim())
                appendLine()
            }
        }.trimEnd()

    private companion object {
        const val GROUNDED_FORMAT = "readmates-grounded-generation:v2"
        const val IMPORT_FORMAT = "readmates-session-import:v1"
        const val FEEDBACK_MARKER = "<!-- readmates-feedback:v1 -->"
        val HIGHLIGHTS_RANGE = 1..6
        val FEEDBACK_SECTION_HEADINGS = listOf("관찰자 노트", "참여자별 피드백")
    }
}

private fun normalizeAuthorName(value: String): String = Normalizer.normalize(value.trim(), Normalizer.Form.NFC)

private fun isSafeFeedbackFileName(fileName: String): Boolean =
    fileName.isNotBlank() &&
        fileName == fileName.trim() &&
        !fileName.contains('/') &&
        !fileName.contains('\\') &&
        (fileName.endsWith(".md") || fileName.endsWith(".txt"))

private fun isSafeFeedbackHeading(heading: String): Boolean =
    heading.isNotBlank() &&
        heading == heading.trim() &&
        heading.none { it == '\r' || it == '\n' } &&
        !heading.startsWith('#')

private fun feedbackContainsPii(
    heading: String,
    markdown: String,
): Boolean = GroundedPiiDetector.contains(heading) || GroundedPiiDetector.contains(markdown)

private fun containsServerOwnedFeedbackStructure(markdown: String): Boolean =
    markdown.contains("<!-- readmates-feedback:v1 -->") || TOP_LEVEL_MARKDOWN_HEADING.containsMatchIn(markdown)

private val TOP_LEVEL_MARKDOWN_HEADING = Regex("(?m)^\\s{0,3}#{1,2}\\s+")

private fun MutableMap<GenerationItem, MutableSet<GroundingFailureReason>>.add(
    section: GenerationItem,
    reason: GroundingFailureReason,
) {
    getOrPut(section, ::linkedSetOf).add(reason)
}

private object GroundedPiiDetector {
    private val patterns =
        listOf(
            Regex("\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b", RegexOption.IGNORE_CASE),
            Regex("(?<!\\d)(?:01[016789]|0[2-6][1-5]?)[ -]?\\d{3,4}[ -]?\\d{4}(?!\\d)"),
            Regex("(?<!\\d)\\d{6}[ -]?[1-4]\\d{6}(?!\\d)"),
        )

    fun contains(value: String): Boolean = patterns.any { it.containsMatchIn(value) }
}

private fun validFeedbackDocument(
    markdown: String,
    speakerNames: List<String>,
): Boolean {
    val parsed = runCatching { FeedbackDocumentParser().parse(markdown) }.getOrNull() ?: return false
    return parsed.participants.map { normalizeAuthorName(it.name) } == speakerNames &&
        parsed.participants.map { it.number } == (1..speakerNames.size).toList()
}
