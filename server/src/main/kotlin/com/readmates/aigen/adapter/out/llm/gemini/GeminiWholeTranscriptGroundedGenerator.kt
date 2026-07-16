package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.common.LlmErrorMapper
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.llm.common.ProviderRetryAfterExtractor
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.GroundedGenerationOutput
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import com.readmates.aigen.application.port.out.forModel
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["mock"], havingValue = "false", matchIfMissing = true)
class GeminiWholeTranscriptGroundedGenerator(
    private val api: GeminiApiPort,
    private val codec: GroundedDraftJsonCodec,
    private val schemaCompatAdapter: GeminiSchemaCompatAdapter,
) : WholeTranscriptGroundedGenerator {
    override val provider = Provider.GEMINI
    private val objectMapper = ObjectMapper()

    override fun generate(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GroundedGenerationOutput {
        requireOwnedModel(model)
        val result = call(model, request)
        return GroundedGenerationOutput(codec.draft(result.parsed), result.usage)
    }

    override fun repair(
        model: ModelId,
        section: GenerationItem,
        request: RenderedGroundedRequest,
    ): GroundedSectionRepairOutput {
        requireOwnedModel(model)
        val result = call(model, request)
        return codec.repair(result.parsed, section, result.usage)
    }

    private fun call(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GeminiToolResult =
        mapProviderErrors {
            val schema = objectMapper.readTree(request.schemaJson) as ObjectNode
            api.callStructuredResponseSchema(
                request =
                    request
                        .copy(schemaJson = schemaCompatAdapter.convert(schema).toString())
                        .forModel(model),
            )
        }

    private fun <T> mapProviderErrors(call: () -> T): T =
        try {
            call()
        } catch (
            @Suppress("TooGenericExceptionCaught") error: Throwable,
        ) {
            throw LlmGenerationException(
                LlmErrorMapper.mapException(error, provider),
                error,
                ProviderRetryAfterExtractor.extract(error),
            )
        }

    private fun requireOwnedModel(model: ModelId) {
        require(model.provider == provider) { "Model provider does not match grounded adapter" }
    }
}
