package com.readmates.aigen.adapter.out.llm.springai

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.llm.common.LlmStructuredOutputException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.GroundedGenerationOutput
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.prompt.ChatOptions

class SpringAiWholeTranscriptGroundedGenerator(
    override val provider: Provider,
    private val chatClient: ChatClient,
    private val codec: GroundedDraftJsonCodec,
    private val optionsFactory: SpringAiProviderOptionsFactory,
    private val usageMapper: SpringAiUsageMapper,
    private val errorMapper: SpringAiErrorMapper,
    private val objectMapper: ObjectMapper = ObjectMapper(),
) : WholeTranscriptGroundedGenerator {
    override fun generate(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GroundedGenerationOutput =
        execute(model, request, SpringAiGenerationMode.GENERATE) { node, usage ->
            GroundedGenerationOutput(codec.draft(node), usage.usage, usage.usageComplete)
        }

    override fun repair(
        model: ModelId,
        section: GenerationItem,
        request: RenderedGroundedRequest,
    ): GroundedSectionRepairOutput =
        execute(model, request, SpringAiGenerationMode.REPAIR) { node, usage ->
            when (val repaired = codec.repair(node, section, usage.usage)) {
                is GroundedSectionRepairOutput.Summary -> repaired.copy(usageComplete = usage.usageComplete)
                is GroundedSectionRepairOutput.Highlights -> repaired.copy(usageComplete = usage.usageComplete)
                is GroundedSectionRepairOutput.OneLineReviews -> repaired.copy(usageComplete = usage.usageComplete)
                is GroundedSectionRepairOutput.FeedbackDocument -> repaired.copy(usageComplete = usage.usageComplete)
            }
        }

    private fun <T> execute(
        model: ModelId,
        request: RenderedGroundedRequest,
        mode: SpringAiGenerationMode,
        decode: (ObjectNode, SpringAiUsageMapping) -> T,
    ): T {
        require(model.provider == provider) { "Model provider does not match Spring AI grounded adapter" }
        val options = safeOptions(model, request, mode)
        return call(request, options, decode)
    }

    @Suppress("SwallowedException", "TooGenericExceptionCaught")
    private fun safeOptions(
        model: ModelId,
        request: RenderedGroundedRequest,
        mode: SpringAiGenerationMode,
    ) = try {
        optionsFactory.options(provider, model, request, mode)
    } catch (failure: RuntimeException) {
        throw LlmGenerationException(
            GenerationError(ErrorCode.MODEL_CAPABILITY_UNAVAILABLE, "Grounded model capability unavailable"),
        )
    }

    @Suppress("TooGenericExceptionCaught")
    private fun <T> call(
        request: RenderedGroundedRequest,
        options: ChatOptions.Builder<*>,
        decode: (ObjectNode, SpringAiUsageMapping) -> T,
    ): T =
        try {
            val converter = GroundedStructuredOutputConverter(request.schemaJson, objectMapper)
            val entity =
                chatClient
                    .prompt()
                    .system(request.systemText)
                    .user(request.userText)
                    .options(options)
                    .call()
                    .responseEntity(converter) { it.useProviderStructuredOutput() }
            val response = requireNotNull(entity.response()) { "Spring AI response metadata unavailable" }
            val springUsage = response.metadata.usage
            val cacheEnabled =
                provider == Provider.CLAUDE ||
                    springUsage.cacheReadInputTokens != null ||
                    springUsage.cacheWriteInputTokens != null
            decode(
                entity.entity() ?: throw LlmStructuredOutputException(),
                usageMapper.map(provider, springUsage, cacheEnabled = cacheEnabled),
            )
        } catch (failure: RuntimeException) {
            throw errorMapper.map(failure, provider).toException()
        }
}
