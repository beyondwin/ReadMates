package com.readmates.aigen.adapter.out.llm.common

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class GroundedGenerationSchemaResourceTest {
    private val resource = GroundedGenerationSchemaResource()

    @Test
    fun `grounded schema requires all sections and evidence turn ids`() {
        val schema = resource.schema()
        val required = schema.path("required").map { it.asText() }.toSet()

        assertEquals(
            setOf(
                "format",
                "sessionNumber",
                "bookTitle",
                "meetingDate",
                "summaryBlocks",
                "highlights",
                "oneLineReviews",
                "feedbackDocumentFileName",
                "feedbackSections",
            ),
            required,
        )
        assertEquals(6, schema.at("/properties/highlights/maxItems").asInt())
        assertEquals(1, schema.at("/properties/highlights/minItems").asInt())
        assertEquals(
            listOf("text", "evidenceTurnIds"),
            schema.at("/\$defs/textBlock/required").map { it.asText() },
        )
        assertEquals(
            listOf("authorName", "text", "evidenceTurnIds"),
            schema.at("/\$defs/authoredText/required").map { it.asText() },
        )
        assertFalse(schema.path("additionalProperties").asBoolean(true))
    }

    @Test
    fun `schema string is deterministic and provider neutral`() {
        val first = resource.schemaAsString()

        assertTrue(first.isNotBlank())
        assertEquals(first, resource.schemaAsString())
        assertFalse(first.contains("openai", ignoreCase = true))
        assertFalse(first.contains("claude", ignoreCase = true))
        assertFalse(first.contains("gemini", ignoreCase = true))
    }
}
