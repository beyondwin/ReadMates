package com.readmates.feedback.application

internal data class FeedbackMarkdownSection(
    val name: String,
    val lines: List<String>,
)

internal data class FeedbackMarkdownSections(
    val leading: List<String>,
    val sections: List<FeedbackMarkdownSection>,
)

internal object FeedbackMarkdownSupport {
    private const val INVALID_TEMPLATE_MESSAGE = "ReadMates 피드백 템플릿 형식이 아닙니다."
    private val LABELED_LINE_PATTERN = Regex("^-\\s*([^:]+):\\s*(.+)$")
    private val NUMBERED_ITEM_PATTERN = Regex("^\\d+\\.\\s+(.+)$")

    fun invalidTemplate(): Nothing = throw FeedbackDocumentException(FeedbackDocumentError.INVALID_TEMPLATE, INVALID_TEMPLATE_MESSAGE)

    fun splitSections(
        lines: List<String>,
        headingPattern: Regex,
    ): FeedbackMarkdownSections {
        val leading = mutableListOf<String>()
        val sections = mutableListOf<FeedbackMarkdownSection>()
        var currentName: String? = null
        var currentLines = mutableListOf<String>()

        lines.forEach { line ->
            val match = headingPattern.matchEntire(line.trim())
            if (match != null) {
                currentName?.let { sections += FeedbackMarkdownSection(it, currentLines) }
                currentName = match.groupValues[1].trim()
                currentLines = mutableListOf()
            } else if (currentName == null) {
                leading += line
            } else {
                currentLines += line
            }
        }
        currentName?.let { sections += FeedbackMarkdownSection(it, currentLines) }

        return FeedbackMarkdownSections(leading = leading, sections = sections)
    }

    fun parseParagraphs(lines: List<String>): List<String> {
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

    fun parseBullets(lines: List<String>): List<String> =
        lines.mapNotNull { line ->
            val trimmed = line.trim()
            when {
                trimmed.isBlank() -> null
                trimmed.startsWith("- ") ->
                    trimmed.removePrefix("- ").trim().takeIf { it.isNotBlank() }
                        ?: invalidTemplate()
                else -> invalidTemplate()
            }
        }

    fun parseNumberedItems(lines: List<String>): List<String> =
        lines.mapNotNull { line ->
            val trimmed = line.trim()
            when {
                trimmed.isBlank() -> null
                else ->
                    NUMBERED_ITEM_PATTERN
                        .matchEntire(trimmed)
                        ?.groupValues
                        ?.get(1)
                        ?.trim()
                        ?.takeIf { it.isNotBlank() }
                        ?: invalidTemplate()
            }
        }

    fun parseLabeledLines(lines: List<String>): List<Pair<String, String>> =
        lines.mapNotNull { line ->
            val trimmed = line.trim()
            if (trimmed.isBlank()) {
                null
            } else {
                val match = LABELED_LINE_PATTERN.matchEntire(trimmed) ?: invalidTemplate()
                match.groupValues[1].trim() to match.groupValues[2].trim()
            }
        }

    fun labeledBulletFields(lines: List<String>): Map<String, String> = parseLabeledLines(lines).toMap()

    fun prefixedValue(
        lines: List<String>,
        prefix: String,
    ): String = optionalPrefixedValue(lines, prefix) ?: invalidTemplate()

    fun optionalPrefixedValue(
        lines: List<String>,
        prefix: String,
    ): String? =
        lines
            .firstOrNull { it.trim().startsWith(prefix) }
            ?.trim()
            ?.removePrefix(prefix)
            ?.trim()
            ?.takeIf { it.isNotBlank() }
}
