package com.readmates.aigen.application.service

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.port.out.GroundedRenderRequest
import com.readmates.aigen.application.port.out.GroundedRequestRenderer
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service

data class GroundedBudgetDecision(
    val selectedModel: ModelId,
    val eligibleFallbackModels: List<ModelId>,
    val renderedRequest: RenderedGroundedRequest,
    val estimatedInputTokens: Long,
)

/** Makes no network calls and budgets each UTF-8 byte as at most one input token. */
@Service
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class GroundedInputBudgetGuard(
    private val renderer: GroundedRequestRenderer,
    private val capabilityCatalog: ModelCapabilityCatalog,
    properties: AiGenerationProperties,
) {
    private val groundedProperties = properties.grounded

    fun evaluate(
        request: GroundedRenderRequest,
        selectedModel: ModelId,
        fallbackModels: List<ModelId>,
    ): GroundedBudgetDecision {
        val rendered = renderer.render(request.copy(provider = selectedModel.provider))
        val estimatedInputTokens = rendered.estimatedInputTokens()
        val selectedCapability = requireSupportedCapability(selectedModel)
        if (!fits(selectedCapability, estimatedInputTokens)) {
            throw AiGenerationException.Coded(ErrorCode.TRANSCRIPT_TOO_LONG_FOR_MODEL)
        }
        val eligibleFallbacks =
            fallbackModels
                .asSequence()
                .filter { it != selectedModel }
                .distinct()
                .filter { candidate ->
                    capabilityCatalog.find(candidate)?.let { capability ->
                        val fallbackInputTokens =
                            renderer
                                .render(request.copy(provider = candidate.provider))
                                .estimatedInputTokens()
                        supportsGroundedRequest(capability) && fits(capability, fallbackInputTokens)
                    } ?: false
                }.take(MAX_FALLBACK_DEPTH)
                .toList()
        return GroundedBudgetDecision(selectedModel, eligibleFallbacks, rendered, estimatedInputTokens)
    }

    private fun requireSupportedCapability(model: ModelId): ModelCapability {
        val capability = capabilityCatalog.find(model)
        if (capability == null || !supportsGroundedRequest(capability)) {
            throw AiGenerationException.Coded(ErrorCode.MODEL_CAPABILITY_UNAVAILABLE)
        }
        return capability
    }

    private fun supportsGroundedRequest(capability: ModelCapability): Boolean =
        capability.structuredOutputSupported &&
            groundedProperties.reservedOutputTokens <= capability.maxOutputTokens

    private fun fits(
        capability: ModelCapability,
        estimatedInputTokens: Long,
    ): Boolean =
        estimatedInputTokens <=
            capability.contextWindowTokens -
            groundedProperties.reservedOutputTokens -
            groundedProperties.safetyMarginTokens

    private companion object {
        const val MAX_FALLBACK_DEPTH = 1
    }
}
