package com.readmates.aigen.config

import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.springai.SpringAiNativeUsage
import com.readmates.aigen.adapter.out.llm.springai.SpringAiNativeUsageExtractor
import com.readmates.aigen.adapter.out.llm.springai.SpringAiProviderNativeUsageExtractor
import com.readmates.aigen.adapter.out.llm.springai.SpringAiUsageMapper
import com.readmates.aigen.application.model.ModelCapability
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.ModelCapabilityCatalog
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.ai.model.chat.client.autoconfigure.ChatClientBuilderConfigurer
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

class AiGenerationSpringAiConfigTest {
    @Test
    fun `enabled non-mock OpenAI without a key fails with an actionable content-free error`() {
        contextRunner(
            "readmates.aigen.enabled=true",
            "readmates.aigen.mock=false",
            "readmates.aigen.enabled-providers=OPENAI",
        ).run { context ->
            assertThat(context).hasFailed()
            assertThat(context.startupFailure)
                .hasMessageContaining("OpenAI API key is required when OPENAI is enabled")
                .hasMessageNotContaining("READMATES_AIGEN_OPENAI_API_KEY=")
        }
    }

    @Test
    fun `enabled non-mock Anthropic without a key fails lazily with a content-free error`() {
        contextRunner(
            "readmates.aigen.enabled=true",
            "readmates.aigen.mock=false",
            "readmates.aigen.enabled-providers=CLAUDE",
            "readmates.aigen.grounded.capabilities[claude-sonnet-4-6].context-window-tokens=1000000",
            "readmates.aigen.grounded.capabilities[claude-sonnet-4-6].max-output-tokens=128000",
            "readmates.aigen.grounded.capabilities[claude-sonnet-4-6].structured-output-supported=true",
        ).run { context ->
            assertThat(context).hasFailed()
            assertThat(context.startupFailure)
                .hasMessageContaining("Anthropic API key is required when CLAUDE is enabled")
                .hasMessageNotContaining("READMATES_AIGEN_ANTHROPIC_API_KEY=")
        }
    }

    @Test
    fun `disabled AI does not load Spring AI configuration or require provider keys`() {
        contextRunner("readmates.aigen.enabled=false").run { context ->
            assertThat(context).hasNotFailed()
            assertThat(context).doesNotHaveBean("springAiChatClientsByProvider")
            assertThat(context).doesNotHaveBean("springAiGroundedGeneratorsByProvider")
        }
    }

    @Test
    fun `mock AI does not load Spring AI configuration or require provider keys`() {
        contextRunner(
            "readmates.aigen.enabled=true",
            "readmates.aigen.mock=true",
            "readmates.aigen.enabled-providers=OPENAI",
        ).run { context ->
            assertThat(context).hasNotFailed()
            assertThat(context).doesNotHaveBean("springAiChatClientsByProvider")
            assertThat(context).doesNotHaveBean("springAiGroundedGeneratorsByProvider")
        }
    }

    @Test
    fun `configured provider models become provider-keyed clients and generators`() {
        contextRunner(
            "readmates.aigen.enabled=true",
            "readmates.aigen.mock=false",
            "readmates.aigen.enabled-providers=OPENAI",
            "READMATES_AIGEN_OPENAI_API_KEY=test-api-key",
        ).withUserConfiguration(FakeProviderNativeUsageConfiguration::class.java)
            .run { context ->
                assertThat(context).hasNotFailed()
                @Suppress("UNCHECKED_CAST")
                val clients = context.getBean("springAiChatClientsByProvider", Map::class.java) as Map<Provider, *>

                @Suppress("UNCHECKED_CAST")
                val generators =
                    context.getBean("springAiGroundedGeneratorsByProvider", Map::class.java) as Map<Provider, *>
                assertThat(clients.keys).containsExactly(Provider.OPENAI)
                assertThat(generators.keys).containsExactly(Provider.OPENAI)

                val usageMapper = context.getBean(SpringAiUsageMapper::class.java)
                val usage =
                    org.springframework.ai.chat.metadata
                        .DefaultUsage(25, 5, 30, NativeUsageMarker)
                val mapped = usageMapper.map(Provider.OPENAI, usage, cacheEnabled = true)
                assertThat(mapped.usage.nonCachedInputTokens).isEqualTo(14)
                assertThat(mapped.usage.cacheWriteInputTokens).isZero()
                assertThat(mapped.usage.cacheReadInputTokens).isEqualTo(11)
                assertThat(mapped.usageComplete).isTrue()
            }
    }

    @Test
    fun `enabled provider without one capability catalog fails closed`() {
        contextRunner(
            "readmates.aigen.enabled=true",
            "readmates.aigen.mock=false",
            "readmates.aigen.enabled-providers=OPENAI",
            "READMATES_AIGEN_OPENAI_API_KEY=test-api-key",
        ).run { context ->
            assertThat(context).hasFailed()
            assertThat(context.startupFailure)
                .hasMessageContaining("Exactly one AI model capability catalog is required")
                .hasMessageNotContaining("test-api-key")
        }
    }

    @Test
    fun `enabled provider with ambiguous capability catalogs fails closed`() {
        contextRunner(
            "readmates.aigen.enabled=true",
            "readmates.aigen.mock=false",
            "readmates.aigen.enabled-providers=OPENAI",
            "READMATES_AIGEN_OPENAI_API_KEY=test-api-key",
        ).withUserConfiguration(AmbiguousCapabilityCatalogConfiguration::class.java)
            .run { context ->
                assertThat(context).hasFailed()
                assertThat(context.startupFailure)
                    .hasMessageContaining("Exactly one AI model capability catalog is required")
                    .hasMessageNotContaining("test-api-key")
            }
    }

    private fun contextRunner(vararg properties: String) =
        ApplicationContextRunner()
            .withUserConfiguration(AiGenerationSpringAiConfig::class.java, TestInfrastructureConfiguration::class.java)
            .withPropertyValues(*properties)

    @Configuration(proxyBeanMethods = false)
    class TestInfrastructureConfiguration {
        @Bean
        fun chatClientBuilderConfigurer() = ChatClientBuilderConfigurer()

        @Bean
        fun groundedDraftJsonCodec() = GroundedDraftJsonCodec()
    }

    @Configuration(proxyBeanMethods = false)
    class FakeProviderNativeUsageConfiguration {
        @Bean
        fun modelCapabilityCatalog() =
            ModelCapabilityCatalog {
                ModelCapability(
                    contextWindowTokens = 400_000,
                    maxOutputTokens = 128_000,
                    structuredOutputSupported = true,
                )
            }

        @Bean
        fun openAiNativeUsageExtractor() =
            SpringAiProviderNativeUsageExtractor(
                Provider.OPENAI,
                SpringAiNativeUsageExtractor { native ->
                    native.takeIf { it === NativeUsageMarker }?.let {
                        SpringAiNativeUsage(10, 4, 11, 5)
                    }
                },
            )
    }

    @Configuration(proxyBeanMethods = false)
    class AmbiguousCapabilityCatalogConfiguration {
        @Bean
        fun firstCatalog() = ModelCapabilityCatalog { null }

        @Bean
        fun secondCatalog() = ModelCapabilityCatalog { null }
    }

    private data object NativeUsageMarker
}
