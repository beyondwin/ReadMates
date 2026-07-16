package com.readmates.aigen.config

import com.readmates.aigen.adapter.out.llm.common.GroundedDraftJsonCodec
import com.readmates.aigen.adapter.out.llm.springai.SpringAiNativeUsage
import com.readmates.aigen.adapter.out.llm.springai.SpringAiNativeUsageExtractor
import com.readmates.aigen.adapter.out.llm.springai.SpringAiProviderNativeUsageExtractor
import com.readmates.aigen.adapter.out.llm.springai.SpringAiUsageMapper
import com.readmates.aigen.application.model.Provider
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.ai.chat.model.ChatModel
import org.springframework.ai.model.chat.client.autoconfigure.ChatClientBuilderConfigurer
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

class AiGenerationSpringAiConfigTest {
    @Test
    fun `enabled non-mock provider without a configured model fails with an actionable content-free error`() {
        contextRunner(
            "readmates.aigen.enabled=true",
            "readmates.aigen.mock=false",
            "readmates.aigen.enabled-providers=OPENAI",
        ).run { context ->
            assertThat(context).hasFailed()
            assertThat(context.startupFailure)
                .hasMessageContaining("Spring AI chat model missing for enabled provider: OPENAI")
                .hasMessageContaining("API key and grounded structured-output capability")
                .hasMessageNotContaining("READMATES_AIGEN_OPENAI_API_KEY=")
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
        ).withUserConfiguration(FakeProviderModelConfiguration::class.java)
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
                assertThat(mapped.usage.nonCachedInputTokens).isEqualTo(10)
                assertThat(mapped.usage.cacheWriteInputTokens).isEqualTo(4)
                assertThat(mapped.usage.cacheReadInputTokens).isEqualTo(11)
                assertThat(mapped.usageComplete).isTrue()
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
    class FakeProviderModelConfiguration {
        @Bean
        fun openAiProviderChatModel(): SpringAiProviderChatModel =
            SpringAiProviderChatModel(Provider.OPENAI, ChatModel { error("not called during configuration") })

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

    private data object NativeUsageMarker
}
