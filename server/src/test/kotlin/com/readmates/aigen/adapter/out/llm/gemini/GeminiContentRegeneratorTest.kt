package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.RegenerationInput
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException
import java.time.LocalDate
import java.util.UUID

class GeminiContentRegeneratorTest {
    private val mapper = ObjectMapper()
    private val schemaResource = SessionImportSchemaResource()
    private val schemaAdapter = GeminiSchemaCompatAdapter(schemaResource)

    private val meta =
        SessionMeta(
            sessionId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000002"),
            sessionNumber = 3,
            bookTitle = "데미안",
            bookAuthor = "헤르만 헤세",
            meetingDate = LocalDate.of(2026, 5, 16),
            expectedAuthorNames = listOf("김우승", "박지민"),
            authorNameMode = AuthorNameMode.REAL,
        )

    private val currentSnapshot =
        SessionImportV1Snapshot(
            format = "readmates-session-import:v1",
            sessionNumber = 3,
            bookTitle = "데미안",
            meetingDate = LocalDate.of(2026, 5, 16),
            summary = "기존 summary",
            highlights = listOf(SessionImportV1Snapshot.AuthoredText("김우승", "기존 하이라이트")),
            oneLineReviews = listOf(SessionImportV1Snapshot.AuthoredText("김우승", "기존 한줄평")),
            feedbackDocumentFileName = "feedback.md",
            feedbackDocumentMarkdown = "<!-- readmates-feedback:v1 -->\n# 독서모임 3차 피드백",
        )

    private fun inputFor(item: GenerationItem) =
        RegenerationInput(
            transcript = "녹취록 ...",
            currentResult = currentSnapshot,
            item = item,
            sessionMeta = meta,
            model = ModelId(Provider.GEMINI, "gemini-2-5-pro"),
            instructions = null,
        )

    @Test
    fun `provider field is GEMINI`() {
        val regen = GeminiContentRegenerator(FakeGeminiApi(), schemaResource, schemaAdapter)
        assertEquals(Provider.GEMINI, regen.provider)
    }

    @Test
    fun `SUMMARY uses narrowed Gemini-compatible schema and returns String value`() {
        val toolInput = mapper.readTree("""{"summary": "새 요약 내용"}""") as ObjectNode
        val fake = FakeGeminiApi(result = GeminiToolResult(toolInput, TokenUsage(10, 0, 20)))
        val regen = GeminiContentRegenerator(fake, schemaResource, schemaAdapter)

        val output = regen.regenerateItem(inputFor(GenerationItem.SUMMARY))

        assertEquals(GenerationItem.SUMMARY, output.patchedItem)
        assertEquals("새 요약 내용", output.patchedValue)
        assertEquals(TokenUsage(10, 0, 20), output.usage)

        val sent = fake.lastResponseSchema!!
        val props = sent.path("properties")
        assertTrue(props.has("summary"))
        assertEquals(1, props.size(), "properties must contain ONLY summary")
        assertEquals("object", sent.path("type").asText())
        assertFalse(
            findKeyAnywhere(sent, "additionalProperties"),
            "Gemini-converted narrowed schema must NOT carry additionalProperties",
        )
        val required = sent.path("required")
        assertTrue(required.isArray && required.size() == 1 && required[0].asText() == "summary")
    }

    @Test
    fun `HIGHLIGHTS returns List of AuthoredText and narrows to only highlights`() {
        val toolInput =
            mapper.readTree(
                """{"highlights":[{"authorName":"김우승","text":"새 하이라이트 1"},{"authorName":"박지민","text":"새 하이라이트 2"}]}""",
            ) as ObjectNode
        val fake = FakeGeminiApi(result = GeminiToolResult(toolInput, TokenUsage(0, 0, 0)))
        val regen = GeminiContentRegenerator(fake, schemaResource, schemaAdapter)

        val output = regen.regenerateItem(inputFor(GenerationItem.HIGHLIGHTS))

        assertEquals(GenerationItem.HIGHLIGHTS, output.patchedItem)
        @Suppress("UNCHECKED_CAST")
        val highlights = output.patchedValue as List<SessionImportV1Snapshot.AuthoredText>
        assertEquals(2, highlights.size)
        assertEquals("김우승", highlights[0].authorName)
        assertEquals("새 하이라이트 1", highlights[0].text)

        val props = fake.lastResponseSchema!!.path("properties")
        assertTrue(props.has("highlights"))
        assertEquals(1, props.size())
        assertEquals("array", props.path("highlights").path("type").asText())
    }

    @Test
    fun `ONE_LINE_REVIEWS returns List of AuthoredText`() {
        val toolInput =
            mapper.readTree(
                """{"oneLineReviews":[{"authorName":"김우승","text":"한줄평1"}]}""",
            ) as ObjectNode
        val fake = FakeGeminiApi(result = GeminiToolResult(toolInput, TokenUsage(0, 0, 0)))
        val regen = GeminiContentRegenerator(fake, schemaResource, schemaAdapter)

        val output = regen.regenerateItem(inputFor(GenerationItem.ONE_LINE_REVIEWS))

        assertEquals(GenerationItem.ONE_LINE_REVIEWS, output.patchedItem)
        @Suppress("UNCHECKED_CAST")
        val reviews = output.patchedValue as List<SessionImportV1Snapshot.AuthoredText>
        assertEquals(1, reviews.size)
        assertEquals("한줄평1", reviews[0].text)

        val props = fake.lastResponseSchema!!.path("properties")
        assertTrue(props.has("oneLineReviews"))
        assertEquals(1, props.size())
    }

    @Test
    fun `FEEDBACK_DOCUMENT returns FeedbackDocumentValue and narrows to both feedback fields`() {
        val json =
            "{" +
                "\"feedbackDocumentFileName\":\"new.md\"," +
                "\"feedbackDocumentMarkdown\":\"<!-- readmates-feedback:v1 -->\\n# 독서모임 3차 피드백\\n새 내용\"" +
                "}"
        val toolInput = mapper.readTree(json) as ObjectNode
        val fake = FakeGeminiApi(result = GeminiToolResult(toolInput, TokenUsage(0, 0, 0)))
        val regen = GeminiContentRegenerator(fake, schemaResource, schemaAdapter)

        val output = regen.regenerateItem(inputFor(GenerationItem.FEEDBACK_DOCUMENT))

        assertEquals(GenerationItem.FEEDBACK_DOCUMENT, output.patchedItem)
        val value = output.patchedValue as GeminiContentRegenerator.FeedbackDocumentValue
        assertEquals("new.md", value.fileName)
        assertTrue(value.markdown.contains("<!-- readmates-feedback:v1 -->"))

        val schema = fake.lastResponseSchema!!
        val props = schema.path("properties")
        assertTrue(props.has("feedbackDocumentFileName"))
        assertTrue(props.has("feedbackDocumentMarkdown"))
        assertEquals(2, props.size())
        val required = schema.path("required").map { it.asText() }.toSet()
        assertTrue("feedbackDocumentFileName" in required)
        assertTrue("feedbackDocumentMarkdown" in required)
    }

    @Test
    fun `regen user text mentions current snapshot JSON for context`() {
        val toolInput = mapper.readTree("""{"summary":"x"}""") as ObjectNode
        val fake = FakeGeminiApi(result = GeminiToolResult(toolInput, TokenUsage(0, 0, 0)))
        val regen = GeminiContentRegenerator(fake, schemaResource, schemaAdapter)

        regen.regenerateItem(inputFor(GenerationItem.SUMMARY))

        assertNotNull(fake.lastUserText)
        assertTrue(fake.lastUserText!!.contains("기존 summary"), "user message must contain current snapshot context")
    }

    @Test
    fun `PII invariant - wrapped error message never echoes sentinel from IOException`() {
        val sentinel = "UNIQUE-SENTINEL-12345"
        val fake = FakeGeminiApi(throwException = IOException("read failed near $sentinel"))
        val regen = GeminiContentRegenerator(fake, schemaResource, schemaAdapter)

        val ex =
            assertThrows(LlmGenerationException::class.java) {
                regen.regenerateItem(inputFor(GenerationItem.SUMMARY))
            }

        assertFalse(ex.message!!.contains(sentinel))
        assertFalse(ex.error.message.contains(sentinel))
        assertEquals(ErrorCode.PROVIDER_UNAVAILABLE, ex.error.code)
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
