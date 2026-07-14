package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedEvidenceBundle
import com.readmates.aigen.application.model.GroundedEvidenceExcerpt
import com.readmates.aigen.application.model.GroundedEvidenceTarget
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.ValidatedTranscriptTurn
import org.springframework.stereotype.Component

@Component
class GroundedEvidenceProjector {
    fun project(
        draft: GroundedGenerationDraft,
        turns: List<ValidatedTranscriptTurn>,
        revision: Long,
    ): GroundedEvidenceBundle {
        require(revision > 0) { "Evidence revision must be positive" }
        val turnsById = turns.associateBy { it.turnId }
        require(turnsById.size == turns.size) { "Evidence source turns must be unique" }

        val targets =
            buildList {
                draft.summaryBlocks.forEachIndexed { ordinal, block ->
                    add(target(revision, GenerationItem.SUMMARY, ordinal, block.evidenceTurnIds, turnsById))
                }
                draft.highlights.forEachIndexed { ordinal, item ->
                    add(target(revision, GenerationItem.HIGHLIGHTS, ordinal, item.evidenceTurnIds, turnsById))
                }
                draft.oneLineReviews.forEachIndexed { ordinal, item ->
                    add(target(revision, GenerationItem.ONE_LINE_REVIEWS, ordinal, item.evidenceTurnIds, turnsById))
                }
                draft.feedbackSections.forEachIndexed { ordinal, section ->
                    add(target(revision, GenerationItem.FEEDBACK_DOCUMENT, ordinal, section.evidenceTurnIds, turnsById))
                }
            }
        val excerpts =
            targets
                .flatMap { it.turnIds }
                .distinct()
                .map { turnId -> excerpt(requireNotNull(turnsById[turnId])) }

        return GroundedEvidenceBundle(revision, targets, excerpts)
    }

    private fun target(
        revision: Long,
        section: GenerationItem,
        ordinal: Int,
        evidenceTurnIds: List<String>,
        turnsById: Map<String, ValidatedTranscriptTurn>,
    ): GroundedEvidenceTarget {
        val turnIds = evidenceTurnIds.distinct()
        require(turnIds.all(turnsById::containsKey)) { "Evidence references an unknown turn" }
        return GroundedEvidenceTarget(
            targetId = "r$revision:${section.name}:$ordinal",
            section = section,
            ordinal = ordinal,
            turnIds = turnIds,
        )
    }

    private fun excerpt(turn: ValidatedTranscriptTurn): GroundedEvidenceExcerpt {
        val sanitized = sanitizeEvidenceText(turn.text)
        val codePointCount = sanitized.codePointCount(0, sanitized.length)
        val truncated = codePointCount > MAX_EXCERPT_CODE_POINTS
        val excerpt =
            if (truncated) {
                val visibleCodePoints = MAX_EXCERPT_CODE_POINTS - 1
                sanitized.substring(0, sanitized.offsetByCodePoints(0, visibleCodePoints)) + ELLIPSIS
            } else {
                sanitized
            }
        return GroundedEvidenceExcerpt(
            turnId = turn.turnId,
            speakerName = turn.speakerName,
            startSeconds = turn.startSeconds,
            excerpt = excerpt,
            truncated = truncated,
        )
    }

    private companion object {
        const val MAX_EXCERPT_CODE_POINTS = 240
        const val ELLIPSIS = "…"
    }
}

internal fun sanitizeEvidenceText(value: String): String =
    buildString(value.length) {
        var index = 0
        while (index < value.length) {
            val codePoint = value.codePointAt(index)
            when {
                codePoint == '\n'.code || codePoint == '\r'.code || codePoint == '\t'.code -> append(' ')
                !Character.isISOControl(codePoint) -> appendCodePoint(codePoint)
            }
            index += Character.charCount(codePoint)
        }
    }.replace(EVIDENCE_WHITESPACE, " ").trim()

private val EVIDENCE_WHITESPACE = Regex("\\s+")
