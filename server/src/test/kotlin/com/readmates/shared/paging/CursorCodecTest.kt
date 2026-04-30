package com.readmates.shared.paging

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class CursorCodecTest {
    @Test
    fun `encode round trips cursor values with reserved characters`() {
        val cursor = mapOf(
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
