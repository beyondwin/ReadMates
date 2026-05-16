package com.readmates.aigen.adapter.out.llm.claude

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

class ClaudeContentRegeneratorTest {
    private val mapper = ObjectMapper()
    private val schemaResource = SessionImportSchemaResource()

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
            model = ModelId(Provider.CLAUDE, "claude-sonnet-4-6"),
            instructions = null,
        )

    @Test
    fun `provider field is CLAUDE`() {
        val regen = ClaudeContentRegenerator(FakeClaudeApi(), schemaResource)
        assertEquals(Provider.CLAUDE, regen.provider)
    }

    @Test
    fun `SUMMARY uses narrowed schema with only summary property and returns String value`() {
        val toolInput = mapper.readTree("""{"summary": "새 요약 내용"}""") as ObjectNode
        val fake = FakeClaudeApi(result = ClaudeToolResult(toolInput, TokenUsage(10, 0, 20)))
        val regen = ClaudeContentRegenerator(fake, schemaResource)

        val output = regen.regenerateItem(inputFor(GenerationItem.SUMMARY))

        assertEquals(GenerationItem.SUMMARY, output.patchedItem)
        assertEquals("새 요약 내용", output.patchedValue)
        assertEquals(TokenUsage(10, 0, 20), output.usage)

        val narrowed = fake.lastToolSchema!!
        val props = narrowed.path("properties")
        assertTrue(props.has("summary"))
        assertEquals(1, props.size(), "properties must contain ONLY summary")
        assertEquals("object", narrowed.path("type").asText())
        assertFalse(narrowed.path("additionalProperties").asBoolean(true), "additionalProperties must be false")
        val required = narrowed.path("required")
        assertTrue(required.isArray && required.size() == 1 && required[0].asText() == "summary")
    }

    @Test
    fun `HIGHLIGHTS uses narrowed schema with only highlights array and returns List of AuthoredText`() {
        val toolInput =
            mapper.readTree(
                """{"highlights":[{"authorName":"김우승","text":"새 하이라이트 1"},{"authorName":"박지민","text":"새 하이라이트 2"}]}""",
            ) as ObjectNode
        val fake = FakeClaudeApi(result = ClaudeToolResult(toolInput, TokenUsage(0, 0, 0)))
        val regen = ClaudeContentRegenerator(fake, schemaResource)

        val output = regen.regenerateItem(inputFor(GenerationItem.HIGHLIGHTS))

        assertEquals(GenerationItem.HIGHLIGHTS, output.patchedItem)
        @Suppress("UNCHECKED_CAST")
        val highlights = output.patchedValue as List<SessionImportV1Snapshot.AuthoredText>
        assertEquals(2, highlights.size)
        assertEquals("김우승", highlights[0].authorName)
        assertEquals("새 하이라이트 1", highlights[0].text)

        val props = fake.lastToolSchema!!.path("properties")
        assertTrue(props.has("highlights"))
        assertEquals(1, props.size())
        assertEquals("array", props.path("highlights").path("type").asText())
    }

    @Test
    fun `ONE_LINE_REVIEWS uses narrowed schema and returns List of AuthoredText`() {
        val toolInput =
            mapper.readTree(
                """{"oneLineReviews":[{"authorName":"김우승","text":"한줄평1"}]}""",
            ) as ObjectNode
        val fake = FakeClaudeApi(result = ClaudeToolResult(toolInput, TokenUsage(0, 0, 0)))
        val regen = ClaudeContentRegenerator(fake, schemaResource)

        val output = regen.regenerateItem(inputFor(GenerationItem.ONE_LINE_REVIEWS))

        assertEquals(GenerationItem.ONE_LINE_REVIEWS, output.patchedItem)
        @Suppress("UNCHECKED_CAST")
        val reviews = output.patchedValue as List<SessionImportV1Snapshot.AuthoredText>
        assertEquals(1, reviews.size)
        assertEquals("한줄평1", reviews[0].text)

        val props = fake.lastToolSchema!!.path("properties")
        assertTrue(props.has("oneLineReviews"))
        assertEquals(1, props.size())
    }

    @Test
    fun `FEEDBACK_DOCUMENT uses narrowed schema with both feedback fields and returns Pair`() {
        val json =
            "{" +
                "\"feedbackDocumentFileName\":\"new.md\"," +
                "\"feedbackDocumentMarkdown\":\"<!-- readmates-feedback:v1 -->\\n# 독서모임 3차 피드백\\n새 내용\"" +
                "}"
        val toolInput = mapper.readTree(json) as ObjectNode
        val fake = FakeClaudeApi(result = ClaudeToolResult(toolInput, TokenUsage(0, 0, 0)))
        val regen = ClaudeContentRegenerator(fake, schemaResource)

        val output = regen.regenerateItem(inputFor(GenerationItem.FEEDBACK_DOCUMENT))

        assertEquals(GenerationItem.FEEDBACK_DOCUMENT, output.patchedItem)
        val value = output.patchedValue as ClaudeContentRegenerator.FeedbackDocumentValue
        assertEquals("new.md", value.fileName)
        assertTrue(value.markdown.contains("<!-- readmates-feedback:v1 -->"))

        val schema = fake.lastToolSchema!!
        val props = schema.path("properties")
        assertTrue(props.has("feedbackDocumentFileName"))
        assertTrue(props.has("feedbackDocumentMarkdown"))
        assertEquals(2, props.size())
        val required = schema.path("required").map { it.asText() }.toSet()
        assertTrue("feedbackDocumentFileName" in required)
        assertTrue("feedbackDocumentMarkdown" in required)
    }

    @Test
    fun `transcript block carries cache_control via expectCacheControl=true`() {
        val toolInput = mapper.readTree("""{"summary":"x"}""") as ObjectNode
        val fake = FakeClaudeApi(result = ClaudeToolResult(toolInput, TokenUsage(0, 0, 0)))
        val regen = ClaudeContentRegenerator(fake, schemaResource)

        regen.regenerateItem(inputFor(GenerationItem.SUMMARY))

        assertEquals(true, fake.lastExpectCacheControl)
    }

    @Test
    fun `regen user text mentions current snapshot JSON for context`() {
        val toolInput = mapper.readTree("""{"summary":"x"}""") as ObjectNode
        val fake = FakeClaudeApi(result = ClaudeToolResult(toolInput, TokenUsage(0, 0, 0)))
        val regen = ClaudeContentRegenerator(fake, schemaResource)

        regen.regenerateItem(inputFor(GenerationItem.SUMMARY))

        assertNotNull(fake.lastUserText)
        assertTrue(fake.lastUserText!!.contains("기존 summary"), "user message must contain current snapshot context")
    }

    @Test
    fun `PII invariant - wrapped error message never echoes sentinel from IOException`() {
        val sentinel = "UNIQUE-SENTINEL-12345"
        val fake = FakeClaudeApi(throwException = IOException("read failed near $sentinel"))
        val regen = ClaudeContentRegenerator(fake, schemaResource)

        val ex =
            assertThrows(LlmGenerationException::class.java) {
                regen.regenerateItem(inputFor(GenerationItem.SUMMARY))
            }

        assertFalse(ex.message!!.contains(sentinel))
        assertFalse(ex.error.message.contains(sentinel))
        assertEquals(ErrorCode.PROVIDER_UNAVAILABLE, ex.error.code)
    }
}
