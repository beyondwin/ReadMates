package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.ParsedTranscript
import com.readmates.aigen.application.model.ParsedTranscriptTurn
import org.springframework.stereotype.Component

@Component
class TranscriptParser {
    fun parse(rawTranscript: String): ParsedTranscript {
        val normalized = normalize(rawTranscript)
        if (normalized.isBlank()) fail(ErrorCode.TRANSCRIPT_EMPTY, "EMPTY")
        rejectUnsupportedControls(normalized)

        val lines = normalized.split('\n')
        val preamble = findPreamble(lines)
        val turns = parseTurns(lines, preamble.firstTurnLine)
        validatePreambleParticipants(preamble.participantNames, turns)
        return ParsedTranscript(normalizedTranscript = normalized, turns = turns)
    }

    private fun normalize(rawTranscript: String): String =
        rawTranscript
            .removePrefix(BYTE_ORDER_MARK)
            .replace("\r\n", "\n")
            .replace('\r', '\n')
            .split('\n')
            .joinToString("\n") { line -> line.trimEnd() }
            .trim('\n')

    private fun rejectUnsupportedControls(transcript: String) {
        val unsafe =
            transcript.codePoints().anyMatch { codePoint ->
                (codePoint != NEWLINE && codePoint != TAB && Character.isISOControl(codePoint)) ||
                    Character.getType(codePoint) == Character.FORMAT.toInt()
            }
        if (unsafe) {
            fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "UNSUPPORTED_CONTROL")
        }
    }

    private fun findPreamble(lines: List<String>): Preamble {
        val first = lines.indexOfFirst { it.isNotBlank() }
        if (first < 0) fail(ErrorCode.TRANSCRIPT_EMPTY, "EMPTY")
        if (TURN_HEADER.matches(lines[first])) return Preamble(first, null)

        val title = lines[first]
        if (title.codePointCount() > MAX_TITLE_CODE_POINTS) {
            fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "TITLE_TOO_LONG", first + 1)
        }
        val dateLine = first + 1
        if (dateLine !in lines.indices || !EXPORT_DATE_AND_DURATION.matches(lines[dateLine])) {
            fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "UNSUPPORTED_PREAMBLE", first + 1)
        }

        var cursor = dateLine + 1
        var participantNames: List<String>? = null
        if (cursor in lines.indices && lines[cursor].isNotBlank() && !TURN_HEADER.matches(lines[cursor])) {
            participantNames = parseParticipantNames(lines[cursor], cursor + 1)
            cursor += 1
        }
        while (cursor in lines.indices && lines[cursor].isBlank()) cursor += 1
        if (cursor !in lines.indices || !TURN_HEADER.matches(lines[cursor])) {
            fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "MISSING_FIRST_TURN", cursor.coerceAtMost(lines.size - 1) + 1)
        }
        return Preamble(cursor, participantNames)
    }

    private fun parseParticipantNames(
        line: String,
        lineNumber: Int,
    ): List<String> {
        if (line.codePointCount() > MAX_PARTICIPANT_CODE_POINTS) {
            fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "PARTICIPANTS_TOO_LONG", lineNumber)
        }
        val names = line.split(',').map(String::trim)
        if (names.any { it.isEmpty() || it.codePointCount() > MAX_TITLE_CODE_POINTS }) {
            fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "INVALID_PARTICIPANT_LIST", lineNumber)
        }
        return names
    }

    private fun validatePreambleParticipants(
        participantNames: List<String>?,
        turns: List<ParsedTranscriptTurn>,
    ) {
        if (participantNames == null) return
        val participants = participantNames.toSet()
        if (turns.any { it.speakerName.trim() !in participants }) {
            fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "PARTICIPANT_LIST_MISMATCH")
        }
    }

    private fun parseTurns(
        lines: List<String>,
        firstTurnLine: Int,
    ): List<ParsedTranscriptTurn> {
        val turns = mutableListOf<ParsedTranscriptTurn>()
        var cursor = firstTurnLine
        var previousTimestamp = -1
        while (cursor < lines.size) {
            while (cursor < lines.size && lines[cursor].isBlank()) cursor += 1
            if (cursor >= lines.size) break

            val header = parseHeader(lines[cursor], cursor + 1, previousTimestamp)

            val textStart = cursor + 1
            val (text, nextCursor) = readTurnText(lines, textStart)
            cursor = nextCursor
            if (!text.hasMeaningfulContent()) {
                fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "EMPTY_TURN", textStart + 1)
            }
            turns +=
                ParsedTranscriptTurn(
                    turnId = "t${(turns.size + 1).toString().padStart(TURN_ID_WIDTH, '0')}",
                    speakerName = header.speaker,
                    startSeconds = header.timestamp,
                    text = text,
                )
            previousTimestamp = header.timestamp
        }
        if (turns.isEmpty()) fail(ErrorCode.TRANSCRIPT_EMPTY, "NO_TURNS")
        return turns
    }

    private fun parseHeader(
        line: String,
        lineNumber: Int,
        previousTimestamp: Int,
    ): TurnHeader {
        val match =
            TURN_HEADER.matchEntire(line)
                ?: fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "EXPECTED_TURN_HEADER", lineNumber)
        val speaker = match.groupValues[SPEAKER_GROUP]
        if (speaker.isBlank() || GENERIC_SPEAKER.matches(speaker)) {
            fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "UNSUPPORTED_SPEAKER_LABEL", lineNumber)
        }
        val timestamp =
            match.groupValues[MINUTES_GROUP].toInt() * SECONDS_PER_MINUTE +
                match.groupValues[SECONDS_GROUP].toInt()
        if (timestamp > MAX_TIMESTAMP_SECONDS) {
            fail(ErrorCode.TRANSCRIPT_DURATION_EXCEEDED, "TIMESTAMP_EXCEEDS_LIMIT", lineNumber)
        }
        if (timestamp <= previousTimestamp) {
            fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "TIMESTAMPS_NOT_INCREASING", lineNumber)
        }
        return TurnHeader(speaker, timestamp)
    }

    private fun readTurnText(
        lines: List<String>,
        textStart: Int,
    ): Pair<String, Int> {
        var cursor = textStart
        while (cursor < lines.size && !TURN_HEADER.matches(lines[cursor])) {
            if (TURN_HEADER_LIKE.matches(lines[cursor])) {
                fail(ErrorCode.TRANSCRIPT_FORMAT_INVALID, "UNSUPPORTED_TIMESTAMP", cursor + 1)
            }
            cursor += 1
        }
        val text =
            lines
                .subList(textStart, cursor)
                .dropWhile(String::isBlank)
                .dropLastWhile(String::isBlank)
                .joinToString("\n")
        return text to cursor
    }

    private fun fail(
        code: ErrorCode,
        reason: String,
        line: Int? = null,
    ): Nothing {
        val lineSuffix = line?.let { "; line=$it" }.orEmpty()
        throw AiGenerationException.Coded(code, "reason=$reason$lineSuffix")
    }

    private companion object {
        const val BYTE_ORDER_MARK = "\uFEFF"
        const val MAX_TIMESTAMP_SECONDS = 10_800
        const val MAX_TITLE_CODE_POINTS = 200
        const val MAX_PARTICIPANT_CODE_POINTS = 500
        const val NEWLINE = '\n'.code
        const val TAB = '\t'.code
        const val SPEAKER_GROUP = 1
        const val MINUTES_GROUP = 2
        const val SECONDS_GROUP = 3
        const val SECONDS_PER_MINUTE = 60
        const val TURN_ID_WIDTH = 6
        val TURN_HEADER = Regex("^(.+?)\\s+(\\d{1,3}):([0-5]\\d)\\s*$")
        val TURN_HEADER_LIKE = Regex("^.+?\\s+\\d{1,3}:\\d{2}(?::\\d{2})?\\s*$")
        val GENERIC_SPEAKER = Regex("^화자\\s*\\d+$")
        val EXPORT_DATE_AND_DURATION =
            Regex(
                "^\\d{4}\\.\\s*\\d{1,2}\\.\\s*\\d{1,2}\\.\\s*(오전|오후)\\s*" +
                    "\\d{1,2}:[0-5]\\d\\s*·\\s*\\d+분\\s*\\d+초$",
            )
    }

    private data class TurnHeader(
        val speaker: String,
        val timestamp: Int,
    )

    private data class Preamble(
        val firstTurnLine: Int,
        val participantNames: List<String>?,
    )
}

private fun String.codePointCount(): Int = codePointCount(0, length)

private fun String.hasMeaningfulContent(): Boolean =
    codePoints().anyMatch { codePoint ->
        !Character.isWhitespace(codePoint) &&
            !Character.isISOControl(codePoint) &&
            Character.getType(codePoint) != Character.FORMAT.toInt()
    }
