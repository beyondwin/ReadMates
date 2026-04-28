package com.readmates.shared.cache

import org.springframework.stereotype.Component
import tools.jackson.databind.ObjectMapper

@Component
class CacheJsonCodec(
    private val objectMapper: ObjectMapper,
) {
    fun encode(value: Any): String =
        objectMapper.writeValueAsString(value)

    fun <T : Any> decode(raw: String, type: Class<T>): T? =
        runCatching { objectMapper.readValue(raw, type) }.getOrNull()
}
