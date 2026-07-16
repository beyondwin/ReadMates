package com.readmates.aigen.adapter.out.llm.springai

import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import org.springframework.ai.chat.prompt.ChatOptions

enum class SpringAiGenerationMode { GENERATE, REPAIR }

/**
 * Builds only request-scoped, allowlisted options. Provider-specific strict
 * structured-output settings are added by the provider contract tasks.
 */
class SpringAiProviderOptionsFactory(
    private val modelCapabilityCatalog: ModelCapabilityCatalog? = null,
) {
    fun options(
        provider: Provider,
        model: ModelId,
        request: RenderedGroundedRequest,
        @Suppress("UNUSED_PARAMETER") mode: SpringAiGenerationMode,
    ): ChatOptions.Builder<*> {
        require(model.provider == provider) { "Model provider does not match Spring AI grounded adapter" }
        require(model.name.isNotBlank()) { "Grounded model must be allowlisted" }
        require(request.maxOutputTokens > 0) { "Grounded maximum output tokens must be positive" }
        modelCapabilityCatalog?.let { catalog ->
            val capability = catalog.find(model)
            require(capability?.structuredOutputSupported == true) {
                "Grounded model is not allowlisted for structured output"
            }
            require(request.maxOutputTokens.toLong() <= capability.maxOutputTokens) {
                "Grounded maximum output tokens exceed the allowlisted capability"
            }
        }
        return ChatOptions
            .builder()
            .model(model.name)
            .maxTokens(request.maxOutputTokens)
    }
}
