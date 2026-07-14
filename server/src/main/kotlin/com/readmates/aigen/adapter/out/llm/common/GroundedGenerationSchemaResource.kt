package com.readmates.aigen.adapter.out.llm.common

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.module.kotlin.KotlinModule
import org.springframework.core.io.ClassPathResource
import org.springframework.stereotype.Component

/** Provider-neutral strict schema shared by the grounded budget guard and every provider adapter. */
@Component
class GroundedGenerationSchemaResource {
    private val objectMapper = ObjectMapper().registerModule(KotlinModule.Builder().build())
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
        const val RESOURCE_PATH = "aigen/grounded-session-generation-v2.schema.json"
    }
}
