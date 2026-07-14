package com.readmates.aigen.adapter.out.llm.claude

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.common.GroundedProviderTestFixture
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
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

@Suppress("MaxLineLength")
class ClaudeWholeTranscriptGroundedGeneratorTest {
    @Test
    fun `live client marks the forced tool schema strict`() {
        val schema =
            ObjectMapper().readTree(GroundedProviderTestFixture.request().schemaJson)
                as com.fasterxml.jackson.databind.node.ObjectNode

        val tool = ClaudeApiClient().buildTool("grounded_generation", schema)

        assertThat(tool.strict()).contains(true)
    }

    @Test
    fun `rejects a model owned by another provider before API work`() {
        val fake = FakeClaudeApi(ClaudeToolResult(GroundedProviderTestFixture.draftNode(), usage()))
        val generator = ClaudeWholeTranscriptGroundedGenerator(fake, GroundedDraftJsonCodec())

        assertThatThrownBy {
            generator.generate(GroundedProviderTestFixture.model(Provider.OPENAI), GroundedProviderTestFixture.request())
        }.isInstanceOf(IllegalArgumentException::class.java)
        assertThat(fake.lastModel).isNull()
    }

    @Test
    fun `primary forwards exact rendered request with cache control and parses draft`() {
        val fake = FakeClaudeApi(ClaudeToolResult(GroundedProviderTestFixture.draftNode(), usage()))
        val generator = ClaudeWholeTranscriptGroundedGenerator(fake, GroundedDraftJsonCodec())
        val request = GroundedProviderTestFixture.request()

        val output = generator.generate(GroundedProviderTestFixture.model(Provider.CLAUDE), request)

        assertThat(output.draft.feedbackSections).hasSize(1)
        assertThat(fake.lastSystemPrompt).isEqualTo(request.systemText)
        assertThat(fake.lastUserText).isEmpty()
        assertThat(fake.lastTranscriptText).isEqualTo(request.userText)
        assertThat(fake.lastToolSchema).isEqualTo(ObjectMapper().readTree(request.schemaJson))
        assertThat(fake.lastExpectCacheControl).isTrue()
        assertThat(fake.lastMaxOutputTokens).isEqualTo(16_384)
    }

    @Test
    fun `repair can only return the requested section type and keeps whole request`() {
        val fake = FakeClaudeApi(ClaudeToolResult(GroundedProviderTestFixture.highlightRepairNode(), usage()))
        val generator = ClaudeWholeTranscriptGroundedGenerator(fake, GroundedDraftJsonCodec())
        val request = GroundedProviderTestFixture.request(GroundedProviderTestFixture.HIGHLIGHT_REPAIR_SCHEMA)

        val output = generator.repair(GroundedProviderTestFixture.model(Provider.CLAUDE), GenerationItem.HIGHLIGHTS, request)

        assertThat(output).isInstanceOf(GroundedSectionRepairOutput.Highlights::class.java)
        assertThat(fake.lastTranscriptText).contains("t000001", GroundedProviderTestFixture.INJECTION_SENTINEL)
        assertThat(
            fake.lastToolSchema!!
                .path("properties")
                .fieldNames()
                .asSequence()
                .toList(),
        ).containsExactly("highlights")
    }

    @Test
    fun `rate limit and malformed output use safe errors`() {
        val sentinel = GroundedProviderTestFixture.INJECTION_SENTINEL
        val cases =
            listOf(
                IOException("I/O around $sentinel") to ErrorCode.PROVIDER_UNAVAILABLE,
                RuntimeException("503 around $sentinel") to ErrorCode.PROVIDER_UNAVAILABLE,
                RuntimeException("429 rate_limit around $sentinel") to ErrorCode.PROVIDER_RATE_LIMITED,
            )
        cases.forEach { (failure, expectedCode) ->
            val generator =
                ClaudeWholeTranscriptGroundedGenerator(
                    FakeClaudeApi(throwException = failure),
                    GroundedDraftJsonCodec(),
                )
            assertThatThrownBy {
                generator.generate(GroundedProviderTestFixture.model(Provider.CLAUDE), GroundedProviderTestFixture.request())
            }.isInstanceOfSatisfying(LlmGenerationException::class.java) {
                assertThat(it.error.code).isEqualTo(expectedCode)
                assertThat(it.message).doesNotContain(sentinel)
            }
        }

        val malformedWire =
            runCatching { StructuredOutputJson.parseObject("{", ObjectMapper()) }
                .exceptionOrNull()!!
        val malformed =
            ClaudeWholeTranscriptGroundedGenerator(
                FakeClaudeApi(throwException = malformedWire),
                GroundedDraftJsonCodec(),
            )
        assertThatThrownBy { malformed.generate(GroundedProviderTestFixture.model(Provider.CLAUDE), GroundedProviderTestFixture.request()) }
            .isInstanceOfSatisfying(LlmGenerationException::class.java) {
                assertThat(it.error.code).isEqualTo(ErrorCode.SCHEMA_INVALID)
            }
    }

    private fun usage() = TokenUsage(10, 0, 20)
}
