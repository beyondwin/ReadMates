package com.readmates.aigen.adapter.out.llm.common

import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.config.AiGenerationProperties
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class YamlModelCatalogTest {

    private fun pricing(input: String, cached: String = "0", output: String) =
        AiGenerationProperties.Pricing(
            inputPerMTokenUsd = BigDecimal(input),
            cachedInputPerMTokenUsd = BigDecimal(cached),
            outputPerMTokenUsd = BigDecimal(output),
        )

    @Test
    fun `empty enabledProviders means kill switch - allowlisted is empty`() {
        val props = AiGenerationProperties(
            enabledProviders = emptySet(),
            pricing = mapOf(
                "claude-sonnet-4-6" to pricing("3", "0.30", "15"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        assertTrue(catalog.allowlisted().isEmpty())
    }

    @Test
    fun `claude prefix models are derived as CLAUDE provider and allowlisted`() {
        val props = AiGenerationProperties(
            enabledProviders = setOf("CLAUDE"),
            pricing = mapOf(
                "claude-sonnet-4-6" to pricing("3", "0.30", "15"),
                "claude-opus-4-7" to pricing("15", "1.50", "75"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        val allow = catalog.allowlisted()
        assertEquals(2, allow.size)
        assertTrue(allow.contains(ModelId(Provider.CLAUDE, "claude-sonnet-4-6")))
        assertTrue(allow.contains(ModelId(Provider.CLAUDE, "claude-opus-4-7")))
    }

    @Test
    fun `disabled provider excludes its models even if pricing present`() {
        val props = AiGenerationProperties(
            enabledProviders = setOf("CLAUDE"),
            pricing = mapOf(
                "claude-sonnet-4-6" to pricing("3", "0.30", "15"),
                "gpt-4o" to pricing("5", "0", "15"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        val allow = catalog.allowlisted()
        assertEquals(1, allow.size)
        assertEquals(ModelId(Provider.CLAUDE, "claude-sonnet-4-6"), allow.single())
    }

    @Test
    fun `enabledProviders case-insensitive matches Provider name`() {
        val props = AiGenerationProperties(
            enabledProviders = setOf("openai"),
            pricing = mapOf(
                "gpt-5.4-mini" to pricing("2", "0.50", "8"),
                "o1" to pricing("15", "0", "60"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        val allow = catalog.allowlisted()
        assertEquals(2, allow.size)
        assertTrue(allow.any { it == ModelId(Provider.OPENAI, "gpt-5.4-mini") })
        assertTrue(allow.any { it == ModelId(Provider.OPENAI, "o1") })
    }

    @Test
    fun `gemini prefix maps to GEMINI provider`() {
        val props = AiGenerationProperties(
            enabledProviders = setOf("GEMINI"),
            pricing = mapOf(
                "gemini-3-flash" to pricing("1.25", "0", "10"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        assertEquals(
            listOf(ModelId(Provider.GEMINI, "gemini-3-flash")),
            catalog.allowlisted(),
        )
    }

    @Test
    fun `unknown model prefix is skipped without crashing`() {
        val props = AiGenerationProperties(
            enabledProviders = setOf("CLAUDE", "OPENAI", "GEMINI"),
            pricing = mapOf(
                "claude-sonnet-4-6" to pricing("3", "0.30", "15"),
                "gpt-4o" to pricing("5", "0", "15"),
                "foo-bar" to pricing("1", "0", "1"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        assertEquals(2, catalog.allowlisted().size)
    }

    @Test
    fun `pricing returns ModelPricing for allowlisted model`() {
        val props = AiGenerationProperties(
            enabledProviders = setOf("CLAUDE"),
            pricing = mapOf(
                "claude-sonnet-4-6" to pricing("3", "0.30", "15"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        val p = catalog.pricing(ModelId(Provider.CLAUDE, "claude-sonnet-4-6"))
        assertEquals(BigDecimal("3"), p.inputPerMTokenUsd)
        assertEquals(BigDecimal("0.30"), p.cachedInputPerMTokenUsd)
        assertEquals(BigDecimal("15"), p.outputPerMTokenUsd)
    }

    @Test
    fun `pricing throws IllegalStateException when model not in catalog`() {
        val props = AiGenerationProperties(
            enabledProviders = setOf("CLAUDE"),
            pricing = mapOf(
                "claude-sonnet-4-6" to pricing("3", "0.30", "15"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        assertThrows(IllegalStateException::class.java) {
            catalog.pricing(ModelId(Provider.CLAUDE, "claude-unknown"))
        }
    }

    @Test
    fun `resolveAlias returns ModelId when alias matches allowlisted name`() {
        val props = AiGenerationProperties(
            enabledProviders = setOf("CLAUDE"),
            pricing = mapOf(
                "claude-sonnet-4-6" to pricing("3", "0.30", "15"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        val resolved = catalog.resolveAlias("claude-sonnet-4-6")
        assertNotNull(resolved)
        assertEquals(ModelId(Provider.CLAUDE, "claude-sonnet-4-6"), resolved)
    }

    @Test
    fun `resolveAlias returns null when alias not allowlisted`() {
        val props = AiGenerationProperties(
            enabledProviders = setOf("CLAUDE"),
            pricing = mapOf(
                "claude-sonnet-4-6" to pricing("3", "0.30", "15"),
                "gpt-4o" to pricing("5", "0", "15"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        assertNull(catalog.resolveAlias("gpt-4o"))
        assertNull(catalog.resolveAlias("does-not-exist"))
    }

    @Test
    fun `isEnabled true for allowlisted model and false otherwise`() {
        val props = AiGenerationProperties(
            enabledProviders = setOf("CLAUDE"),
            pricing = mapOf(
                "claude-sonnet-4-6" to pricing("3", "0.30", "15"),
                "gpt-4o" to pricing("5", "0", "15"),
            ),
        )

        val catalog = YamlModelCatalog(props)

        assertTrue(catalog.isEnabled(ModelId(Provider.CLAUDE, "claude-sonnet-4-6")))
        assertFalse(catalog.isEnabled(ModelId(Provider.OPENAI, "gpt-4o")))
        assertFalse(catalog.isEnabled(ModelId(Provider.CLAUDE, "claude-not-in-catalog")))
    }
}
