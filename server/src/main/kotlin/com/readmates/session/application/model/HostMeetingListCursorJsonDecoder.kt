package com.readmates.session.application.model

import com.readmates.session.application.InvalidHostSessionCursorException
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

internal fun parseObject(json: String): Map<String, String> {
    val trimmed = json.trim()
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) throw InvalidHostSessionCursorException()
    return splitTopLevel(trimmed.substring(1, trimmed.length - 1)).associate { pair ->
        val colon = pair.indexOf(':')
        if (colon <= 0) throw InvalidHostSessionCursorException()
        decodeJsonString(pair.substring(0, colon).trim()) to pair.substring(colon + 1).trim()
    }
}

internal fun parseTuple(json: String): HostMeetingListTuple {
    val fields = parseObject(json)
    return HostMeetingListTuple(
        attentionRank = number(fields, "attentionRank").toInt(),
        meetingDate = fields["meetingDate"]?.takeIf { it != "null" }?.let { LocalDate.parse(decodeJsonString(it)) },
        stateRank = number(fields, "stateRank").toInt(),
        sessionNumber = number(fields, "sessionNumber").toInt(),
        sessionId = uuid(fields, "sessionId"),
    )
}

internal fun parseStringArray(json: String): List<String> {
    val trimmed = json.trim()
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) throw InvalidHostSessionCursorException()
    val body = trimmed.substring(1, trimmed.length - 1).trim()
    if (body.isEmpty()) return emptyList()
    return splitTopLevel(body).map(::decodeJsonString)
}

@Suppress("CyclomaticComplexMethod")
private fun splitTopLevel(body: String): List<String> {
    val parts = mutableListOf<String>()
    val current = StringBuilder()
    var depth = 0
    var inString = false
    var escape = false
    body.forEach { character ->
        when {
            escape -> {
                current.append(character)
                escape = false
            }
            character == '\\' && inString -> {
                current.append(character)
                escape = true
            }
            character == '"' -> {
                inString = !inString
                current.append(character)
            }
            !inString && (character == '{' || character == '[') -> {
                depth += 1
                current.append(character)
            }
            !inString && (character == '}' || character == ']') -> {
                depth -= 1
                current.append(character)
            }
            !inString && character == ',' && depth == 0 -> {
                parts += current.toString()
                current.clear()
            }
            else -> current.append(character)
        }
    }
    if (current.isNotEmpty()) parts += current.toString()
    return parts
}

internal fun text(
    fields: Map<String, String>,
    key: String,
): String = decodeJsonString(fields[key] ?: throw InvalidHostSessionCursorException())

internal fun number(
    fields: Map<String, String>,
    key: String,
): Long = fields[key]?.toLongOrNull() ?: throw InvalidHostSessionCursorException()

internal fun uuid(
    fields: Map<String, String>,
    key: String,
): UUID =
    runCatching { UUID.fromString(text(fields, key)) }
        .getOrElse { throw InvalidHostSessionCursorException() }

internal fun instant(
    fields: Map<String, String>,
    key: String,
): Instant =
    runCatching { Instant.parse(text(fields, key)) }
        .getOrElse { throw InvalidHostSessionCursorException() }

private fun decodeJsonString(raw: String): String {
    val trimmed = raw.trim()
    if (!trimmed.startsWith("\"") || !trimmed.endsWith("\"") || trimmed.length < 2) {
        throw InvalidHostSessionCursorException()
    }
    return trimmed.substring(1, trimmed.length - 1).replace("\\\"", "\"").replace("\\\\", "\\")
}
