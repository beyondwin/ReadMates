package com.readmates.aigen.adapter.out.llm.common

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class SessionImportSchemaResourceTest {
    private val mapper = ObjectMapper()
    private val resource = SessionImportSchemaResource(mapper)

    @Test
    fun `loads schema from classpath as object node`() {
        val schema = resource.schema()
        assertNotNull(schema)
        assertEquals("object", schema.get("type").asText())
    }

    @Test
    fun `schema declares format const as readmates session import v1`() {
        val schema = resource.schema()
        val formatConst = schema.path("properties").path("format").path("const").asText()
        assertEquals("readmates-session-import:v1", formatConst)
    }

    @Test
    fun `schema requires the documented top-level fields`() {
        val required = resource.schema().get("required").map { it.asText() }.toSet()
        val expected = setOf(
            "format", "sessionNumber", "bookTitle", "meetingDate",
            "summary", "highlights", "oneLineReviews",
            "feedbackDocumentFileName", "feedbackDocumentMarkdown"
        )
        assertEquals(expected, required)
    }

    @Test
    fun `highlights array has min 1 max 6 items`() {
        val highlights = resource.schema().path("properties").path("highlights")
        assertEquals(1, highlights.path("minItems").asInt())
        assertEquals(6, highlights.path("maxItems").asInt())
    }

    @Test
    fun `schemaAsString returns deterministic JSON`() {
        val a = resource.schemaAsString()
        val b = resource.schemaAsString()
        assertTrue(a.isNotBlank())
        assertEquals(a, b)
    }
}
