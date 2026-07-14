package com.readmates.aigen.adapter.out.llm.common

import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.config.AiGenerationProperties
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
class YamlModelCapabilityCatalog(
    properties: AiGenerationProperties,
) : ModelCapabilityCatalog {
    private val capabilities: Map<ModelId, ModelCapability> =
        properties.grounded.capabilities
            .mapNotNull { (name, capability) ->
                providerFromName(name)?.let { provider ->
                    ModelId(provider, name) to
                        ModelCapability(
                            contextWindowTokens = capability.contextWindowTokens,
                            maxOutputTokens = capability.maxOutputTokens,
                            structuredOutputSupported = capability.structuredOutputSupported,
                        )
                }
            }.toMap()

    override fun find(model: ModelId): ModelCapability? = capabilities[model]

    private fun providerFromName(name: String): Provider? =
        when {
            name.startsWith("claude-") -> Provider.CLAUDE
            name.startsWith("gemini-") -> Provider.GEMINI
            name.startsWith("gpt-") || OPENAI_O_SERIES_REGEX.matches(name) -> Provider.OPENAI
            else -> null
        }

    private companion object {
        private val OPENAI_O_SERIES_REGEX = Regex("^o\\d.*")
    }
}
