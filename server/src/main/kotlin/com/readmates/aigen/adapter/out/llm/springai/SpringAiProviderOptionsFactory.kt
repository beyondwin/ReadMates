package com.readmates.aigen.adapter.out.llm.springai

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.RenderedGroundedRequest
import org.springframework.ai.anthropic.AnthropicCacheOptions
import org.springframework.ai.anthropic.AnthropicCacheStrategy
import org.springframework.ai.anthropic.AnthropicChatOptions
import org.springframework.ai.chat.prompt.ChatOptions
import org.springframework.ai.openai.OpenAiChatOptions
import java.time.LocalDate

enum class SpringAiGenerationMode { GENERATE, REPAIR }

internal object AnthropicGroundedModelPolicy {
    val verifiedModels: Map<String, LocalDate> =
        mapOf("claude-sonnet-4-6" to LocalDate.parse("2026-07-16"))

    fun isVerified(model: String): Boolean = verifiedModels.containsKey(model)
}

/**
 * Spring AI 2.0 removes `$defs` before sending Anthropic's native output
 * schema. Inline local definitions first so the provider never receives
 * dangling references or a weaker schema.
 */
internal object AnthropicNativeSchema {
    private val mapper = ObjectMapper()

    fun forProvider(schemaJson: String): String {
        val root =
            mapper.readTree(schemaJson) as? ObjectNode
                ?: throw IllegalArgumentException("Grounded output schema must be an object")
        val definitions = root.path("\$defs")
        val resolved = resolve(root, definitions, emptySet()) as ObjectNode
        resolved.remove("\$schema")
        resolved.remove("\$defs")
        return mapper.writeValueAsString(resolved)
    }

    private fun resolve(
        node: JsonNode,
        definitions: JsonNode,
        resolvingDefinitions: Set<String>,
    ): JsonNode =
        when {
            node.isObject -> {
                val objectNode = node.deepCopy<ObjectNode>()
                val reference = objectNode.path("\$ref").takeIf(JsonNode::isTextual)?.asText()
                if (reference != null) {
                    val definitionName = reference.removePrefix(LOCAL_DEFINITION_PREFIX)
                    require(reference.startsWith(LOCAL_DEFINITION_PREFIX) && definitionName.isNotBlank()) {
                        "Grounded Anthropic schema contains an unsupported reference"
                    }
                    require(definitionName !in resolvingDefinitions) {
                        "Grounded Anthropic schema contains a recursive reference"
                    }
                    val definition = definitions.path(definitionName)
                    require(!definition.isMissingNode) { "Grounded Anthropic schema reference is unresolved" }
                    resolve(definition, definitions, resolvingDefinitions + definitionName)
                } else {
                    objectNode.fieldNames().asSequence().toList().forEach { name ->
                        objectNode.set<JsonNode>(name, resolve(objectNode.get(name), definitions, resolvingDefinitions))
                    }
                    objectNode
                }
            }
            node.isArray -> {
                val array = mapper.createArrayNode()
                (node as ArrayNode).forEach { array.add(resolve(it, definitions, resolvingDefinitions)) }
                array
            }
            else -> node.deepCopy<JsonNode>()
        }

    private const val LOCAL_DEFINITION_PREFIX = "#/\$defs/"
}

/**
 * Builds only request-scoped, allowlisted options. Provider-specific strict
 * structured-output settings are added by the provider contract tasks.
 */
class SpringAiProviderOptionsFactory(
    private val modelCapabilityCatalog: ModelCapabilityCatalog,
) {
    fun outputSchema(
        provider: Provider,
        schemaJson: String,
    ): String = if (provider == Provider.CLAUDE) AnthropicNativeSchema.forProvider(schemaJson) else schemaJson

    fun options(
        provider: Provider,
        model: ModelId,
        request: RenderedGroundedRequest,
        @Suppress("UNUSED_PARAMETER") mode: SpringAiGenerationMode,
    ): ChatOptions.Builder<*> {
        require(model.provider == provider) { "Model provider does not match Spring AI grounded adapter" }
        require(model.name.isNotBlank()) { "Grounded model must be allowlisted" }
        require(request.maxOutputTokens > 0) { "Grounded maximum output tokens must be positive" }
        if (provider == Provider.CLAUDE) {
            require(AnthropicGroundedModelPolicy.isVerified(model.name)) {
                "Grounded Anthropic model is not verified for native structured output"
            }
        }
        val capability = modelCapabilityCatalog.find(model)
        require(capability?.structuredOutputSupported == true) {
            "Grounded model is not allowlisted for structured output"
        }
        require(request.maxOutputTokens.toLong() <= capability.maxOutputTokens) {
            "Grounded maximum output tokens exceed the allowlisted capability"
        }
        return when (provider) {
            Provider.OPENAI ->
                OpenAiChatOptions
                    .builder()
                    .model(model.name)
                    .maxCompletionTokens(request.maxOutputTokens)
                    .store(false)
                    .outputSchema(request.schemaJson)
            Provider.CLAUDE -> {
                AnthropicChatOptions
                    .builder()
                    .model(model.name)
                    .maxTokens(request.maxOutputTokens)
                    .outputSchema(outputSchema(provider, request.schemaJson))
                    .cacheOptions(
                        AnthropicCacheOptions
                            .builder()
                            .strategy(AnthropicCacheStrategy.SYSTEM_ONLY)
                            .build(),
                    )
            }
            else ->
                ChatOptions
                    .builder()
                    .model(model.name)
                    .maxTokens(request.maxOutputTokens)
        }
    }
}
