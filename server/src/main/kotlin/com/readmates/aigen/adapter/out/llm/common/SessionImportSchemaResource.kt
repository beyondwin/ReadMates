package com.readmates.aigen.adapter.out.llm.common

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.KotlinModule
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Component

/**
 * Loads the readmates-session-import:v1 JSON Schema from the classpath.
 * Single source of truth used by all LLM provider adapters
 * (Claude tool input_schema, OpenAI response_format.json_schema, Gemini responseSchema).
 */
@Component
class SessionImportSchemaResource {
    private val objectMapper: ObjectMapper =
        ObjectMapper().registerModule(KotlinModule.Builder().build())

    private val cached: ObjectNode by lazy { loadFromClasspath() }

    fun schema(): ObjectNode = cached.deepCopy()

    fun schemaAsString(): String = objectMapper.writeValueAsString(cached)

    private fun loadFromClasspath(): ObjectNode {
        val resource = ClassPathResource(RESOURCE_PATH)
        return resource.inputStream.use { stream ->
            val tree = objectMapper.readTree(stream)
            require(tree is ObjectNode) { "Expected JSON object at $RESOURCE_PATH" }
            tree
        }
    }

    companion object {
        const val RESOURCE_PATH = "aigen/session-import-v1.schema.json"
    }
}
