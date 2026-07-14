package com.readmates.aigen.adapter.out.llm.common

import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.config.AiGenerationProperties
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class YamlModelCapabilityCatalogTest {
    @Test
    fun `unknown model has no inferred capability`() {
        val catalog =
            YamlModelCapabilityCatalog(
                AiGenerationProperties(
                    grounded =
                        AiGenerationProperties.Grounded(
                            capabilities =
                                mapOf(
                                    "gpt-5.4-mini" to capability(400_000, 128_000),
                                ),
                        ),
                ),
            )

        assertThat(catalog.find(ModelId(Provider.OPENAI, "future-model"))).isNull()
    }

    @Test
    fun `loads verified capability independently from pricing`() {
        val catalog =
            YamlModelCapabilityCatalog(
                AiGenerationProperties(
                    grounded =
                        AiGenerationProperties.Grounded(
                            capabilities =
                                mapOf(
                                    "claude-sonnet-4-6" to capability(1_000_000, 64_000),
                                ),
                        ),
                ),
            )

        val loaded = catalog.find(ModelId(Provider.CLAUDE, "claude-sonnet-4-6"))

        assertThat(loaded?.contextWindowTokens).isEqualTo(1_000_000)
        assertThat(loaded?.maxOutputTokens).isEqualTo(64_000)
        assertThat(loaded?.structuredOutputSupported).isTrue()
    }

    private fun capability(
        context: Long,
        output: Long,
    ) = AiGenerationProperties.Capability(
        contextWindowTokens = context,
        maxOutputTokens = output,
        structuredOutputSupported = true,
    )
}
