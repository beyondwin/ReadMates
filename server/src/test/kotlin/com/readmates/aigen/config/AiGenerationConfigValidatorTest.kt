package com.readmates.aigen.config

import com.readmates.aigen.application.port.out.AiGenerationJobPublishCommand
import com.readmates.aigen.application.port.out.AiGenerationJobQueue
import org.assertj.core.api.Assertions.assertThatCode
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.support.DefaultListableBeanFactory
import org.springframework.beans.factory.support.RootBeanDefinition
import java.math.BigDecimal

class AiGenerationConfigValidatorTest {
    @Test
    fun `passes when aigen is disabled regardless of queue beans`() {
        assertThatCode {
            AiGenerationConfigValidator(
                aigenEnabled = false,
                beanFactory = emptyBeanFactory(),
            ).validate()
        }.doesNotThrowAnyException()
    }

    @Test
    fun `passes when aigen is enabled and a queue bean is wired`() {
        val factory = DefaultListableBeanFactory()
        factory.registerBeanDefinition(
            "noopQueue",
            RootBeanDefinition(NoopQueue::class.java),
        )
        assertThatCode {
            AiGenerationConfigValidator(
                aigenEnabled = true,
                beanFactory = factory,
                properties = validProperties(),
            ).validate()
        }.doesNotThrowAnyException()
    }

    @Test
    fun `fails fast with an actionable message when aigen is enabled but no queue bean is wired`() {
        assertThatThrownBy {
            AiGenerationConfigValidator(
                aigenEnabled = true,
                beanFactory = emptyBeanFactory(),
            ).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("readmates.aigen.enabled=true")
            .hasMessageContaining("AiGenerationJobQueue")
            .hasMessageContaining("READMATES_AIGEN_KAFKA_ENABLED")
    }

    @Test
    fun `rejects grounded output reservation above application ceiling`() {
        assertThatThrownBy {
            AiGenerationConfigValidator(
                aigenEnabled = true,
                beanFactory = queueBeanFactory(),
                properties = validProperties(reservedOutputTokens = 16_385),
            ).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("reserved-output-tokens")
    }

    @Test
    fun `rejects zero safety margin`() {
        val properties = validProperties().copy(grounded = validProperties().grounded.copy(safetyMarginTokens = 0))

        assertThatThrownBy {
            AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("safety-margin-tokens")
    }

    @Test
    fun `rejects non-positive capability limits`() {
        listOf(
            AiGenerationProperties.Capability(0, 128_000, true),
            AiGenerationProperties.Capability(400_000, -1, true),
        ).forEach { invalidCapability ->
            val base = validProperties()
            val properties =
                base.copy(
                    grounded = base.grounded.copy(capabilities = mapOf("gpt-5.4-mini" to invalidCapability)),
                )

            assertThatThrownBy {
                AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
            }.isInstanceOf(IllegalStateException::class.java)
                .hasMessageContaining("limits must be positive")
        }
    }

    @Test
    fun `rejects reservation above model output limit`() {
        val base = validProperties(reservedOutputTokens = 100)
        val properties =
            base.copy(
                grounded =
                    base.grounded.copy(
                        capabilities =
                            mapOf(
                                "gpt-5.4-mini" to AiGenerationProperties.Capability(400_000, 99, true),
                            ),
                    ),
            )

        assertThatThrownBy {
            AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("exceeds max-output-tokens")
    }

    @Test
    fun `rejects capability entry without separate pricing`() {
        val properties = validProperties().copy(pricing = emptyMap())

        assertThatThrownBy {
            AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("pricing")
    }

    @Test
    fun `legacy priced model does not implicitly become grounded enabled`() {
        val base = validProperties()
        val properties =
            base.copy(
                enabledProviders = setOf("OPENAI"),
                pricing =
                    base.pricing +
                        mapOf(
                            "gpt-legacy" to
                                AiGenerationProperties.Pricing(
                                    BigDecimal.ONE,
                                    outputPerMTokenUsd = BigDecimal.ONE,
                                ),
                        ),
            )

        assertThatCode {
            AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
        }.doesNotThrowAnyException()
    }

    @Test
    fun `rejects grounded default without verified capability`() {
        val properties =
            validProperties().copy(
                fallbackDefaultModel = "future-model",
            )

        assertThatThrownBy {
            AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessageContaining("fallback-default-model")
    }

    @Test
    fun `rejects enabled Anthropic capability outside native structured output verification`() {
        val properties =
            validAnthropicProperties(
                capabilities =
                    mapOf(
                        "claude-unverified-public-test" to
                            AiGenerationProperties.Capability(1_000_000, 128_000, true),
                    ),
                pricing =
                    mapOf(
                        "claude-unverified-public-test" to
                            AiGenerationProperties.Pricing(
                                inputPerMTokenUsd = BigDecimal("3.00"),
                                cacheWriteInputPerMTokenUsd = BigDecimal("3.75"),
                                cachedInputPerMTokenUsd = BigDecimal("0.30"),
                                outputPerMTokenUsd = BigDecimal("15.00"),
                            ),
                    ),
            )

        assertThatThrownBy {
            AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessage("Enabled Anthropic grounded model lacks verified native structured output or pricing")
            .hasMessageNotContaining("claude-unverified-public-test")
    }

    @Test
    fun `rejects enabled Anthropic capability without explicit cache-write pricing`() {
        val properties =
            validAnthropicProperties(
                pricing =
                    mapOf(
                        "claude-sonnet-4-6" to
                            AiGenerationProperties.Pricing(
                                inputPerMTokenUsd = BigDecimal("3.00"),
                                cacheWriteInputPerMTokenUsd = null,
                                cachedInputPerMTokenUsd = BigDecimal("0.30"),
                                outputPerMTokenUsd = BigDecimal("15.00"),
                            ),
                    ),
            )

        assertThatThrownBy {
            AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessage("Enabled Anthropic grounded model lacks verified native structured output or pricing")
            .hasMessageNotContaining("claude-sonnet-4-6")
    }

    @Test
    fun `rejects enabled Anthropic capability without pricing using a content-free message`() {
        val properties = validAnthropicProperties(pricing = emptyMap())

        assertThatThrownBy {
            AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessage("Enabled Anthropic grounded model lacks verified native structured output or pricing")
            .hasMessageNotContaining("claude-sonnet-4-6")
    }

    @Test
    fun `requires paid tier retention confirmation for non-mock Gemini`() {
        val properties = validGeminiProperties(paidTierRetentionConfirmed = false)

        assertThatThrownBy {
            AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
        }.isInstanceOf(IllegalStateException::class.java)
            .hasMessage(
                "readmates.aigen.providers.google.paid-tier-retention-confirmed must be true when GEMINI is enabled",
            ).hasMessageNotContaining("key")
            .hasMessageNotContaining("project")
    }

    @Test
    fun `allows Gemini without paid tier confirmation only in mock mode`() {
        val properties = validGeminiProperties(paidTierRetentionConfirmed = false).copy(mock = true)

        assertThatCode {
            AiGenerationConfigValidator(true, queueBeanFactory(), properties).validate()
        }.doesNotThrowAnyException()
    }

    private fun validProperties(reservedOutputTokens: Long = 16_384): AiGenerationProperties =
        AiGenerationProperties(
            fallbackDefaultModel = "gpt-5.4-mini",
            grounded =
                AiGenerationProperties.Grounded(
                    reservedOutputTokens = reservedOutputTokens,
                    capabilities =
                        mapOf(
                            "gpt-5.4-mini" to
                                AiGenerationProperties.Capability(400_000, 128_000, true),
                        ),
                ),
            pricing =
                mapOf(
                    "gpt-5.4-mini" to
                        AiGenerationProperties.Pricing(BigDecimal("0.75"), outputPerMTokenUsd = BigDecimal("4.50")),
                ),
        )

    private fun validAnthropicProperties(
        capabilities: Map<String, AiGenerationProperties.Capability> =
            mapOf(
                "claude-sonnet-4-6" to AiGenerationProperties.Capability(1_000_000, 128_000, true),
            ),
        pricing: Map<String, AiGenerationProperties.Pricing> =
            mapOf(
                "claude-sonnet-4-6" to
                    AiGenerationProperties.Pricing(
                        inputPerMTokenUsd = BigDecimal("3.00"),
                        cacheWriteInputPerMTokenUsd = BigDecimal("3.75"),
                        cachedInputPerMTokenUsd = BigDecimal("0.30"),
                        outputPerMTokenUsd = BigDecimal("15.00"),
                    ),
            ),
    ) = AiGenerationProperties(
        enabledProviders = setOf("CLAUDE"),
        fallbackDefaultModel = capabilities.keys.first(),
        grounded = AiGenerationProperties.Grounded(capabilities = capabilities),
        pricing = pricing,
    )

    private fun validGeminiProperties(paidTierRetentionConfirmed: Boolean) =
        AiGenerationProperties(
            enabledProviders = setOf("GEMINI"),
            fallbackDefaultModel = "gemini-3-flash-preview",
            grounded =
                AiGenerationProperties.Grounded(
                    capabilities =
                        mapOf(
                            "gemini-3-flash-preview" to
                                AiGenerationProperties.Capability(1_048_576, 65_536, true),
                        ),
                ),
            providers =
                AiGenerationProperties.Providers(
                    google =
                        AiGenerationProperties.GoogleProvider(
                            paidTierRetentionConfirmed = paidTierRetentionConfirmed,
                        ),
                ),
            pricing =
                mapOf(
                    "gemini-3-flash-preview" to
                        AiGenerationProperties.Pricing(
                            inputPerMTokenUsd = BigDecimal("0.50"),
                            cacheWriteInputPerMTokenUsd = BigDecimal("0.50"),
                            cachedInputPerMTokenUsd = BigDecimal("0.05"),
                            outputPerMTokenUsd = BigDecimal("3.00"),
                        ),
                ),
        )

    private fun queueBeanFactory(): DefaultListableBeanFactory =
        DefaultListableBeanFactory().also { factory ->
            factory.registerBeanDefinition("noopQueue", RootBeanDefinition(NoopQueue::class.java))
        }

    private fun emptyBeanFactory(): DefaultListableBeanFactory = DefaultListableBeanFactory()

    private class NoopQueue : AiGenerationJobQueue {
        override fun publish(command: AiGenerationJobPublishCommand) = Unit
    }
}
