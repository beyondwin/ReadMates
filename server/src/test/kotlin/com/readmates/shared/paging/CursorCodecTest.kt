package com.readmates.shared.paging

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class CursorCodecTest {
    @Test
    fun `encode round trips cursor values with reserved characters`() {
        val cursor =
            mapOf(
                "number" to "7",
                "id" to "session%26id=readmates",
            )

        val encoded = CursorCodec.encode(cursor)
        val decoded = CursorCodec.decode(encoded)

        assertEquals(encoded, CursorCodec.encode(cursor.entries.reversed().associate { it.toPair() }))
        assertEquals(listOf("id", "number"), decoded?.keys?.toList())
        assertEquals(mapOf("id" to "session%26id=readmates", "number" to "7"), decoded)
    }

    @Test
    fun `decode returns null for missing blank or invalid cursor`() {
        assertNull(CursorCodec.decode(null))
        assertNull(CursorCodec.decode(""))
        assertNull(CursorCodec.decode("not-base64"))
    }

    @Test
    fun `strict decode rejects blank malformed duplicate and non canonical cursors`() {
        val encoder =
            java.util.Base64
                .getUrlEncoder()
                .withoutPadding()
        val duplicateKeys = encoder.encodeToString("id=one&id=two".toByteArray())
        val unsortedKeys = encoder.encodeToString("number=7&id=one".toByteArray())

        assertNull(CursorCodec.decodeStrict(null))
        val canonical = CursorCodec.encode(mapOf("number" to "7", "id" to "one"))
        assertEquals(mapOf("id" to "one", "number" to "7"), CursorCodec.decodeStrict(canonical))
        listOf("", "not-base64", duplicateKeys, unsortedKeys).forEach { raw ->
            assertThrows(InvalidCursorEncodingException::class.java) {
                CursorCodec.decodeStrict(raw)
            }
        }
    }

    @Test
    fun `page request clamps requested limit and defaults missing limit`() {
        assertEquals(
            PageRequest(limit = 20, cursor = emptyMap()),
            PageRequest.cursor(requestedLimit = null, rawCursor = null, defaultLimit = 20, maxLimit = 100),
        )
        assertEquals(
            PageRequest(limit = 1, cursor = emptyMap()),
            PageRequest.cursor(requestedLimit = 0, rawCursor = null, defaultLimit = 20, maxLimit = 100),
        )
        assertEquals(
            PageRequest(limit = 100, cursor = emptyMap()),
            PageRequest.cursor(requestedLimit = 250, rawCursor = null, defaultLimit = 20, maxLimit = 100),
        )
    }
}
