package com.readmates.session.application

import com.readmates.shared.security.Sha256
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

internal object HostSessionRestoreHashes {
    private val DIGEST = Regex("^[0-9a-f]{64}$")

    fun isDigest(value: String): Boolean = DIGEST.matches(value)

    fun digest(values: Map<String, String?>): String = Sha256.hex(canonicalJson(values))

    fun matches(
        expectedHex: String,
        values: Map<String, String?>,
    ): Boolean {
        if (!isDigest(expectedHex)) return false
        val actual = digest(values)
        return MessageDigest.isEqual(
            expectedHex.toByteArray(StandardCharsets.UTF_8),
            actual.toByteArray(StandardCharsets.UTF_8),
        )
    }
}

internal fun canonicalJson(values: Map<String, String?>): String =
    values.toSortedMap().entries.joinToString(separator = ",", prefix = "{", postfix = "}") { (key, value) ->
        "\"${escapeJson(key)}\":${value.toJsonValue()}"
    }

private fun String?.toJsonValue(): String = this?.let { "\"${escapeJson(it)}\"" } ?: "null"

private fun escapeJson(value: String): String =
    buildString(value.length) {
        value.forEach { ch ->
            when (ch) {
                '\\' -> append("\\\\")
                '"' -> append("\\\"")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (ch < ' ') append("\\u").append(ch.code.toString(16).padStart(4, '0')) else append(ch)
            }
        }
    }
