@file:Suppress("TooManyFunctions")

package com.readmates.session.application.model

import com.readmates.session.application.HostSessionListQuery
import com.readmates.session.application.InvalidHostSessionCursorException
import com.readmates.sessionrecord.application.model.SessionRecordStatus
import com.readmates.shared.listing.application.model.HostListEpochKind
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

const val HOST_MEETING_LIST_ORDERING_VERSION = "host-list-v1"

enum class HostMeetingListMode {
    MEETING,
    RECORD,
    ;

    val epochKind: HostListEpochKind
        get() =
            when (this) {
                MEETING -> HostListEpochKind.MEETING
                RECORD -> HostListEpochKind.RECORD
            }

    val states: List<String>
        get() =
            when (this) {
                MEETING -> listOf("DRAFT", "OPEN")
                RECORD -> listOf("CLOSED", "PUBLISHED")
            }
}

data class HostMeetingListTuple(
    val attentionRank: Int,
    val meetingDate: LocalDate?,
    val stateRank: Int,
    val sessionNumber: Int,
    val sessionId: UUID,
)

data class HostMeetingListCursor(
    val orderingVersion: String = HOST_MEETING_LIST_ORDERING_VERSION,
    val clubId: UUID,
    val mode: HostMeetingListMode,
    val states: List<String>,
    val fingerprint: String,
    val epoch: Long,
    val evaluatedAt: Instant,
    val expiry: Instant,
    val keyVersion: Int,
    val last: HostMeetingListTuple?,
) {
    fun canonicalJson(): String =
        canonicalObject(
            linkedMapOf(
                "clubId" to clubId.toString(),
                "epoch" to epoch,
                "evaluatedAt" to evaluatedAt.toString(),
                "expiry" to expiry.toString(),
                "fingerprint" to fingerprint,
                "keyVersion" to keyVersion,
                "last" to last?.canonicalMap(),
                "mode" to mode.name.lowercase(),
                "orderingVersion" to orderingVersion,
                "states" to states,
            ),
        )

    fun restartTarget() = HostListRestartTarget(mode = mode, states = states)

    companion object {
        fun parse(payload: String): HostMeetingListCursor {
            val fields = parseObject(payload)
            val last = fields["last"]?.takeIf { it != "null" }?.let(::parseTuple)
            return HostMeetingListCursor(
                orderingVersion = text(fields, "orderingVersion"),
                clubId = uuid(fields, "clubId"),
                mode =
                    runCatching { HostMeetingListMode.valueOf(text(fields, "mode").uppercase()) }
                        .getOrElse { throw InvalidHostSessionCursorException() },
                states = parseStringArray(fields["states"] ?: throw InvalidHostSessionCursorException()),
                fingerprint = text(fields, "fingerprint"),
                epoch = number(fields, "epoch"),
                evaluatedAt = instant(fields, "evaluatedAt"),
                expiry = instant(fields, "expiry"),
                keyVersion = number(fields, "keyVersion").toInt(),
                last = last,
            )
        }
    }
}

data class HostListRestartTarget(
    val mode: HostMeetingListMode,
    val states: List<String>,
)

data class CanonicalHostSessionListQuery(
    val mode: HostMeetingListMode,
    val states: List<String>,
    val search: String?,
    val recordStatus: SessionRecordStatus?,
    val needsAttention: Boolean?,
    val fingerprint: String,
)

fun HostSessionListQuery.canonicalize(): CanonicalHostSessionListQuery {
    val selected = selectedModeAndStates()
    val normalizedSearch = search?.trim()?.lowercase()?.takeIf(String::isNotBlank)
    val fingerprint =
        fingerprintParts(
            selected.mode,
            selected.states,
            normalizedSearch,
            recordStatus,
            needsAttention,
        )
    return CanonicalHostSessionListQuery(
        mode = selected.mode,
        states = selected.states,
        search = normalizedSearch,
        recordStatus = recordStatus,
        needsAttention = needsAttention,
        fingerprint = fingerprint,
    )
}

fun HostSessionListQuery.usesSignedCursor(): Boolean = !mode.isNullOrBlank() || !states.isNullOrEmpty()

private data class SelectedListScope(
    val mode: HostMeetingListMode,
    val states: List<String>,
)

@Suppress("ThrowsCount")
private fun HostSessionListQuery.selectedModeAndStates(): SelectedListScope {
    val provided =
        listOfNotNull(state?.takeIf { it.isNotBlank() }, mode?.takeIf { it.isNotBlank() }).size +
            if (states.isNullOrEmpty()) {
                0
            } else {
                1
            }
    if (provided > 1) throw InvalidHostSessionListQueryException()
    val rawMode = mode?.trim()?.lowercase()?.takeIf(String::isNotBlank)
    if (rawMode != null) {
        val parsed =
            runCatching { HostMeetingListMode.valueOf(rawMode.uppercase()) }
                .getOrElse { throw InvalidHostSessionListQueryException() }
        return SelectedListScope(parsed, parsed.states)
    }
    val rawStates = states?.map { value -> value.trim().uppercase() }.orEmpty()
    if (rawStates.isEmpty()) throw InvalidHostSessionListQueryException()
    if (rawStates.size != rawStates.toSet().size) throw InvalidHostSessionListQueryException()
    val unknown = rawStates.filterNot { value -> value in ALL_HOST_LIST_STATES }
    if (unknown.isNotEmpty()) throw InvalidHostSessionListQueryException()
    val canonical = ALL_HOST_LIST_STATES.filter(rawStates::contains)
    val mode =
        HostMeetingListMode.entries.firstOrNull { candidate -> candidate.states == canonical }
            ?: throw InvalidHostSessionListQueryException()
    return SelectedListScope(mode, canonical)
}

fun fingerprintParts(
    mode: HostMeetingListMode,
    states: List<String>,
    search: String?,
    recordStatus: SessionRecordStatus?,
    needsAttention: Boolean?,
): String {
    val parts =
        listOf(
            HOST_MEETING_LIST_ORDERING_VERSION,
            mode.name,
            states.joinToString(","),
            search.orEmpty(),
            recordStatus?.name.orEmpty(),
            needsAttention?.toString().orEmpty(),
        )
    return java.security.MessageDigest
        .getInstance("SHA-256")
        .digest(parts.joinToString("\u0000").toByteArray(Charsets.UTF_8))
        .joinToString("") { byte -> "%02x".format(byte) }
}

fun hostMeetingStateRank(
    mode: HostMeetingListMode,
    state: String,
): Int =
    when (mode) {
        HostMeetingListMode.MEETING -> if (state == "OPEN") 0 else 1
        HostMeetingListMode.RECORD -> if (state == "CLOSED") 0 else 1
    }

@Suppress("CyclomaticComplexMethod", "MagicNumber")
fun hostMeetingAttentionRank(
    mode: HostMeetingListMode,
    state: String,
    meetingDate: LocalDate?,
    evaluatedOn: LocalDate,
    incompletePrep: Boolean,
    hasDraft: Boolean,
    recordStatus: SessionRecordStatus,
): Int =
    when (mode) {
        HostMeetingListMode.MEETING -> {
            val due = meetingDate == null || !meetingDate.isAfter(evaluatedOn)
            when {
                state == "OPEN" && due && incompletePrep -> 0
                state == "OPEN" && due -> 1
                state == "OPEN" && incompletePrep -> 2
                state == "OPEN" -> 3
                due -> 4
                else -> 5
            }
        }
        HostMeetingListMode.RECORD ->
            when {
                state == "PUBLISHED" && hasDraft -> 0
                state == "PUBLISHED" && recordStatus != SessionRecordStatus.COMPLETE -> 1
                state == "CLOSED" && hasDraft -> 2
                state == "CLOSED" && recordStatus != SessionRecordStatus.COMPLETE -> 3
                state == "PUBLISHED" -> 4
                else -> 5
            }
    }

class InvalidHostSessionListQueryException : RuntimeException("Invalid host session list query")

class HostListCursorStaleException(
    val restartTarget: HostListRestartTarget,
) : RuntimeException("Host list cursor is stale")

private val ALL_HOST_LIST_STATES = listOf("DRAFT", "OPEN", "CLOSED", "PUBLISHED")

private fun HostMeetingListTuple.canonicalMap(): Map<String, Any?> =
    linkedMapOf(
        "attentionRank" to attentionRank,
        "meetingDate" to meetingDate?.toString(),
        "sessionId" to sessionId.toString(),
        "sessionNumber" to sessionNumber,
        "stateRank" to stateRank,
    )

private fun canonicalObject(fields: Map<String, Any?>): String =
    fields.entries
        .sortedBy { entry -> entry.key }
        .joinToString(",", "{", "}") { (key, value) ->
            "${jsonString(key)}:${canonicalValue(value)}"
        }

private fun canonicalValue(value: Any?): String =
    when (value) {
        null -> "null"
        is String -> jsonString(value)
        is Number -> value.toString()
        is Boolean -> value.toString()
        is List<*> -> value.joinToString(",", "[", "]") { item -> canonicalValue(item) }
        is Map<*, *> ->
            canonicalObject(value.entries.associate { entry -> entry.key.toString() to entry.value })
        else -> jsonString(value.toString())
    }

private fun jsonString(value: String): String =
    buildString {
        append('"')
        value.forEach { character ->
            when (character) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                else -> append(character)
            }
        }
        append('"')
    }

private fun parseObject(json: String): Map<String, String> {
    val trimmed = json.trim()
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) throw InvalidHostSessionCursorException()
    return splitTopLevel(trimmed.substring(1, trimmed.length - 1)).associate { pair ->
        val colon = pair.indexOf(':')
        if (colon <= 0) throw InvalidHostSessionCursorException()
        decodeJsonString(pair.substring(0, colon).trim()) to pair.substring(colon + 1).trim()
    }
}

private fun parseTuple(json: String): HostMeetingListTuple {
    val fields = parseObject(json)
    return HostMeetingListTuple(
        attentionRank = number(fields, "attentionRank").toInt(),
        meetingDate = fields["meetingDate"]?.takeIf { it != "null" }?.let { LocalDate.parse(decodeJsonString(it)) },
        stateRank = number(fields, "stateRank").toInt(),
        sessionNumber = number(fields, "sessionNumber").toInt(),
        sessionId = uuid(fields, "sessionId"),
    )
}

private fun parseStringArray(json: String): List<String> {
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

private fun text(
    fields: Map<String, String>,
    key: String,
): String = decodeJsonString(fields[key] ?: throw InvalidHostSessionCursorException())

private fun number(
    fields: Map<String, String>,
    key: String,
): Long = fields[key]?.toLongOrNull() ?: throw InvalidHostSessionCursorException()

private fun uuid(
    fields: Map<String, String>,
    key: String,
): UUID =
    runCatching { UUID.fromString(text(fields, key)) }
        .getOrElse { throw InvalidHostSessionCursorException() }

private fun instant(
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
