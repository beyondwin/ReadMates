package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.ModelPricing
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.SessionContentGenerator
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class ProviderFallbackChainTest {
    private val claude = ModelId(Provider.CLAUDE, "claude-sonnet-4-6")
    private val openai = ModelId(Provider.OPENAI, "gpt-5.4-mini")
    private val gemini = ModelId(Provider.GEMINI, "gemini-2.5-flash")
    private val pricing = ModelPricing(BigDecimal("3"), BigDecimal("0.3"), BigDecimal("15"))

    private fun gen(p: Provider): SessionContentGenerator = FakeContentGenerator(provider = p)

    private fun chain(
        order: List<String>,
        enabled: Set<ModelId> = setOf(claude, openai, gemini),
        generators: Map<Provider, SessionContentGenerator> =
            mapOf(
                Provider.CLAUDE to gen(Provider.CLAUDE),
                Provider.OPENAI to gen(Provider.OPENAI),
                Provider.GEMINI to gen(Provider.GEMINI),
            ),
    ): ProviderFallbackChain =
        ProviderFallbackChain(
            generators = generators,
            modelCatalog = FakeModelCatalog(pricing = enabled.associateWith { pricing }, enabled = enabled),
            properties = AiGenerationTestFixtures.defaultProperties().copy(fallbackChain = order),
        )

    @Test
    fun `returns first chain entry of a different provider`() {
        val result = chain(order = listOf("claude-sonnet-4-6", "gpt-5.4-mini", "gemini-2.5-flash")).nextAfter(claude)
        assertThat(result).isEqualTo(openai)
    }

    @Test
    fun `skips entries with the same provider as the failed model`() {
        val result = chain(order = listOf("claude-sonnet-4-6", "gemini-2.5-flash")).nextAfter(claude)
        assertThat(result).isEqualTo(gemini)
    }

    @Test
    fun `skips entries that are not enabled in the catalog`() {
        val result =
            chain(order = listOf("gpt-5.4-mini", "gemini-2.5-flash"), enabled = setOf(claude, gemini)).nextAfter(claude)
        assertThat(result).isEqualTo(gemini)
    }

    @Test
    fun `skips entries whose provider has no generator`() {
        val result =
            chain(
                order = listOf("gpt-5.4-mini", "gemini-2.5-flash"),
                generators = mapOf(Provider.CLAUDE to gen(Provider.CLAUDE), Provider.GEMINI to gen(Provider.GEMINI)),
            ).nextAfter(claude)
        assertThat(result).isEqualTo(gemini)
    }

    @Test
    fun `returns null when chain is exhausted`() {
        val result = chain(order = listOf("claude-sonnet-4-6")).nextAfter(claude)
        assertThat(result).isNull()
    }

    @Test
    fun `returns null for an empty chain`() {
        val result = chain(order = emptyList()).nextAfter(claude)
        assertThat(result).isNull()
    }
}
