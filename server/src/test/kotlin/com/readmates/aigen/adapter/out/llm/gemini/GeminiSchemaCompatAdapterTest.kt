package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.adapter.out.llm.common.GroundedGenerationSchemaResource
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class GeminiSchemaCompatAdapterTest {
    private val schemaResource = GroundedGenerationSchemaResource()
    private val adapter = GeminiSchemaCompatAdapter()

    @Test
    fun `removes top-level json-schema metadata that Gemini rejects`() {
        val converted = adapter.convert(schemaResource.schema())

        assertThat(converted.has("\$schema")).isFalse()
        assertThat(converted.has("\$id")).isFalse()
    }

    @Test
    fun `recursively strips additionalProperties everywhere`() {
        val converted = adapter.convert(schemaResource.schema())

        assertThat(findKeyAnywhere(converted, "additionalProperties"))
            .`as`("Gemini OpenAPI 3.0 subset does not support additionalProperties anywhere in the schema")
            .isFalse()
    }

    @Test
    fun `recursively strips const (Draft 2020-12) which Gemini does not support`() {
        val converted = adapter.convert(schemaResource.schema())

        assertThat(findKeyAnywhere(converted, "const"))
            .`as`("const must be replaced by single-element enum for Gemini")
            .isFalse()
    }

    @Test
    fun `replaces format const string with single-element enum`() {
        val converted = adapter.convert(schemaResource.schema())

        val formatProp =
            converted.get("properties").get("format") as ObjectNode
        assertThat(formatProp.get("type").asText()).isEqualTo("string")
        val enumNode = formatProp.get("enum")
        assertThat(enumNode).isNotNull
        assertThat(enumNode.isArray).isTrue()
        assertThat(enumNode.size()).isEqualTo(1)
        assertThat(enumNode.get(0).asText()).isEqualTo("readmates-grounded-generation:v2")
        assertThat(formatProp.has("const")).isFalse()
    }

    @Test
    fun `retains supported keywords and min-max constraints`() {
        val converted = adapter.convert(schemaResource.schema())

        assertThat(converted.get("type").asText()).isEqualTo("object")
        assertThat(converted.has("properties")).isTrue()
        assertThat(converted.get("required").isArray).isTrue()

        // meetingDate keeps format: date (a recognized OpenAPI 3.0 format).
        val meetingDate = converted.get("properties").get("meetingDate") as ObjectNode
        assertThat(meetingDate.get("format").asText()).isEqualTo("date")

        // sessionNumber keeps minimum.
        val sessionNumber = converted.get("properties").get("sessionNumber") as ObjectNode
        assertThat(sessionNumber.get("minimum").asInt()).isEqualTo(1)

        // bookTitle keeps minLength.
        val bookTitle = converted.get("properties").get("bookTitle") as ObjectNode
        assertThat(bookTitle.get("minLength").asInt()).isEqualTo(1)

        // highlights keeps minItems / maxItems.
        val highlights = converted.get("properties").get("highlights") as ObjectNode
        assertThat(highlights.get("minItems").asInt()).isEqualTo(1)
        assertThat(highlights.get("maxItems").asInt()).isEqualTo(6)

        // highlights.items still has nested properties + required.
        val items = highlights.get("items") as ObjectNode
        assertThat(items.get("type").asText()).isEqualTo("object")
        assertThat(items.has("properties")).isTrue()
        assertThat(items.get("required").isArray).isTrue()
        assertThat(items.has("additionalProperties")).isFalse()
    }

    @Test
    fun `strips unknown format vocabulary but keeps recognized formats`() {
        val node =
            jsonNode(
                """
                {
                  "type": "object",
                  "properties": {
                    "a": {"type": "string", "format": "uuid"},
                    "b": {"type": "string", "format": "date"},
                    "c": {"type": "string", "format": "date-time"},
                    "d": {"type": "string", "format": "email"}
                  }
                }
                """.trimIndent(),
            )

        val result = adapter.convert(node)

        val props = result.get("properties")
        assertThat(props.get("a").has("format")).isFalse()
        assertThat(props.get("b").get("format").asText()).isEqualTo("date")
        assertThat(props.get("c").get("format").asText()).isEqualTo("date-time")
        assertThat(props.get("d").has("format")).isFalse()
    }

    @Test
    fun `drops ref defs and definitions defensively`() {
        val node =
            jsonNode(
                """
                {
                  "type": "object",
                  "${'$'}defs": {"X": {"type": "string"}},
                  "definitions": {"Y": {"type": "string"}},
                  "properties": {
                    "a": {"${'$'}ref": "#/${'$'}defs/X"}
                  }
                }
                """.trimIndent(),
            )

        val result = adapter.convert(node)

        assertThat(result.has("\$defs")).isFalse()
        assertThat(result.has("definitions")).isFalse()
        assertThat(findKeyAnywhere(result, "\$ref")).isFalse()
    }

    @Test
    fun `does not mutate the source schema (deep copy invariant)`() {
        val originalSource = schemaResource.schema()
        val first = adapter.convert(schemaResource.schema())
        val second = adapter.convert(schemaResource.schema())

        // Mutating the returned node must not affect subsequent calls.
        first.put("__mutated__", true)

        assertThat(second.has("__mutated__")).isFalse()
        assertThat(schemaResource.schema()).isEqualTo(originalSource)
    }

    @Test
    fun `returns equal-but-not-same instances on repeated calls`() {
        val first = adapter.convert(schemaResource.schema())
        val second = adapter.convert(schemaResource.schema())

        assertThat(first).isEqualTo(second)
        assertThat(first).isNotSameAs(second)
    }

    @Test
    fun `conversion is idempotent (convert(convert(x)) == convert(x))`() {
        val once = adapter.convert(schemaResource.schema())
        val twice = adapter.convert(once)

        assertThat(twice).isEqualTo(once)
    }

    @Test
    fun `adapts the canonical grounded schema string without retaining unsupported keywords`() {
        val schema =
            """
            {
              "${'$'}schema":"https://json-schema.org/draft/2020-12/schema",
              "type":"object",
              "additionalProperties":false,
              "properties":{"format":{"const":"readmates-grounded:v1"}},
              "required":["format"]
            }
            """.trimIndent()

        val adapted = jsonNode(adapter.adapt(schema))

        assertThat(adapted.has("${'$'}schema")).isFalse()
        assertThat(adapted.has("additionalProperties")).isFalse()
        assertThat(
            adapted
                .path("properties")
                .path("format")
                .path("enum")
                .first()
                .asText(),
        ).isEqualTo("readmates-grounded:v1")
    }

    private fun jsonNode(json: String): ObjectNode {
        val mapper =
            com.fasterxml.jackson.databind
                .ObjectMapper()
        return mapper.readTree(json) as ObjectNode
    }

    private fun findKeyAnywhere(
        node: JsonNode,
        key: String,
    ): Boolean {
        if (node.isObject && node.has(key)) return true
        val children: Iterable<JsonNode> =
            when {
                node.isObject -> node.properties().map { it.value }
                node.isArray -> node.toList()
                else -> emptyList()
            }
        return children.any { findKeyAnywhere(it, key) }
    }
}
