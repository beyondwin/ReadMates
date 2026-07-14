package com.readmates.aigen.adapter.out.llm.claude

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
class ClaudeWholeTranscriptGroundedGenerator(
    private val api: ClaudeApiPort,
    private val codec: GroundedDraftJsonCodec,
) : WholeTranscriptGroundedGenerator {
    override val provider = Provider.CLAUDE

    override fun generate(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GroundedGenerationOutput {
        requireOwnedModel(model)
        val result = call(model, request, PRIMARY_TOOL_NAME)
        return GroundedGenerationOutput(codec.draft(result.input), result.usage)
    }

    override fun repair(
        model: ModelId,
        section: GenerationItem,
        request: RenderedGroundedRequest,
    ): GroundedSectionRepairOutput {
        requireOwnedModel(model)
        val result = call(model, request, "repair_${section.name.lowercase()}")
        return codec.repair(result.input, section, result.usage)
    }

    private fun call(
        model: ModelId,
        request: RenderedGroundedRequest,
        toolName: String,
    ): ClaudeToolResult =
        mapProviderErrors {
            api.callStructuredTool(
                request = request.forModel(model),
                toolName = toolName,
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
        const val PRIMARY_TOOL_NAME = "emit_grounded_session_generation_v2"
    }
}
