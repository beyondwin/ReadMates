package com.readmates.aigen.adapter.out.llm.openai

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
class OpenAiWholeTranscriptGroundedGeneratorTest {
    @Test
    fun `rejects a model owned by another provider before API work`() {
        val fake = FakeOpenAiApi(OpenAiToolResult(GroundedProviderTestFixture.draftNode(), usage()))
        val generator = OpenAiWholeTranscriptGroundedGenerator(fake, GroundedDraftJsonCodec())

        assertThatThrownBy {
            generator.generate(GroundedProviderTestFixture.model(Provider.CLAUDE), GroundedProviderTestFixture.request())
        }.isInstanceOf(IllegalArgumentException::class.java)
        assertThat(fake.lastModel).isNull()
    }

    @Test
    fun `primary forwards exact rendered request and parses all four sections`() {
        val fake = FakeOpenAiApi(OpenAiToolResult(GroundedProviderTestFixture.draftNode(), usage()))
        val generator = OpenAiWholeTranscriptGroundedGenerator(fake, GroundedDraftJsonCodec())
        val request = GroundedProviderTestFixture.request()

        val output = generator.generate(GroundedProviderTestFixture.model(Provider.OPENAI), request)

        assertThat(generator.provider).isEqualTo(Provider.OPENAI)
        assertThat(output.draft.summaryBlocks).hasSize(1)
        assertThat(output.draft.highlights).hasSize(1)
        assertThat(output.draft.oneLineReviews).hasSize(1)
        assertThat(output.draft.feedbackSections).hasSize(1)
        assertThat(fake.lastSystemPrompt).isEqualTo(request.systemText)
        assertThat(fake.lastUserText).isEqualTo(request.userText)
        assertThat(fake.lastTranscriptText).isEmpty()
        assertThat(fake.lastSchema).isEqualTo(ObjectMapper().readTree(request.schemaJson))
        assertThat(fake.lastMaxOutputTokens).isEqualTo(16_384)
        assertThat(fake.lastSystemPrompt).doesNotContain(GroundedProviderTestFixture.INJECTION_SENTINEL)
    }

    @Test
    fun `repair is section typed and retains full context`() {
        val fake = FakeOpenAiApi(OpenAiToolResult(GroundedProviderTestFixture.highlightRepairNode(), usage()))
        val generator = OpenAiWholeTranscriptGroundedGenerator(fake, GroundedDraftJsonCodec())
        val request = GroundedProviderTestFixture.request(GroundedProviderTestFixture.HIGHLIGHT_REPAIR_SCHEMA)

        val output = generator.repair(GroundedProviderTestFixture.model(Provider.OPENAI), GenerationItem.HIGHLIGHTS, request)

        assertThat(output).isInstanceOf(GroundedSectionRepairOutput.Highlights::class.java)
        assertThat((output as GroundedSectionRepairOutput.Highlights).items.single().text).isEqualTo("Repaired")
        assertThat(fake.lastUserText).contains("t000001", GroundedProviderTestFixture.INJECTION_SENTINEL)
        assertThat(
            fake.lastSchema!!
                .path("properties")
                .fieldNames()
                .asSequence()
                .toList(),
        ).containsExactly("highlights")
    }

    @Test
    fun `provider failures are safe and classified`() {
        val sentinel = GroundedProviderTestFixture.INJECTION_SENTINEL
        val cases =
            listOf(
                IOException("I/O near $sentinel") to ErrorCode.PROVIDER_UNAVAILABLE,
                RuntimeException("503 near $sentinel") to ErrorCode.PROVIDER_UNAVAILABLE,
                RuntimeException("429 rate_limit near $sentinel") to ErrorCode.PROVIDER_RATE_LIMITED,
            )
        cases.forEach { (failure, expectedCode) ->
            val generator =
                OpenAiWholeTranscriptGroundedGenerator(
                    FakeOpenAiApi(throwException = failure),
                    GroundedDraftJsonCodec(),
                )
            assertThatThrownBy {
                generator.generate(GroundedProviderTestFixture.model(Provider.OPENAI), GroundedProviderTestFixture.request())
            }.isInstanceOfSatisfying(LlmGenerationException::class.java) {
                assertThat(it.error.code).isEqualTo(expectedCode)
                assertThat(it.message).doesNotContain(sentinel)
            }
        }
    }

    @Test
    fun `malformed provider object maps to schema invalid without content`() {
        val malformedWire =
            runCatching { StructuredOutputJson.parseObject("{", ObjectMapper()) }
                .exceptionOrNull()!!
        val generator =
            OpenAiWholeTranscriptGroundedGenerator(
                FakeOpenAiApi(throwException = malformedWire),
                GroundedDraftJsonCodec(),
            )

        assertThatThrownBy { generator.generate(GroundedProviderTestFixture.model(Provider.OPENAI), GroundedProviderTestFixture.request()) }
            .isInstanceOfSatisfying(LlmGenerationException::class.java) {
                assertThat(it.error.code).isEqualTo(ErrorCode.SCHEMA_INVALID)
                assertThat(it.message).doesNotContain(GroundedProviderTestFixture.INJECTION_SENTINEL)
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
