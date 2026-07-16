package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.common.GroundedGenerationSchemaResource
import com.readmates.aigen.adapter.out.llm.common.GroundedProviderTestFixture
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource
import com.readmates.aigen.adapter.out.llm.common.StructuredOutputJson
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import java.io.IOException
import java.time.Duration

@Suppress("MaxLineLength")
class GeminiWholeTranscriptGroundedGeneratorTest {
    private val compat = GeminiSchemaCompatAdapter(SessionImportSchemaResource())

    @Test
    fun `rejects a model owned by another provider before API work`() {
        val fake = FakeGeminiApi(GeminiToolResult(GroundedProviderTestFixture.draftNode(), usage()))
        val generator = GeminiWholeTranscriptGroundedGenerator(fake, GroundedDraftJsonCodec(), compat)

        assertThatThrownBy {
            generator.generate(GroundedProviderTestFixture.model(Provider.OPENAI), GroundedProviderTestFixture.request())
        }.isInstanceOf(IllegalArgumentException::class.java)
        assertThat(fake.lastModel).isNull()
    }

    @Test
    fun `primary forwards exact compatible schema output limit and parses draft`() {
        val fake = FakeGeminiApi(GeminiToolResult(GroundedProviderTestFixture.draftNode(), usage()))
        val generator = GeminiWholeTranscriptGroundedGenerator(fake, GroundedDraftJsonCodec(), compat)
        val compatibleSchema = compat.convert(GroundedGenerationSchemaResource().schema()).toString()
        val request = GroundedProviderTestFixture.request(compatibleSchema)

        val output = generator.generate(GroundedProviderTestFixture.model(Provider.GEMINI), request)

        assertThat(output.draft.summaryBlocks).hasSize(1)
        assertThat(fake.lastSystemPrompt).isEqualTo(request.systemText)
        assertThat(fake.lastUserText).isEqualTo(request.userText)
        assertThat(fake.lastResponseSchema.toString()).isEqualTo(request.schemaJson)
        assertThat(fake.lastResponseSchema.toString()).doesNotContain("\$ref", "\$defs")
        assertThat(fake.lastMaxOutputTokens).isEqualTo(16_384)
    }

    @Test
    fun `repair is section typed and keeps full context`() {
        val fake = FakeGeminiApi(GeminiToolResult(GroundedProviderTestFixture.highlightRepairNode(), usage()))
        val generator = GeminiWholeTranscriptGroundedGenerator(fake, GroundedDraftJsonCodec(), compat)
        val request = GroundedProviderTestFixture.request(GroundedProviderTestFixture.HIGHLIGHT_REPAIR_SCHEMA)

        val output = generator.repair(GroundedProviderTestFixture.model(Provider.GEMINI), GenerationItem.HIGHLIGHTS, request)

        assertThat(output).isInstanceOf(GroundedSectionRepairOutput.Highlights::class.java)
        assertThat(fake.lastUserText).contains("t000001", GroundedProviderTestFixture.INJECTION_SENTINEL)
        assertThat(
            fake.lastResponseSchema!!
                .path("properties")
                .fieldNames()
                .asSequence()
                .toList(),
        ).containsExactly("highlights")
    }

    @Test
    fun `io and malformed output use safe errors`() {
        val sentinel = GroundedProviderTestFixture.INJECTION_SENTINEL
        val cases =
            listOf(
                IOException("I/O around $sentinel") to ErrorCode.PROVIDER_UNAVAILABLE,
                RuntimeException("503 around $sentinel") to ErrorCode.PROVIDER_UNAVAILABLE,
                RuntimeException("429 rate_limit around $sentinel") to ErrorCode.PROVIDER_RATE_LIMITED,
            )
        cases.forEach { (failure, expectedCode) ->
            val generator =
                GeminiWholeTranscriptGroundedGenerator(
                    FakeGeminiApi(throwException = failure),
                    GroundedDraftJsonCodec(),
                    compat,
                )
            assertThatThrownBy {
                generator.generate(GroundedProviderTestFixture.model(Provider.GEMINI), GroundedProviderTestFixture.request())
            }.isInstanceOfSatisfying(LlmGenerationException::class.java) {
                assertThat(it.error.code).isEqualTo(expectedCode)
                assertThat(it.message).doesNotContain(sentinel)
            }
        }

        val malformedWire =
            runCatching { StructuredOutputJson.parseObject("{", ObjectMapper()) }
                .exceptionOrNull()!!
        val malformed =
            GeminiWholeTranscriptGroundedGenerator(
                FakeGeminiApi(throwException = malformedWire),
                GroundedDraftJsonCodec(),
                compat,
            )
        assertThatThrownBy { malformed.generate(GroundedProviderTestFixture.model(Provider.GEMINI), GroundedProviderTestFixture.request()) }
            .isInstanceOfSatisfying(LlmGenerationException::class.java) {
                assertThat(it.error.code).isEqualTo(ErrorCode.SCHEMA_INVALID)
            }
    }

    @Test
    fun `typed Gemini rate limit retry hint is propagated without exposing content`() {
        val sentinel = GroundedProviderTestFixture.INJECTION_SENTINEL
        val failure =
            com.google.genai.errors.ClientException(
                429,
                "RESOURCE_EXHAUSTED",
                "Please retry in 12.5s. $sentinel",
            )
        val generator =
            GeminiWholeTranscriptGroundedGenerator(
                FakeGeminiApi(throwException = failure),
                GroundedDraftJsonCodec(),
                compat,
            )

        assertThatThrownBy {
            generator.generate(GroundedProviderTestFixture.model(Provider.GEMINI), GroundedProviderTestFixture.request())
        }.isInstanceOfSatisfying(LlmGenerationException::class.java) {
            assertThat(it.error.code).isEqualTo(ErrorCode.PROVIDER_RATE_LIMITED)
            assertThat(it.retryAfter).isEqualTo(Duration.ofMillis(12_500))
            assertThat(it.message).doesNotContain(sentinel)
        }
    }

    private fun usage() =
        TokenUsage(
            nonCachedInputTokens = 10,
            cacheWriteInputTokens = 0,
            cacheReadInputTokens = 0,
            outputTokens = 20,
        )
}
