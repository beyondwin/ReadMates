package com.readmates.aigen.config

import com.google.genai.Client
import com.google.genai.types.HttpOptions
import com.google.genai.types.HttpRetryOptions
import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.gemini.GeminiSchemaCompatAdapter
import com.readmates.aigen.adapter.out.llm.springai.AnthropicGroundedModelPolicy
import com.readmates.aigen.adapter.out.llm.springai.SpringAiErrorMapper
import com.readmates.aigen.adapter.out.llm.springai.SpringAiProviderNativeUsageExtractor
import com.readmates.aigen.adapter.out.llm.springai.SpringAiProviderOptionsFactory
import com.readmates.aigen.adapter.out.llm.springai.SpringAiUsageMapper
import com.readmates.aigen.adapter.out.llm.springai.SpringAiWholeTranscriptGroundedGenerator
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import io.micrometer.observation.ObservationRegistry
import org.springframework.ai.anthropic.AnthropicChatModel
import org.springframework.ai.anthropic.AnthropicChatOptions
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor
import org.springframework.ai.chat.client.advisor.observation.AdvisorObservationConvention
import org.springframework.ai.chat.client.observation.ChatClientObservationConvention
import org.springframework.ai.chat.model.ChatModel
import org.springframework.ai.google.genai.GoogleGenAiChatModel
import org.springframework.ai.google.genai.GoogleGenAiChatOptions
import org.springframework.ai.model.chat.client.autoconfigure.ChatClientBuilderConfigurer
import org.springframework.ai.openai.OpenAiChatModel
import org.springframework.ai.openai.OpenAiChatOptions
import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.env.Environment
import org.springframework.core.retry.RetryPolicy
import org.springframework.core.retry.RetryTemplate
import java.time.Duration

private typealias CapabilityCatalogs = ObjectProvider<ModelCapabilityCatalog>

data class SpringAiProviderChatModel(
    val provider: Provider,
    val chatModel: ChatModel,
)

internal object OpenAiSpringAiModelFactory {
    const val API_KEY_ENV = "READMATES_AIGEN_OPENAI_API_KEY"
    private const val DEFAULT_BASE_URL = "https://api.openai.com/v1"

    fun create(
        apiKey: String,
        baseUrl: String = DEFAULT_BASE_URL,
        timeout: Duration,
        observationRegistry: ObservationRegistry = ObservationRegistry.NOOP,
    ): OpenAiChatModel {
        require(apiKey.isNotBlank()) { "OpenAI API key must not be blank" }
        val options =
            OpenAiChatOptions
                .builder()
                .apiKey(apiKey)
                .baseUrl(baseUrl)
                .timeout(timeout)
                .maxRetries(0)
                .build()
        return OpenAiChatModel
            .builder()
            .options(options)
            .observationRegistry(observationRegistry)
            .build()
    }
}

internal object AnthropicSpringAiModelFactory {
    const val API_KEY_ENV = "READMATES_AIGEN_ANTHROPIC_API_KEY"
    private const val DEFAULT_BASE_URL = "https://api.anthropic.com"

    fun create(
        apiKey: String,
        baseUrl: String = DEFAULT_BASE_URL,
        timeout: Duration,
        observationRegistry: ObservationRegistry = ObservationRegistry.NOOP,
    ): AnthropicChatModel {
        require(apiKey.isNotBlank()) { "Anthropic API key must not be blank" }
        val options =
            AnthropicChatOptions
                .builder()
                .apiKey(apiKey)
                .baseUrl(baseUrl)
                .timeout(timeout)
                .maxRetries(0)
                .build()
        return AnthropicChatModel
            .builder()
            .options(options)
            .observationRegistry(observationRegistry)
            .build()
    }
}

internal data class GoogleGenAiSpringAiModelResources(
    val model: GoogleGenAiChatModel,
    val options: HttpOptions,
    val retryTemplate: RetryTemplate,
)

/** The Google SDK client exists only because Spring AI requires it as its transport dependency. */
internal object GoogleGenAiSpringAiModelFactory {
    const val API_KEY_ENV = "READMATES_AIGEN_GEMINI_API_KEY"
    private const val DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com"
    private const val API_VERSION = "v1beta"
    private const val NO_RETENTION_HEADER = "x-goog-data-policy"
    private const val NO_RETENTION_VALUE = "no-retention"

    fun create(
        apiKey: String,
        baseUrl: String = DEFAULT_BASE_URL,
        timeout: Duration,
        observationRegistry: ObservationRegistry = ObservationRegistry.NOOP,
    ): GoogleGenAiSpringAiModelResources {
        require(apiKey.isNotBlank()) { "Google GenAI API key must not be blank" }
        val timeoutMillis = timeout.toMillis()
        require(timeoutMillis in 1..Int.MAX_VALUE) { "Google GenAI request timeout is invalid" }
        val httpOptions =
            HttpOptions
                .builder()
                .baseUrl(baseUrl)
                .apiVersion(API_VERSION)
                .timeout(timeoutMillis.toInt())
                .headers(mapOf(NO_RETENTION_HEADER to NO_RETENTION_VALUE))
                .retryOptions(HttpRetryOptions.builder().attempts(1))
                .build()
        val client =
            Client
                .builder()
                .apiKey(apiKey)
                .httpOptions(httpOptions)
                .build()
        val retryTemplate = RetryTemplate(RetryPolicy.withMaxRetries(0))
        val defaultOptions = GoogleGenAiChatOptions.builder().includeExtendedUsageMetadata(true).build()
        val model =
            GoogleGenAiChatModel
                .builder()
                .genAiClient(client)
                .options(defaultOptions)
                .retryTemplate(retryTemplate)
                .observationRegistry(observationRegistry)
                .build()
        return GoogleGenAiSpringAiModelResources(model, httpOptions, retryTemplate)
    }
}

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AiGenerationProperties::class)
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["mock"], havingValue = "false", matchIfMissing = true)
class AiGenerationSpringAiConfig {
    @Bean
    fun googleGenAiSpringAiChatModel(
        properties: AiGenerationProperties,
        environment: Environment,
        observationRegistry: ObjectProvider<ObservationRegistry>,
    ): SpringAiProviderChatModel? {
        if (properties.enabledProviders.none { it.equals(Provider.GEMINI.name, ignoreCase = true) }) {
            return null
        }
        val configuredModels =
            properties.grounded.capabilities.keys
                .filter(com.readmates.aigen.adapter.out.llm.springai.GoogleGroundedModelPolicy::isVerified)
        require(configuredModels.isNotEmpty()) {
            "Google grounded no-thinking capability is required when GEMINI is enabled"
        }
        require(properties.providers.google.paidTierRetentionConfirmed) {
            "readmates.aigen.providers.google.paid-tier-retention-confirmed must be true when GEMINI is enabled"
        }
        val apiKey = environment.getProperty(GoogleGenAiSpringAiModelFactory.API_KEY_ENV)
        require(!apiKey.isNullOrBlank()) { "Google GenAI API key is required when GEMINI is enabled" }
        return SpringAiProviderChatModel(
            Provider.GEMINI,
            GoogleGenAiSpringAiModelFactory
                .create(
                    apiKey = apiKey,
                    timeout = properties.providerCalls.requestTimeout,
                    observationRegistry = observationRegistry.getIfUnique { ObservationRegistry.NOOP },
                ).model,
        )
    }

    @Bean
    fun anthropicSpringAiChatModel(
        properties: AiGenerationProperties,
        environment: Environment,
        observationRegistry: ObjectProvider<ObservationRegistry>,
    ): SpringAiProviderChatModel? {
        if (properties.enabledProviders.none { it.equals(Provider.CLAUDE.name, ignoreCase = true) }) {
            return null
        }
        val configuredModels =
            properties.grounded.capabilities.keys
                .filter(AnthropicGroundedModelPolicy::isVerified)
        require(configuredModels.isNotEmpty()) {
            "Anthropic grounded capability is required when CLAUDE is enabled"
        }
        val apiKey = environment.getProperty(AnthropicSpringAiModelFactory.API_KEY_ENV)
        require(!apiKey.isNullOrBlank()) { "Anthropic API key is required when CLAUDE is enabled" }
        return SpringAiProviderChatModel(
            Provider.CLAUDE,
            AnthropicSpringAiModelFactory.create(
                apiKey = apiKey,
                timeout = properties.providerCalls.requestTimeout,
                observationRegistry = observationRegistry.getIfUnique { ObservationRegistry.NOOP },
            ),
        )
    }

    @Bean
    fun openAiSpringAiChatModel(
        properties: AiGenerationProperties,
        environment: Environment,
        observationRegistry: ObjectProvider<ObservationRegistry>,
    ): SpringAiProviderChatModel? {
        if (properties.enabledProviders.none { it.equals(Provider.OPENAI.name, ignoreCase = true) }) {
            return null
        }
        val apiKey = environment.getProperty(OpenAiSpringAiModelFactory.API_KEY_ENV)
        require(!apiKey.isNullOrBlank()) { "OpenAI API key is required when OPENAI is enabled" }
        return SpringAiProviderChatModel(
            Provider.OPENAI,
            OpenAiSpringAiModelFactory.create(
                apiKey = apiKey,
                timeout = properties.providerCalls.requestTimeout,
                observationRegistry = observationRegistry.getIfUnique { ObservationRegistry.NOOP },
            ),
        )
    }

    @Bean
    fun optionsFactory(
        catalogs: CapabilityCatalogs,
        geminiSchemaCompatAdapters: ObjectProvider<GeminiSchemaCompatAdapter>,
    ): SpringAiProviderOptionsFactory {
        val catalog =
            requireNotNull(catalogs.getIfUnique()) {
                "Exactly one AI model capability catalog is required"
            }
        val geminiSchemaCompatAdapter =
            geminiSchemaCompatAdapters.getIfAvailable {
                GeminiSchemaCompatAdapter()
            }
        return SpringAiProviderOptionsFactory(catalog, geminiSchemaCompatAdapter)
    }

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
