package com.readmates.aigen.adapter.out.llm.springai

import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.common.GroundedProviderTestFixture
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.Provider
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.messages.AssistantMessage
import org.springframework.ai.chat.metadata.ChatResponseMetadata
import org.springframework.ai.chat.metadata.DefaultUsage
import org.springframework.ai.chat.model.ChatModel
import org.springframework.ai.chat.model.ChatResponse
import org.springframework.ai.chat.model.Generation
import org.springframework.ai.chat.prompt.Prompt

class SpringAiWholeTranscriptGroundedGeneratorTest {
    @Test
    fun `generate makes one non-streaming call with exact rendered text and decodes the domain draft`() {
        val request = GroundedProviderTestFixture.request(SCHEMA_REJECTING_VALID_DRAFT)
        val model = GroundedProviderTestFixture.model(Provider.OPENAI)
        val chatModel = RecordingChatModel(GroundedProviderTestFixture.draftNode().toString())
        val generator = generator(Provider.OPENAI, chatModel)

        val output = generator.generate(model, request)

        assertThat(chatModel.prompts).hasSize(1)
        val prompt = chatModel.prompts.single()
        assertThat(prompt.systemMessage.text).isEqualTo(request.systemText)
        assertThat(requireNotNull(prompt.userMessage.text).trimEnd()).isEqualTo(request.userText)
        assertThat(requireNotNull(prompt.options).model).isEqualTo(model.name)
        assertThat(output.draft.bookTitle).isEqualTo("Public Test Book")
        assertThat(output.usage.outputTokens).isEqualTo(30)
        assertThat(output.usageComplete).isTrue()
    }

    @Test
    fun `repair makes one call with the same rendered request and decodes only the requested section`() {
        val request = GroundedProviderTestFixture.request(GroundedProviderTestFixture.HIGHLIGHT_REPAIR_SCHEMA)
        val model = GroundedProviderTestFixture.model(Provider.CLAUDE)
        val chatModel = RecordingChatModel(GroundedProviderTestFixture.highlightRepairNode().toString())
        val generator = generator(Provider.CLAUDE, chatModel)

        val output = generator.repair(model, GenerationItem.HIGHLIGHTS, request)

        assertThat(chatModel.prompts).hasSize(1)
        val prompt = chatModel.prompts.single()
        assertThat(prompt.systemMessage.text).isEqualTo(request.systemText)
        assertThat(requireNotNull(prompt.userMessage.text).trimEnd()).isEqualTo(request.userText)
        assertThat(output.section).isEqualTo(GenerationItem.HIGHLIGHTS)
        assertThat(output.usageComplete).isTrue()
    }

    @Test
    fun `allowlist option failure is safe and never enters provider transport`() {
        val request = GroundedProviderTestFixture.request()
        val model = GroundedProviderTestFixture.model(Provider.OPENAI)
        val chatModel = RecordingChatModel(GroundedProviderTestFixture.draftNode().toString())
        val generator =
            generator(
                Provider.OPENAI,
                chatModel,
                SpringAiProviderOptionsFactory { null },
            )

        assertThatThrownBy { generator.generate(model, request) }
            .isInstanceOfSatisfying(LlmGenerationException::class.java) { failure ->
                assertThat(failure.error.code).isEqualTo(ErrorCode.MODEL_CAPABILITY_UNAVAILABLE)
                assertThat(failure.cause).isNull()
            }
        assertThat(chatModel.prompts).isEmpty()
    }

    private fun generator(
        provider: Provider,
        model: ChatModel,
        optionsFactory: SpringAiProviderOptionsFactory = SpringAiProviderOptionsFactory(),
    ) = SpringAiWholeTranscriptGroundedGenerator(
        provider = provider,
        chatClient = ChatClient.create(model),
        codec = GroundedDraftJsonCodec(),
        optionsFactory = optionsFactory,
        usageMapper = SpringAiUsageMapper(),
        errorMapper = SpringAiErrorMapper(),
    )

    private class RecordingChatModel(
        private val responseJson: String,
    ) : ChatModel {
        val prompts = mutableListOf<Prompt>()

        override fun call(prompt: Prompt): ChatResponse {
            prompts += prompt
            val usage = DefaultUsage(120, 30, 150, null, 20, 10)
            return ChatResponse(
                listOf(Generation(AssistantMessage(responseJson))),
                ChatResponseMetadata.builder().usage(usage).build(),
            )
        }
    }

    private companion object {
        /** The response is codec-valid but violates this schema, proving validateSchema() is never enabled. */
        const val SCHEMA_REJECTING_VALID_DRAFT =
            """{"type":"object","required":["property-that-must-never-exist"]}"""
    }
}
