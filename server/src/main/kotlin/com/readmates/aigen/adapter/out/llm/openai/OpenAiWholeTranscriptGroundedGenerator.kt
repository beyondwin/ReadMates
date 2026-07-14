package com.readmates.aigen.adapter.out.llm.openai

import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.common.LlmErrorMapper
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
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
class OpenAiWholeTranscriptGroundedGenerator(
    private val api: OpenAiApiPort,
    private val codec: GroundedDraftJsonCodec,
) : WholeTranscriptGroundedGenerator {
    override val provider = Provider.OPENAI

    override fun generate(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GroundedGenerationOutput {
        requireOwnedModel(model)
        val result = call(model, request, PRIMARY_SCHEMA_NAME)
        return GroundedGenerationOutput(codec.draft(result.parsed), result.usage)
    }

    override fun repair(
        model: ModelId,
        section: GenerationItem,
        request: RenderedGroundedRequest,
    ): GroundedSectionRepairOutput {
        requireOwnedModel(model)
        val result = call(model, request, "grounded_${section.name.lowercase()}_repair")
        return codec.repair(result.parsed, section, result.usage)
    }

    private fun call(
        model: ModelId,
        request: RenderedGroundedRequest,
        schemaName: String,
    ): OpenAiToolResult =
        mapProviderErrors {
            api.callStructuredJsonSchema(
                request = request.forModel(model),
                schemaName = schemaName,
            )
        }

    private fun <T> mapProviderErrors(call: () -> T): T =
        try {
            call()
        } catch (
            @Suppress("TooGenericExceptionCaught") error: Throwable,
        ) {
            throw LlmGenerationException(LlmErrorMapper.mapException(error, provider), error)
        }

    private fun requireOwnedModel(model: ModelId) {
        require(model.provider == provider) { "Model provider does not match grounded adapter" }
    }

    private companion object {
        const val PRIMARY_SCHEMA_NAME = "grounded_session_generation_v2"
    }
}
