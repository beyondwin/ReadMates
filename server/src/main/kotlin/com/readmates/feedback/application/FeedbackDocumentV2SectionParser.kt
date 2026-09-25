package com.readmates.feedback.application

import com.readmates.feedback.application.FeedbackMarkdownSupport.invalidTemplate
import com.readmates.feedback.application.FeedbackMarkdownSupport.labeledBulletFields
import com.readmates.feedback.application.FeedbackMarkdownSupport.optionalPrefixedValue
import com.readmates.feedback.application.FeedbackMarkdownSupport.parseBullets
import com.readmates.feedback.application.FeedbackMarkdownSupport.parseLabeledLines
import com.readmates.feedback.application.FeedbackMarkdownSupport.parseNumberedItems
import com.readmates.feedback.application.FeedbackMarkdownSupport.prefixedValue
import com.readmates.feedback.application.FeedbackMarkdownSupport.splitSections

/**
 * Parses the optional sections added by the `readmates-feedback:v2` template (ADR-0072).
 * Every optional section is validated strictly once present.
 */
internal object FeedbackDocumentV2SectionParser {
    private const val TIME = "(\\d{1,2}(?::\\d{2}){1,2})"
    private val SUB_SECTION_PATTERN = Regex("^###(?!#)\\s+(.+)$")
    private val NUMBERED_SUB_SECTION_PATTERN = Regex("^###(?!#)\\s+\\d+\\.\\s+(.+)$")
    private val NUMBERED_POINT_PATTERN = Regex("^####(?!#)\\s+\\d+\\.\\s+(.+)$")
    private val HIGHLIGHT_LINE_PATTERN = Regex("^-\\s*([^:\\[]+?)\\s*(?:\\[$TIME])?\\s*:\\s*(.+)$")
    private val SESSION_QUOTE_PATTERN = Regex("^-\\s*(?:\\[$TIME]\\s*)?(.+?)\\s+\\|\\s+(.+)$")
    private const val WHY_PREFIX = "왜 좋았나:"
    private const val NOTE_PREFIX = "주석:"

    fun overview(lines: List<String>): List<FeedbackMetadataItem> =
        parseLabeledLines(lines)
            .map { (label, value) -> FeedbackMetadataItem(label, value) }
            .ifEmpty { invalidTemplate() }

    fun highlights(lines: List<String>): List<FeedbackHighlight> {
        val split = splitSections(lines, NUMBERED_SUB_SECTION_PATTERN)
        requireBlank(split.leading)
        return split.sections
            .map { section -> highlight(section) }
            .ifEmpty { invalidTemplate() }
    }

    private fun highlight(section: FeedbackMarkdownSection): FeedbackHighlight {
        val why = prefixedValue(section.lines, WHY_PREFIX)
        val quoteLines =
            section.lines
                .map { it.trim() }
                .filter { it.isNotBlank() && !it.startsWith(WHY_PREFIX) }
                .map { line ->
                    val match = HIGHLIGHT_LINE_PATTERN.matchEntire(line) ?: invalidTemplate()
                    FeedbackHighlightLine(
                        speaker = match.groupValues[1].trim(),
                        time = match.groupValues[2].ifBlank { null },
                        text = match.groupValues[3].trim(),
                    )
                }.ifEmpty { invalidTemplate() }
        return FeedbackHighlight(title = section.name, lines = quoteLines, why = why)
    }

    fun groupFeedback(lines: List<String>): FeedbackGroupFeedback {
        val split = splitSections(lines, SUB_SECTION_PATTERN)
        requireBlank(split.leading)
        val byName = uniqueSections(split.sections, GROUP_SUB_SECTIONS)
        if (byName.isEmpty()) {
            invalidTemplate()
        }
        val shares = byName["발언 분량"]
        return FeedbackGroupFeedback(
            strengths = byName["잘된 점"]?.let { groupPoints(it) } ?: emptyList(),
            improvements = byName["아쉬운 점"]?.let { groupPoints(it) } ?: emptyList(),
            speakingShares = shares?.let { speakingShares(it) } ?: emptyList(),
            speakingNote = shares?.let { optionalPrefixedValue(it, NOTE_PREFIX) },
            nextSteps = byName["다음 모임 제안"]?.let { parseNumberedItems(it).ifEmpty { invalidTemplate() } } ?: emptyList(),
        )
    }

    private fun groupPoints(lines: List<String>): List<FeedbackGroupPoint> {
        val split = splitSections(lines, NUMBERED_POINT_PATTERN)
        requireBlank(split.leading)
        return split.sections
            .map { section ->
                val fields = labeledBulletFields(section.lines)
                FeedbackGroupPoint(
                    title = section.name,
                    evidence = fields["근거"] ?: invalidTemplate(),
                    interpretation = fields["해석"] ?: invalidTemplate(),
                )
            }.ifEmpty { invalidTemplate() }
    }

    private fun speakingShares(lines: List<String>): List<FeedbackSpeakingShare> =
        parseLabeledLines(lines.filterNot { it.trim().startsWith(NOTE_PREFIX) })
            .map { (name, value) ->
                val percent = value.removeSuffix("%").trim().toIntOrNull() ?: invalidTemplate()
                if (percent !in 0..MAX_PERCENT) {
                    invalidTemplate()
                }
                FeedbackSpeakingShare(name = name, percent = percent)
            }.ifEmpty { invalidTemplate() }

    fun trend(lines: List<String>): FeedbackTrend {
        val split = splitSections(lines, SUB_SECTION_PATTERN)
        requireBlank(split.leading)
        val byName = uniqueSections(split.sections, TREND_SUB_SECTIONS)
        if (byName.isEmpty()) {
            invalidTemplate()
        }
        return FeedbackTrend(
            attendance = byName["회차별 참석"]?.let { attendance(it) } ?: emptyList(),
            phases =
                byName["단계"]
                    ?.let { section -> parseLabeledLines(section).map { (label, text) -> FeedbackTrendPhase(label, text) } }
                    ?.ifEmpty { invalidTemplate() }
                    ?: emptyList(),
            repeatedTasks = byName["반복 과제"]?.let { repeatedTasks(it) } ?: emptyList(),
        )
    }

    private fun attendance(lines: List<String>): List<FeedbackAttendancePoint> =
        parseLabeledLines(lines)
            .map { (label, value) ->
                val count = value.removeSuffix("명").trim().toIntOrNull() ?: invalidTemplate()
                if (count < 0) {
                    invalidTemplate()
                }
                FeedbackAttendancePoint(label = label, count = count)
            }.ifEmpty { invalidTemplate() }

    private fun repeatedTasks(lines: List<String>): List<FeedbackRepeatedTask> =
        parseBullets(lines)
            .map { bullet ->
                val parts = bullet.split(" | ").map { it.trim() }
                if (parts.size != REPEATED_TASK_PARTS || parts.any { it.isBlank() }) {
                    invalidTemplate()
                }
                FeedbackRepeatedTask(task = parts[0], detail = parts[1], status = parts[2])
            }.ifEmpty { invalidTemplate() }

    fun followUpQuestions(lines: List<String>): List<String> = parseNumberedItems(lines).ifEmpty { invalidTemplate() }

    fun journey(lines: List<String>): List<FeedbackJourneyStep> =
        parseLabeledLines(lines)
            .map { (label, text) -> FeedbackJourneyStep(label, text) }
            .ifEmpty { invalidTemplate() }

    fun bulletList(lines: List<String>): List<String> = parseBullets(lines).ifEmpty { invalidTemplate() }

    fun sessionQuotes(lines: List<String>): List<FeedbackSessionQuote> =
        lines
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .map { line ->
                val match = SESSION_QUOTE_PATTERN.matchEntire(line) ?: invalidTemplate()
                FeedbackSessionQuote(
                    time = match.groupValues[1].ifBlank { null },
                    quote = match.groupValues[2].trim(),
                    note = match.groupValues[3].trim(),
                )
            }.ifEmpty { invalidTemplate() }

    fun badges(value: String): List<String> =
        value
            .split(",")
            .map { it.trim() }
            .filter { it.isNotBlank() }
            .ifEmpty { invalidTemplate() }

    private fun uniqueSections(
        sections: List<FeedbackMarkdownSection>,
        allowed: Set<String>,
    ): Map<String, List<String>> {
        if (sections.any { it.name !in allowed } || sections.map { it.name }.toSet().size != sections.size) {
            invalidTemplate()
        }
        return sections.associate { it.name to it.lines }
    }

    private fun requireBlank(lines: List<String>) {
        if (lines.any { it.isNotBlank() }) {
            invalidTemplate()
        }
    }

    private const val REPEATED_TASK_PARTS = 3
    private const val MAX_PERCENT = 100
    private val GROUP_SUB_SECTIONS = setOf("잘된 점", "아쉬운 점", "발언 분량", "다음 모임 제안")
    private val TREND_SUB_SECTIONS = setOf("회차별 참석", "단계", "반복 과제")
}
