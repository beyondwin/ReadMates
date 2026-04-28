package com.readmates.shared.cache

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import tools.jackson.databind.json.JsonMapper

class CacheJsonCodecTest {
    private val codec = CacheJsonCodec(JsonMapper.builder().findAndAddModules().build())

    @Test
    fun `round trips typed cache value`() {
        val encoded = codec.encode(SampleCacheValue(schemaVersion = 1, name = "reading-sai"))

        val decoded = codec.decode(encoded, SampleCacheValue::class.java)

        assertEquals(SampleCacheValue(schemaVersion = 1, name = "reading-sai"), decoded)
    }

    @Test
    fun `returns null for invalid json`() {
        val decoded = codec.decode("{", SampleCacheValue::class.java)

        assertEquals(null, decoded)
    }

    data class SampleCacheValue(
        var schemaVersion: Int = 0,
        var name: String = "",
    )
}
