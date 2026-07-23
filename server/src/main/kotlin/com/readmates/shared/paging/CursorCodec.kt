package com.readmates.shared.paging

import java.net.URLDecoder
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.Base64

object CursorCodec {
    private val encoder = Base64.getUrlEncoder().withoutPadding()
    private val decoder = Base64.getUrlDecoder()

    fun encode(cursor: Map<String, String>): String? {
        if (cursor.isEmpty()) {
            return null
        }

        val payload =
            cursor.toSortedMap().entries.joinToString("&") { (key, value) ->
                "${escape(key)}=${escape(value)}"
            }
        return encoder.encodeToString(payload.toByteArray(StandardCharsets.UTF_8))
    }

    fun decode(rawCursor: String?): Map<String, String>? {
        if (rawCursor.isNullOrBlank()) {
            return null
        }

        return runCatching {
            val payload = String(decoder.decode(rawCursor), StandardCharsets.UTF_8)
            if (payload.isBlank()) {
                return null
            }

            val cursor = linkedMapOf<String, String>()
            payload.split("&").forEach { pair ->
                val separatorIndex = pair.indexOf("=")
                if (separatorIndex < 0) {
                    return null
                }
                val key = unescape(pair.substring(0, separatorIndex))
                val value = unescape(pair.substring(separatorIndex + 1))
                cursor[key] = value
            }
            cursor.toSortedMap()
        }.getOrNull()
    }

    @Suppress("ThrowsCount")
    fun decodeStrict(rawCursor: String?): Map<String, String>? {
        if (rawCursor == null) return null
        if (rawCursor.isBlank()) throw InvalidCursorEncodingException()
        val payload =
            try {
                val bytes = decoder.decode(rawCursor)
                if (encoder.encodeToString(bytes) != rawCursor) throw InvalidCursorEncodingException()
                String(bytes, StandardCharsets.UTF_8)
            } catch (error: IllegalArgumentException) {
                throw InvalidCursorEncodingException(error)
            }
        if (payload.isBlank()) throw InvalidCursorEncodingException()

        val cursor = linkedMapOf<String, String>()
        payload.split("&").forEach { pair ->
            val separatorIndex = pair.indexOf("=")
            if (separatorIndex <= 0) throw InvalidCursorEncodingException()
            val key =
                runCatching { unescape(pair.substring(0, separatorIndex)) }
                    .getOrElse { throw InvalidCursorEncodingException(it) }
            val value =
                runCatching { unescape(pair.substring(separatorIndex + 1)) }
                    .getOrElse { throw InvalidCursorEncodingException(it) }
            if (key.isBlank() || cursor.putIfAbsent(key, value) != null) throw InvalidCursorEncodingException()
        }
        val canonical = cursor.toSortedMap()
        if (encode(canonical) != rawCursor) throw InvalidCursorEncodingException()
        return canonical
    }

    private fun escape(value: String): String = URLEncoder.encode(value, StandardCharsets.UTF_8)

    private fun unescape(value: String): String = URLDecoder.decode(value, StandardCharsets.UTF_8)
}

class InvalidCursorEncodingException(
    cause: Throwable? = null,
) : IllegalArgumentException("Invalid cursor encoding", cause)
