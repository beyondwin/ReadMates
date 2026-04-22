package com.readmates.feedback.application

import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException

data class ParsedFeedbackDocument(
    val title: String,
    val subtitle: String,
    val metadata: List<FeedbackMetadataItem>,
    val observerNotes: List<String>,
    val participants: List<FeedbackParticipant>,
)

data class FeedbackMetadataItem(
    val label: String,
    val value: String,
)

data class FeedbackParticipant(
    val number: Int,
    val name: String,
    val role: String,
    val styleParagraphs: List<String>,
    val contributionBullets: List<String>,
    val problems: List<FeedbackProblem>,
    val actionItems: List<String>,
    val revealingQuote: FeedbackRevealingQuote,
)

data class FeedbackProblem(
    val title: String,
    val core: String,
    val evidence: String,
    val interpretation: String,
)

data class FeedbackRevealingQuote(
    val quote: String,
    val context: String,
    val note: String,
)

class FeedbackDocumentParser {
    fun parse(source: String): ParsedFeedbackDocument {
        val lines = source
            .replace("\r\n", "\n")
            .replace("\r", "\n")
            .split("\n")

        if (lines.none { it.trim() == MARKER }) {
            invalidTemplate()
        }

        val titleIndex = lines.indexOfFirst { TITLE_PATTERN.matches(it.trim()) }
        if (titleIndex < 0) {
            invalidTemplate()
        }
        val title = lines[titleIndex].trim().removePrefix("#").trim()
        val subtitle = nextNonBlankLine(lines, titleIndex + 1)
        if (subtitle.startsWith("#")) {
            invalidTemplate()
        }

        val metadataHeadingIndex = findHeading(lines, "## 메타", titleIndex + 1)
        val observerHeadingIndex = findHeading(lines, "## 관찰자 노트", metadataHeadingIndex + 1)
        val participantsHeadingIndex = findHeading(lines, "## 참여자별 피드백", observerHeadingIndex + 1)
        if (metadataHeadingIndex > observerHeadingIndex || observerHeadingIndex > participantsHeadingIndex) {
            invalidTemplate()
        }

        val metadata = parseMetadata(lines.slice(metadataHeadingIndex + 1 until observerHeadingIndex))
        val observerNotes = parseParagraphs(lines.slice(observerHeadingIndex + 1 until participantsHeadingIndex))
        val participants = parseParticipants(lines.drop(participantsHeadingIndex + 1))

        if (metadata.isEmpty() || observerNotes.isEmpty() || participants.isEmpty()) {
            invalidTemplate()
        }

        return ParsedFeedbackDocument(
            title = title,
            subtitle = subtitle,
            metadata = metadata,
            observerNotes = observerNotes,
            participants = participants,
        )
    }

    private fun parseMetadata(lines: List<String>): List<FeedbackMetadataItem> =
        lines.mapNotNull { line ->
            val trimmed = line.trim()
            if (trimmed.isBlank()) {
                null
            } else {
                val match = METADATA_PATTERN.matchEntire(trimmed) ?: invalidTemplate()
                FeedbackMetadataItem(
                    label = match.groupValues[1].trim(),
                    value = match.groupValues[2].trim(),
                )
            }
        }

    private fun parseParticipants(lines: List<String>): List<FeedbackParticipant> {
        val headerIndexes = lines.mapIndexedNotNull { index, line ->
            if (PARTICIPANT_PATTERN.matches(line.trim())) index else null
        }
        if (headerIndexes.isEmpty()) {
            invalidTemplate()
        }

        return headerIndexes.mapIndexed { position, headerIndex ->
            val endIndex = headerIndexes.getOrNull(position + 1) ?: lines.size
            parseParticipant(lines.slice(headerIndex until endIndex))
        }
    }

    private fun parseParticipant(lines: List<String>): FeedbackParticipant {
        val headerMatch = PARTICIPANT_PATTERN.matchEntire(lines.first().trim()) ?: invalidTemplate()
        val number = headerMatch.groupValues[1].toIntOrNull() ?: invalidTemplate()
        val name = headerMatch.groupValues[2].trim()
        if (name.isBlank()) {
            invalidTemplate()
        }

        val role = lines
            .firstOrNull { it.trim().startsWith("역할:") }
            ?.trim()
            ?.substringAfter("역할:")
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: invalidTemplate()

        val styleIndex = headingIndex(lines, "#### 참여 스타일")
        val contributionIndex = headingIndex(lines, "#### 실질 기여")
        val problemsIndex = headingIndex(lines, "#### 문제점과 자기모순")
        val actionIndex = headingIndex(lines, "#### 실천 과제")
        val quoteIndex = headingIndex(lines, "#### 드러난 한 문장")
        if (
            listOf(styleIndex, contributionIndex, problemsIndex, actionIndex, quoteIndex).any { it < 0 } ||
            styleIndex > contributionIndex ||
            contributionIndex > problemsIndex ||
            problemsIndex > actionIndex ||
            actionIndex > quoteIndex
        ) {
            invalidTemplate()
        }

        val styleParagraphs = parseParagraphs(lines.slice(styleIndex + 1 until contributionIndex))
        val contributionBullets = parseBullets(lines.slice(contributionIndex + 1 until problemsIndex))
        val problems = parseProblems(lines.slice(problemsIndex + 1 until actionIndex))
        val actionItems = parseNumberedItems(lines.slice(actionIndex + 1 until quoteIndex))
        val revealingQuote = parseRevealingQuote(lines.drop(quoteIndex + 1))

        if (
            styleParagraphs.isEmpty() ||
            contributionBullets.isEmpty() ||
            problems.isEmpty() ||
            actionItems.isEmpty()
        ) {
            invalidTemplate()
        }

        return FeedbackParticipant(
            number = number,
            name = name,
            role = role,
            styleParagraphs = styleParagraphs,
            contributionBullets = contributionBullets,
            problems = problems,
            actionItems = actionItems,
            revealingQuote = revealingQuote,
        )
    }

    private fun parseProblems(lines: List<String>): List<FeedbackProblem> {
        val headerIndexes = lines.mapIndexedNotNull { index, line ->
            if (PROBLEM_PATTERN.matches(line.trim())) index else null
        }
        if (headerIndexes.isEmpty()) {
            invalidTemplate()
        }

        return headerIndexes.mapIndexed { position, headerIndex ->
            val endIndex = headerIndexes.getOrNull(position + 1) ?: lines.size
            parseProblem(lines.slice(headerIndex until endIndex))
        }
    }

    private fun parseProblem(lines: List<String>): FeedbackProblem {
        val title = PROBLEM_PATTERN.matchEntire(lines.first().trim())
            ?.groupValues
            ?.get(1)
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: invalidTemplate()
        val fields = labeledBulletFields(lines.drop(1))

        return FeedbackProblem(
            title = title,
            core = fields["핵심"] ?: invalidTemplate(),
            evidence = fields["근거"] ?: invalidTemplate(),
            interpretation = fields["해석"] ?: invalidTemplate(),
        )
    }

    private fun parseRevealingQuote(lines: List<String>): FeedbackRevealingQuote {
        val quote = lines
            .firstOrNull { it.trim().startsWith(">") }
            ?.trim()
            ?.removePrefix(">")
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: invalidTemplate()
        val context = prefixedValue(lines, "맥락:")
        val note = prefixedValue(lines, "주석:")

        return FeedbackRevealingQuote(
            quote = quote,
            context = context,
            note = note,
        )
    }

    private fun parseParagraphs(lines: List<String>): List<String> {
        val paragraphs = mutableListOf<String>()
        val current = mutableListOf<String>()

        fun flush() {
            if (current.isNotEmpty()) {
                paragraphs += current.joinToString(" ")
                current.clear()
            }
        }

        lines.forEach { line ->
            val trimmed = line.trim()
            if (trimmed.isBlank()) {
                flush()
            } else {
                current += trimmed
            }
        }
        flush()

        return paragraphs
    }

    private fun parseBullets(lines: List<String>): List<String> =
        lines.mapNotNull { line ->
            val trimmed = line.trim()
            when {
                trimmed.isBlank() -> null
                trimmed.startsWith("- ") -> trimmed.removePrefix("- ").trim().takeIf { it.isNotBlank() }
                    ?: invalidTemplate()
                else -> invalidTemplate()
            }
        }

    private fun parseNumberedItems(lines: List<String>): List<String> =
        lines.mapNotNull { line ->
            val trimmed = line.trim()
            when {
                trimmed.isBlank() -> null
                else -> NUMBERED_ITEM_PATTERN.matchEntire(trimmed)
                    ?.groupValues
                    ?.get(1)
                    ?.trim()
                    ?.takeIf { it.isNotBlank() }
                    ?: invalidTemplate()
            }
        }

    private fun labeledBulletFields(lines: List<String>): Map<String, String> =
        lines.mapNotNull { line ->
            val trimmed = line.trim()
            if (trimmed.isBlank()) {
                null
            } else {
                val match = LABELED_BULLET_PATTERN.matchEntire(trimmed) ?: invalidTemplate()
                match.groupValues[1].trim() to match.groupValues[2].trim()
            }
        }.toMap()

    private fun prefixedValue(lines: List<String>, prefix: String): String =
        lines
            .firstOrNull { it.trim().startsWith(prefix) }
            ?.trim()
            ?.removePrefix(prefix)
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: invalidTemplate()

    private fun findHeading(lines: List<String>, heading: String, startIndex: Int): Int =
        lines.indexOfFirstFrom(startIndex) { it.trim() == heading }.takeIf { it >= 0 } ?: invalidTemplate()

    private fun headingIndex(lines: List<String>, heading: String): Int =
        lines.indexOfFirst { it.trim() == heading }

    private fun nextNonBlankLine(lines: List<String>, startIndex: Int): String =
        lines.asSequence()
            .drop(startIndex)
            .map { it.trim() }
            .firstOrNull { it.isNotBlank() }
            ?: invalidTemplate()

    private fun List<String>.indexOfFirstFrom(startIndex: Int, predicate: (String) -> Boolean): Int {
        for (index in startIndex until size) {
            if (predicate(this[index])) {
                return index
            }
        }
        return -1
    }

    private fun invalidTemplate(): Nothing =
        throw ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_TEMPLATE_MESSAGE)

    private companion object {
        private const val MARKER = "<!-- readmates-feedback:v1 -->"
        private const val INVALID_TEMPLATE_MESSAGE = "ReadMates 피드백 템플릿 형식이 아닙니다."
        private val TITLE_PATTERN = Regex("^#\\s+독서모임\\s+\\d+차\\s+피드백$")
        private val METADATA_PATTERN = Regex("^-\\s*([^:]+):\\s*(.+)$")
        private val PARTICIPANT_PATTERN = Regex("^###\\s+(\\d+)\\.\\s+(.+)$")
        private val PROBLEM_PATTERN = Regex("^#####\\s+\\d+\\.\\s+(.+)$")
        private val LABELED_BULLET_PATTERN = Regex("^-\\s*([^:]+):\\s*(.+)$")
        private val NUMBERED_ITEM_PATTERN = Regex("^\\d+\\.\\s+(.+)$")
    }
}
