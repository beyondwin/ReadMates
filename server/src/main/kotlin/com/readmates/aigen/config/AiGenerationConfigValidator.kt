package com.readmates.aigen.config

import com.readmates.aigen.adapter.out.llm.springai.AnthropicGroundedModelPolicy
import com.readmates.aigen.application.model.AiGenerationPipelineMode
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import jakarta.annotation.PostConstruct
import org.springframework.beans.factory.ListableBeanFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component

/**
 * Guards against the AIGEN_ENABLED=true + KAFKA_ENABLED=false combination that
 * crashed the v1.10.1 boot with an opaque "No qualifying bean of type
 * 'AiGenerationJobQueue'" message. The only production queue implementation
 * (KafkaAiGenerationJobProducer) is @ConditionalOnProperty on
 * readmates.aigen.kafka.enabled, so disabling Kafka while the orchestrator is
 * still wired in produces a startup failure with no actionable hint.
 *
 * We check for an actual AiGenerationJobQueue bean — not just the kafka
 * property flag — so that narrow integration tests which enable AIGEN and
 * supply their own queue (e.g. via @MockitoBean) still boot cleanly.
 */
@Component
class AiGenerationConfigValidator(
    @param:Value("\${readmates.aigen.enabled:false}") private val aigenEnabled: Boolean,
    private val beanFactory: ListableBeanFactory,
    private val properties: AiGenerationProperties = AiGenerationProperties(),
) {
    @PostConstruct
    fun validate() {
        if (!aigenEnabled) return
        val queueBeans = beanFactory.getBeanNamesForType(AiGenerationJobQueue::class.java)
        check(queueBeans.isNotEmpty()) {
            "readmates.aigen.enabled=true but no AiGenerationJobQueue bean is wired. " +
                "The default implementation (KafkaAiGenerationJobProducer) is conditional on " +
                "readmates.aigen.kafka.enabled, so enabling AIGEN without it produces a " +
                "missing-bean error at boot. " +
                "Set READMATES_AIGEN_KAFKA_ENABLED=true (with READMATES_AIGEN_KAFKA_BOOTSTRAP_SERVERS) " +
                "or set READMATES_AIGEN_ENABLED=false."
        }
        validateGroundedConfiguration()
    }

    private fun validateGroundedConfiguration() {
        val grounded = properties.grounded
        check(grounded.reservedOutputTokens in 1..MAX_RESERVED_OUTPUT_TOKENS) {
            "readmates.aigen.grounded.reserved-output-tokens must be between 1 and $MAX_RESERVED_OUTPUT_TOKENS"
        }
        check(grounded.safetyMarginTokens > 0) {
            "readmates.aigen.grounded.safety-margin-tokens must be positive"
        }
        grounded.capabilities.forEach { (model, capability) ->
            check(capability.contextWindowTokens > 0 && capability.maxOutputTokens > 0) {
                "grounded capability limits must be positive for model $model"
            }
            check(grounded.reservedOutputTokens <= capability.maxOutputTokens) {
                "reserved-output-tokens exceeds max-output-tokens for model $model"
            }
            check(properties.pricing.containsKey(model)) {
                "grounded capability for model $model requires a separate pricing entry"
            }
        }
        if (properties.pipelineMode != AiGenerationPipelineMode.GROUNDED_WHOLE_TRANSCRIPT) return

        check(grounded.capabilities.containsKey(properties.fallbackDefaultModel)) {
            "grounded fallback-default-model requires a verified capability entry"
        }
        properties.enabledProviders.mapNotNull(::providerOrNull).forEach { provider ->
            check(grounded.capabilities.keys.any { model -> providerForModel(model) == provider }) {
                "grounded enabled provider $provider has no verified capability entry"
            }
        }
        validateAnthropicGroundedModels()
    }

    private fun validateAnthropicGroundedModels() {
        if (properties.enabledProviders.none { it.equals(Provider.CLAUDE.name, ignoreCase = true) }) return
        val anthropicCapabilities =
            properties.grounded.capabilities.filterKeys { it.startsWith("claude-") }
        val valid =
            anthropicCapabilities.isNotEmpty() &&
                anthropicCapabilities.all { (model, capability) ->
                    capability.structuredOutputSupported &&
                        AnthropicGroundedModelPolicy.isVerified(model) &&
                        properties.pricing[model]?.let { pricing ->
                            pricing.inputPerMTokenUsd.signum() > 0 &&
                                pricing.cacheWriteInputPerMTokenUsd?.signum() == 1 &&
                                pricing.cachedInputPerMTokenUsd.signum() >= 0 &&
                                pricing.outputPerMTokenUsd.signum() > 0
                        } == true
                }
        check(valid) {
            "Enabled Anthropic grounded model lacks verified native structured output or pricing"
        }
    }

    private fun providerOrNull(raw: String): Provider? = runCatching { Provider.valueOf(raw.uppercase()) }.getOrNull()

    private fun providerForModel(model: String): Provider? =
        when {
            model.startsWith("claude-") -> Provider.CLAUDE
            model.startsWith("gemini-") -> Provider.GEMINI
            model.startsWith("gpt-") || OPENAI_O_SERIES_REGEX.matches(model) -> Provider.OPENAI
            else -> null
        }

    private companion object {
        const val MAX_RESERVED_OUTPUT_TOKENS = 16_384L
        val OPENAI_O_SERIES_REGEX = Regex("^o\\d.*")
    }
}
