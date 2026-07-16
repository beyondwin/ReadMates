package com.readmates.aigen.config

import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.springai.SpringAiErrorMapper
import com.readmates.aigen.adapter.out.llm.springai.SpringAiProviderNativeUsageExtractor
import com.readmates.aigen.adapter.out.llm.springai.SpringAiProviderOptionsFactory
import com.readmates.aigen.adapter.out.llm.springai.SpringAiUsageMapper
import com.readmates.aigen.adapter.out.llm.springai.SpringAiWholeTranscriptGroundedGenerator
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import io.micrometer.observation.ObservationRegistry
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor
import org.springframework.ai.chat.client.advisor.observation.AdvisorObservationConvention
import org.springframework.ai.chat.client.observation.ChatClientObservationConvention
import org.springframework.ai.chat.model.ChatModel
import org.springframework.ai.model.chat.client.autoconfigure.ChatClientBuilderConfigurer
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

private typealias CapabilityCatalogs = ObjectProvider<ModelCapabilityCatalog>

data class SpringAiProviderChatModel(
    val provider: Provider,
    val chatModel: ChatModel,
)

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AiGenerationProperties::class)
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["mock"], havingValue = "false", matchIfMissing = true)
class AiGenerationSpringAiConfig {
    @Bean
    fun optionsFactory(catalogs: CapabilityCatalogs) = SpringAiProviderOptionsFactory(catalogs.getIfUnique())

    @Bean
    fun springAiUsageMapper(extractors: List<SpringAiProviderNativeUsageExtractor>): SpringAiUsageMapper {
        val duplicateProviders = extractors.groupBy { it.provider }.filterValues { it.size > 1 }.keys
        require(duplicateProviders.isEmpty()) { "Duplicate Spring AI native usage extractor for provider" }
        return SpringAiUsageMapper(extractors.associate { it.provider to it.extractor })
    }

    @Bean
    fun springAiErrorMapper() = SpringAiErrorMapper()

    @Bean("springAiChatClientsByProvider")
    fun springAiChatClientsByProvider(
        providerModels: List<SpringAiProviderChatModel>,
        properties: AiGenerationProperties,
        configurer: ChatClientBuilderConfigurer,
        observationRegistry: ObjectProvider<ObservationRegistry>,
        chatClientObservationConvention: ObjectProvider<ChatClientObservationConvention>,
        advisorObservationConvention: ObjectProvider<AdvisorObservationConvention>,
        toolCallingAdvisorBuilder: ObjectProvider<ToolCallingAdvisor.Builder<*>>,
    ): Map<Provider, ChatClient> {
        val enabled = properties.enabledProviders.map(::provider).toSet()
        val duplicate = providerModels.groupBy { it.provider }.filterValues { it.size > 1 }.keys
        require(duplicate.isEmpty()) { "Duplicate Spring AI chat model for enabled provider" }
        val modelsByProvider = providerModels.associateBy { it.provider }
        val missing = enabled - modelsByProvider.keys
        require(missing.isEmpty()) {
            val providers = missing.joinToString(",")
            "Spring AI chat model missing for enabled provider: $providers. " +
                "Verify its API key and grounded structured-output capability."
        }
        return enabled.associateWith { provider ->
            val chatModel = requireNotNull(modelsByProvider[provider]).chatModel
            val builder =
                ChatClient.builder(
                    chatModel,
                    observationRegistry.getIfUnique { ObservationRegistry.NOOP },
                    chatClientObservationConvention.getIfUnique(),
                    advisorObservationConvention.getIfUnique(),
                    toolCallingAdvisorBuilder.getIfAvailable(),
                )
            configurer.configure(builder).build()
        }
    }

    @Bean("springAiGroundedGeneratorsByProvider")
    fun springAiGroundedGeneratorsByProvider(
        @Qualifier("springAiChatClientsByProvider") chatClients: Map<Provider, ChatClient>,
        codec: GroundedDraftJsonCodec,
        optionsFactory: SpringAiProviderOptionsFactory,
        usageMapper: SpringAiUsageMapper,
        errorMapper: SpringAiErrorMapper,
    ): Map<Provider, WholeTranscriptGroundedGenerator> =
        chatClients.mapValues { (provider, client) ->
            SpringAiWholeTranscriptGroundedGenerator(
                provider = provider,
                chatClient = client,
                codec = codec,
                optionsFactory = optionsFactory,
                usageMapper = usageMapper,
                errorMapper = errorMapper,
            )
        }

    private fun provider(raw: String): Provider =
        runCatching { Provider.valueOf(raw.uppercase()) }
            .getOrElse { throw IllegalArgumentException("Unsupported enabled AI provider") }
}
