package com.readmates.session.application.model

internal fun HostMeetingListTuple.canonicalMap(): Map<String, Any?> =
    linkedMapOf(
        "attentionRank" to attentionRank,
        "meetingDate" to meetingDate?.toString(),
        "sessionId" to sessionId.toString(),
        "sessionNumber" to sessionNumber,
        "stateRank" to stateRank,
    )

internal fun canonicalObject(fields: Map<String, Any?>): String =
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
