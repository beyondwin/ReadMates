package com.readmates.feedback.application

import com.readmates.feedback.application.FeedbackMarkdownSupport.invalidTemplate
import com.readmates.feedback.application.FeedbackMarkdownSupport.labeledBulletFields
import com.readmates.feedback.application.FeedbackMarkdownSupport.parseBullets
import com.readmates.feedback.application.FeedbackMarkdownSupport.parseLabeledLines
import com.readmates.feedback.application.FeedbackMarkdownSupport.parseNumberedItems
import com.readmates.feedback.application.FeedbackMarkdownSupport.parseParagraphs
import com.readmates.feedback.application.FeedbackMarkdownSupport.prefixedValue
import com.readmates.feedback.application.FeedbackMarkdownSupport.splitSections

data class ParsedFeedbackDocument(
    val title: String,
    val subtitle: String,
    val metadata: List<FeedbackMetadataItem>,
    val observerNotes: List<String>,
    val participants: List<FeedbackParticipant>,
    val templateVersion: Int = 1,
    val overview: List<FeedbackMetadataItem> = emptyList(),
    val highlights: List<FeedbackHighlight> = emptyList(),
    val groupFeedback: FeedbackGroupFeedback? = null,
    val trend: FeedbackTrend? = null,
    val followUpQuestions: List<String> = emptyList(),
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
    val badges: List<String> = emptyList(),
    val journey: List<FeedbackJourneyStep> = emptyList(),
    val achievements: List<String> = emptyList(),
    val baseline: List<String> = emptyList(),
    val sessionQuotes: List<FeedbackSessionQuote> = emptyList(),
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

/**
 * Parses the ReadMates feedback document template. `readmates-feedback:v1` documents keep their original
 * required headings; `readmates-feedback:v2` adds optional group and participant sections (ADR-0072).
 */
class FeedbackDocumentParser {
    fun parse(source: String): ParsedFeedbackDocument {
        val lines =
            source
                .replace("\r\n", "\n")
                .replace("\r", "\n")
                .split("\n")

        val version = templateVersion(lines)
        val titleIndex = lines.indexOfFirst { TITLE_PATTERN.matches(it.trim()) }
        if (titleIndex < 0) {
            invalidTemplate()
        }
        val title = lines[titleIndex].trim().removePrefix("#").trim()
        val subtitle = nextNonBlankLine(lines, titleIndex + 1)
        if (subtitle.startsWith("#")) {
            invalidTemplate()
        }

        val sections = topLevelSections(lines.drop(titleIndex + 1), version)
        val metadata = parseLabeledLines(sections.required(META)).map { (label, value) -> FeedbackMetadataItem(label, value) }
        val observerNotes = parseParagraphs(sections.required(OBSERVER_NOTES))
        val participants = parseParticipants(sections.required(PARTICIPANTS), version)

        if (metadata.isEmpty() || observerNotes.isEmpty() || participants.isEmpty()) {
            invalidTemplate()
        }

        return ParsedFeedbackDocument(
            title = title,
            subtitle = subtitle,
            metadata = metadata,
            observerNotes = observerNotes,
            participants = participants,
            templateVersion = version,
            overview = sections.optional(OVERVIEW)?.let(FeedbackDocumentV2SectionParser::overview) ?: emptyList(),
            highlights = sections.optional(HIGHLIGHTS)?.let(FeedbackDocumentV2SectionParser::highlights) ?: emptyList(),
            groupFeedback = sections.optional(GROUP_FEEDBACK)?.let(FeedbackDocumentV2SectionParser::groupFeedback),
            trend = sections.optional(TREND)?.let(FeedbackDocumentV2SectionParser::trend),
            followUpQuestions =
                sections.optional(FOLLOW_UP_QUESTIONS)?.let(FeedbackDocumentV2SectionParser::followUpQuestions)
                    ?: emptyList(),
        )
    }

    private fun templateVersion(lines: List<String>): Int {
        val trimmed = lines.map { it.trim() }
        return when {
            MARKER_V2 in trimmed -> 2
            MARKER_V1 in trimmed -> 1
            else -> invalidTemplate()
        }
    }

    private fun topLevelSections(
        lines: List<String>,
        version: Int,
    ): Map<String, List<String>> {
        val sections = splitSections(lines, TOP_LEVEL_HEADING_PATTERN).sections
        val names = sections.map { it.name }
        if (names.toSet().size != names.size) {
            invalidTemplate()
        }
        val metaIndex = names.indexOf(META)
        val observerIndex = names.indexOf(OBSERVER_NOTES)
        val participantsIndex = names.indexOf(PARTICIPANTS)
        if (metaIndex < 0 || observerIndex < 0 || participantsIndex < 0) {
            invalidTemplate()
        }
        if (metaIndex > observerIndex || observerIndex > participantsIndex) {
            invalidTemplate()
        }

        val optionalNames = names.filter { it !in REQUIRED_TOP_LEVEL_SECTIONS }
        if (version == 1) {
            if (optionalNames.any { it in V2_TOP_LEVEL_SECTIONS }) {
                invalidTemplate()
            }
            return sections.filter { it.name in REQUIRED_TOP_LEVEL_SECTIONS }.associate { it.name to it.lines }
        }

        val misplaced = optionalNames.any { names.indexOf(it) !in (metaIndex + 1) until participantsIndex }
        if (optionalNames.any { it !in V2_TOP_LEVEL_SECTIONS } || misplaced || participantsIndex != names.lastIndex) {
            invalidTemplate()
        }
        return sections.associate { it.name to it.lines }
    }

    private fun parseParticipants(
        lines: List<String>,
        version: Int,
    ): List<FeedbackParticipant> {
        val headerIndexes =
            lines.mapIndexedNotNull { index, line ->
                if (PARTICIPANT_PATTERN.matches(line.trim())) index else null
            }
        if (headerIndexes.isEmpty()) {
            invalidTemplate()
        }

        return headerIndexes.mapIndexed { position, headerIndex ->
            val endIndex = headerIndexes.getOrNull(position + 1) ?: lines.size
            parseParticipant(lines.slice(headerIndex until endIndex), version)
        }
    }

    private fun parseParticipant(
        lines: List<String>,
        version: Int,
    ): FeedbackParticipant {
        val headerMatch = PARTICIPANT_PATTERN.matchEntire(lines.first().trim()) ?: invalidTemplate()
        val number = headerMatch.groupValues[1].toIntOrNull() ?: invalidTemplate()
        val name = headerMatch.groupValues[2].trim()
        if (name.isBlank()) {
            invalidTemplate()
        }

        val role =
            lines
                .firstOrNull { it.trim().startsWith("역할:") }
                ?.trim()
                ?.substringAfter("역할:")
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?: invalidTemplate()

        val split = splitSections(lines.drop(1), PARTICIPANT_SECTION_PATTERN)
        val sections = participantSections(split.sections, version)
        val styleParagraphs = parseParagraphs(sections.required(STYLE))
        val contributionBullets = parseBullets(sections.required(CONTRIBUTIONS))
        val problems = parseProblems(sections.required(PROBLEMS))
        val actionItems = parseNumberedItems(sections.required(ACTIONS))
        val revealingQuote = parseRevealingQuote(sections.required(REVEALING_QUOTE))

        if (
            styleParagraphs.isEmpty() ||
            contributionBullets.isEmpty() ||
            problems.isEmpty() ||
            actionItems.isEmpty()
        ) {
            invalidTemplate()
        }

        val badgeValue =
            split.leading
                .firstOrNull { it.trim().startsWith(BADGE_PREFIX) }
                ?.trim()
                ?.removePrefix(BADGE_PREFIX)
                ?.trim()

        return FeedbackParticipant(
            number = number,
            name = name,
            role = role,
            styleParagraphs = styleParagraphs,
            contributionBullets = contributionBullets,
            problems = problems,
            actionItems = actionItems,
            revealingQuote = revealingQuote,
            badges = if (version == 2) badgeValue?.let(FeedbackDocumentV2SectionParser::badges) ?: emptyList() else emptyList(),
            journey = sections.optional(JOURNEY)?.let(FeedbackDocumentV2SectionParser::journey) ?: emptyList(),
            achievements = sections.optional(ACHIEVEMENTS)?.let(FeedbackDocumentV2SectionParser::bulletList) ?: emptyList(),
            baseline = sections.optional(BASELINE)?.let(FeedbackDocumentV2SectionParser::bulletList) ?: emptyList(),
            sessionQuotes = sections.optional(SESSION_QUOTES)?.let(FeedbackDocumentV2SectionParser::sessionQuotes) ?: emptyList(),
        )
    }

    private fun participantSections(
        sections: List<FeedbackMarkdownSection>,
        version: Int,
    ): Map<String, List<String>> {
        val known = sections.filter { it.name in REQUIRED_PARTICIPANT_SECTIONS || it.name in V2_PARTICIPANT_SECTIONS }
        val unknown = sections.filterNot { it in known }
        if (version == 2 && unknown.isNotEmpty()) {
            invalidTemplate()
        }
        if (version == 1 && known.any { it.name in V2_PARTICIPANT_SECTIONS }) {
            invalidTemplate()
        }

        val names = known.map { it.name }
        if (names.toSet().size != names.size) {
            invalidTemplate()
        }
        val requiredOrder = names.filter { it in REQUIRED_PARTICIPANT_SECTIONS }
        if (requiredOrder != REQUIRED_PARTICIPANT_SECTIONS) {
            invalidTemplate()
        }
        val styleIndex = names.indexOf(STYLE)
        val contributionsIndex = names.indexOf(CONTRIBUTIONS)
        val problemsIndex = names.indexOf(PROBLEMS)
        val beforeStyleValid = PRE_STYLE_SECTIONS.all { names.indexOf(it) < styleIndex }
        val quotesIndex = names.indexOf(SESSION_QUOTES)
        val quotesValid = quotesIndex < 0 || quotesIndex in (contributionsIndex + 1) until problemsIndex
        if (!beforeStyleValid || !quotesValid) {
            invalidTemplate()
        }

        return known.associate { it.name to it.lines }
    }

    private fun parseProblems(lines: List<String>): List<FeedbackProblem> =
        splitSections(lines, PROBLEM_PATTERN)
            .sections
            .map { section ->
                val fields = labeledBulletFields(section.lines)
                FeedbackProblem(
                    title = section.name.takeIf { it.isNotBlank() } ?: invalidTemplate(),
                    core = fields["핵심"] ?: invalidTemplate(),
                    evidence = fields["근거"] ?: invalidTemplate(),
                    interpretation = fields["해석"] ?: invalidTemplate(),
                )
            }.ifEmpty { invalidTemplate() }

    private fun parseRevealingQuote(lines: List<String>): FeedbackRevealingQuote {
        val quote =
            lines
                .firstOrNull { it.trim().startsWith(">") }
                ?.trim()
                ?.removePrefix(">")
                ?.trim()
                ?.takeIf { it.isNotBlank() }
                ?: invalidTemplate()

        return FeedbackRevealingQuote(
            quote = quote,
            context = prefixedValue(lines, "맥락:"),
            note = prefixedValue(lines, "주석:"),
        )
    }

    private fun nextNonBlankLine(
        lines: List<String>,
        startIndex: Int,
    ): String =
        lines
            .asSequence()
            .drop(startIndex)
            .map { it.trim() }
            .firstOrNull { it.isNotBlank() }
            ?: invalidTemplate()

    private fun Map<String, List<String>>.required(name: String): List<String> = this[name] ?: invalidTemplate()

    private fun Map<String, List<String>>.optional(name: String): List<String>? = this[name]

    private companion object {
        private const val MARKER_V1 = "<!-- readmates-feedback:v1 -->"
        private const val MARKER_V2 = "<!-- readmates-feedback:v2 -->"
        private const val BADGE_PREFIX = "배지:"

        private const val META = "메타"
        private const val OBSERVER_NOTES = "관찰자 노트"
        private const val PARTICIPANTS = "참여자별 피드백"
        private const val OVERVIEW = "한눈에 보기"
        private const val HIGHLIGHTS = "오늘의 하이라이트"
        private const val GROUP_FEEDBACK = "모임 피드백"
        private const val TREND = "모임의 흐름"
        private const val FOLLOW_UP_QUESTIONS = "이어갈 질문"

        private const val STYLE = "참여 스타일"
        private const val CONTRIBUTIONS = "실질 기여"
        private const val PROBLEMS = "문제점과 자기모순"
        private const val ACTIONS = "실천 과제"
        private const val REVEALING_QUOTE = "드러난 한 문장"
        private const val JOURNEY = "변화 흐름"
        private const val ACHIEVEMENTS = "지난 과제에서 해낸 것"
        private const val BASELINE = "첫 기록 기준점"
        private const val SESSION_QUOTES = "이번 모임의 발언"

        private val REQUIRED_TOP_LEVEL_SECTIONS = setOf(META, OBSERVER_NOTES, PARTICIPANTS)
        private val V2_TOP_LEVEL_SECTIONS = setOf(OVERVIEW, HIGHLIGHTS, GROUP_FEEDBACK, TREND, FOLLOW_UP_QUESTIONS)
        private val REQUIRED_PARTICIPANT_SECTIONS = listOf(STYLE, CONTRIBUTIONS, PROBLEMS, ACTIONS, REVEALING_QUOTE)
        private val PRE_STYLE_SECTIONS = listOf(JOURNEY, ACHIEVEMENTS, BASELINE)
        private val V2_PARTICIPANT_SECTIONS = setOf(JOURNEY, ACHIEVEMENTS, BASELINE, SESSION_QUOTES)

        private val TITLE_PATTERN = Regex("^#\\s+독서모임\\s+\\d+차\\s+피드백$")
        private val TOP_LEVEL_HEADING_PATTERN = Regex("^##(?!#)\\s+(.+)$")
        private val PARTICIPANT_PATTERN = Regex("^###\\s+(\\d+)\\.\\s+(.+)$")
        private val PARTICIPANT_SECTION_PATTERN = Regex("^####(?!#)\\s+(.+)$")
        private val PROBLEM_PATTERN = Regex("^#####\\s+\\d+\\.\\s+(.+)$")
    }
}
