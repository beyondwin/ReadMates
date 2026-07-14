package com.readmates.aigen.adapter.out.llm.common

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode

class LlmStructuredOutputException(
    cause: Throwable? = null,
) : RuntimeException(SAFE_MESSAGE, cause) {
    private companion object {
        const val SAFE_MESSAGE = "provider returned invalid structured output"
    }
}

object StructuredOutputJson {
    fun parseObject(
        text: String,
        objectMapper: ObjectMapper,
    ): ObjectNode =
        try {
            requireObject(objectMapper.readTree(text))
        } catch (error: LlmStructuredOutputException) {
            throw error
        } catch (
            @Suppress("TooGenericExceptionCaught") error: Throwable,
        ) {
            throw LlmStructuredOutputException(error)
        }

    fun requireObject(node: JsonNode?): ObjectNode = node as? ObjectNode ?: throw LlmStructuredOutputException()
}
