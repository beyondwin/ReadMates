package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource
import com.readmates.aigen.application.model.AuthorNameMode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationInput
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionMeta
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.support.AiGenerationTestModels
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.IOException
import java.time.LocalDate
import java.util.UUID

class GeminiContentGeneratorTest {
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

    private val input =
        GenerationInput(
            transcript = "녹취록 내용 ...",
            sessionMeta = meta,
            model = ModelId(Provider.GEMINI, AiGenerationTestModels.GEMINI_DEFAULT),
            instructions = null,
        )

    private fun validSnapshotJson(): ObjectNode =
        mapper.readTree(
            """
            {
              "format": "readmates-session-import:v1",
              "sessionNumber": 3,
              "bookTitle": "데미안",
              "meetingDate": "2026-05-16",
              "summary": "두 시간 동안 데미안의 자아 발견 여정에 대해 토론했다.",
              "highlights": [
                {"authorName": "김우승", "text": "새는 알에서 나오려고 투쟁한다."}
              ],
              "oneLineReviews": [
                {"authorName": "김우승", "text": "자아탐색의 고전"},
                {"authorName": "박지민", "text": "어렵지만 의미 깊다"}
              ],
              "feedbackDocumentFileName": "feedback.md",
              "feedbackDocumentMarkdown": "<!-- readmates-feedback:v1 -->\n# 독서모임 3차 피드백\n내용"
            }
            """.trimIndent(),
        ) as ObjectNode

    @Test
    fun `happy path parses JSON response into SessionImportV1Snapshot and propagates usage`() {
        val fake =
            FakeGeminiApi(
                result =
                    GeminiToolResult(
                        parsed = validSnapshotJson(),
                        usage =
                            TokenUsage(
                                nonCachedInputTokens = 100,
                                cacheWriteInputTokens = 0,
                                cacheReadInputTokens = 50,
                                outputTokens = 200,
                            ),
                    ),
            )
        val generator = GeminiContentGenerator(fake, schemaResource, schemaAdapter)

        val output = generator.generateFull(input)

        assertEquals("readmates-session-import:v1", output.result.format)
        assertEquals(3, output.result.sessionNumber)
        assertEquals("데미안", output.result.bookTitle)
        assertEquals(LocalDate.of(2026, 5, 16), output.result.meetingDate)
        assertEquals(1, output.result.highlights.size)
        assertEquals("김우승", output.result.highlights[0].authorName)
        assertEquals(2, output.result.oneLineReviews.size)
        assertEquals("feedback.md", output.result.feedbackDocumentFileName)
        assertTrue(output.result.feedbackDocumentMarkdown.contains("<!-- readmates-feedback:v1 -->"))
        assertEquals(100, output.usage.nonCachedInputTokens)
        assertEquals(50, output.usage.cacheReadInputTokens)
        assertEquals(200, output.usage.outputTokens)
        assertEquals(4096, fake.lastMaxOutputTokens)
    }

    @Test
    fun `provider field is GEMINI`() {
        val generator = GeminiContentGenerator(FakeGeminiApi(), schemaResource, schemaAdapter)
        assertEquals(Provider.GEMINI, generator.provider)
    }

    @Test
    fun `forwards the requested model id name`() {
        val fake = FakeGeminiApi(result = GeminiToolResult(validSnapshotJson(), zeroUsage()))
        val generator = GeminiContentGenerator(fake, schemaResource, schemaAdapter)

        generator.generateFull(input)

        assertEquals(AiGenerationTestModels.GEMINI_DEFAULT, fake.lastModel)
    }

    @Test
    fun `passes transcript text through to the api port`() {
        val fake = FakeGeminiApi(result = GeminiToolResult(validSnapshotJson(), zeroUsage()))
        val generator = GeminiContentGenerator(fake, schemaResource, schemaAdapter)

        generator.generateFull(input)

        assertEquals("녹취록 내용 ...", fake.lastTranscriptText)
    }

    @Test
    fun `USER_PRELUDE matches Claude generator user prelude verbatim (cross-provider parity)`() {
        val fake = FakeGeminiApi(result = GeminiToolResult(validSnapshotJson(), zeroUsage()))
        val generator = GeminiContentGenerator(fake, schemaResource, schemaAdapter)

        generator.generateFull(input)

        val expected =
            "다음 녹취록을 바탕으로 readmates-session-import:v1 JSON 을 emit_session_import_v1 tool 호출로 생성해주세요."
        assertEquals(expected, fake.lastUserText)
    }

    @Test
    fun `system prompt is built via LlmPromptBuilder (contains hallucination rules)`() {
        val fake = FakeGeminiApi(result = GeminiToolResult(validSnapshotJson(), zeroUsage()))
        val generator = GeminiContentGenerator(fake, schemaResource, schemaAdapter)

        generator.generateFull(input)

        val sys = fake.lastSystemPrompt!!
        assertTrue(sys.contains("Hallucination 방지 규칙"))
        assertTrue(sys.contains("김우승"))
        assertTrue(sys.contains("데미안"))
    }

    @Test
    fun `passes Gemini-compatible responseSchema (no schema metadata, no additionalProperties, no const)`() {
        val fake = FakeGeminiApi(result = GeminiToolResult(validSnapshotJson(), zeroUsage()))
        val generator = GeminiContentGenerator(fake, schemaResource, schemaAdapter)

        generator.generateFull(input)

        val sentSchema = fake.lastResponseSchema!!
        assertFalse(sentSchema.has("\$schema"), "Gemini schema must NOT have \$schema")
        assertFalse(sentSchema.has("\$id"), "Gemini schema must NOT have \$id")
        assertFalse(
            findKeyAnywhere(sentSchema, "additionalProperties"),
            "Gemini schema must NOT carry additionalProperties anywhere",
        )
        assertFalse(
            findKeyAnywhere(sentSchema, "const"),
            "Gemini schema must NOT carry const (use single-element enum instead)",
        )
        // format property was const → must now be enum
        val formatProp = sentSchema.path("properties").path("format")
        assertTrue(formatProp.has("enum"), "format property must now carry enum")
    }

    @Test
    fun `PII invariant - wrapped error message never echoes sentinel from IOException`() {
        val sentinel = "UNIQUE-SENTINEL-12345"
        val fake =
            FakeGeminiApi(
                throwException = IOException("connection failed while reading $sentinel from upstream"),
            )
        val generator = GeminiContentGenerator(fake, schemaResource, schemaAdapter)

        val ex =
            assertThrows(LlmGenerationException::class.java) {
                generator.generateFull(input)
            }

        assertFalse(ex.message!!.contains(sentinel), "exception.message must NOT contain transcript sentinel")
        assertFalse(ex.error.message.contains(sentinel), "error.message must NOT contain transcript sentinel")
        assertEquals(ErrorCode.PROVIDER_UNAVAILABLE, ex.error.code)
        assertNotNull(ex.cause, "original cause is preserved for logging but not surfaced in message")
    }

    @Test
    fun `rate-limited upstream exception maps to PROVIDER_RATE_LIMITED without leaking sentinel`() {
        val sentinel = "UNIQUE-SENTINEL-12345"
        val fake = FakeGeminiApi(throwException = RuntimeException("rate_limit 429 around $sentinel"))
        val generator = GeminiContentGenerator(fake, schemaResource, schemaAdapter)

        val ex =
            assertThrows(LlmGenerationException::class.java) {
                generator.generateFull(input)
            }

        assertEquals(ErrorCode.PROVIDER_RATE_LIMITED, ex.error.code)
        assertFalse(ex.message!!.contains(sentinel))
    }

    private fun zeroUsage() =
        TokenUsage(
            nonCachedInputTokens = 0,
            cacheWriteInputTokens = 0,
            cacheReadInputTokens = 0,
            outputTokens = 0,
        )

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
