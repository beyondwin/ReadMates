package com.readmates.aigen.config

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.boot.context.properties.bind.Binder
import org.springframework.boot.context.properties.source.ConfigurationPropertySources
import org.springframework.boot.env.YamlPropertySourceLoader
import org.springframework.core.env.MutablePropertySources
import java.math.BigDecimal

/**
 * Verifies that application.yml binds correctly into AiGenerationProperties,
 * specifically that OpenAI pricing entries added in task 4.1 and Gemini pricing
 * entries added in task 5.1 are present and structurally identical to existing
 * Claude entries.
 */
class AiGenerationPropertiesTest {

    private fun loadPricing(): Map<String, AiGenerationProperties.Pricing> {
        // Load the production application.yml directly from the source tree (not the test
        // classpath, which has its own shadowing application.yml without aigen config).
        val resource = org.springframework.core.io.FileSystemResource(
            java.io.File("src/main/resources/application.yml"),
        )
        check(resource.exists()) { "application.yml not found at ${resource.file.absolutePath}" }
        val sources = YamlPropertySourceLoader().load("application.yml", resource)
        val mutable = MutablePropertySources()
        sources.forEach { mutable.addLast(it) }
        val binder = Binder(ConfigurationPropertySources.from(mutable))
        val pricingTarget = org.springframework.boot.context.properties.bind.Bindable
            .mapOf(String::class.java, AiGenerationProperties.Pricing::class.java)
        return binder.bind("readmates.aigen.pricing", pricingTarget).get()
    }

    @Test
    fun `application_yml binds OpenAI pricing entries with input cached and output rates`() {
        val pricing = loadPricing()

        val openai41 = pricing["openai-gpt-4-1"]
        assertNotNull(openai41, "openai-gpt-4-1 pricing must be present in application.yml")
        assertEquals(0, BigDecimal("2.00").compareTo(openai41!!.inputPerMTokenUsd))
        assertEquals(0, BigDecimal("0.50").compareTo(openai41.cachedInputPerMTokenUsd))
        assertEquals(0, BigDecimal("8.00").compareTo(openai41.outputPerMTokenUsd))

        val openai41Mini = pricing["openai-gpt-4-1-mini"]
        assertNotNull(openai41Mini, "openai-gpt-4-1-mini pricing must be present in application.yml")
        assertEquals(0, BigDecimal("0.40").compareTo(openai41Mini!!.inputPerMTokenUsd))
        assertEquals(0, BigDecimal("0.10").compareTo(openai41Mini.cachedInputPerMTokenUsd))
        assertEquals(0, BigDecimal("1.60").compareTo(openai41Mini.outputPerMTokenUsd))
    }

    @Test
    fun `existing Claude pricing entries remain bound`() {
        val pricing = loadPricing()

        assertTrue(pricing.containsKey("claude-sonnet-4-6"))
        assertTrue(pricing.containsKey("claude-opus-4-7"))
    }

    @Test
    fun `application_yml binds Gemini pricing entries with input cached and output rates`() {
        val pricing = loadPricing()

        val geminiPro = pricing["gemini-2-5-pro"]
        assertNotNull(geminiPro, "gemini-2-5-pro pricing must be present in application.yml")
        assertEquals(0, BigDecimal("1.25").compareTo(geminiPro!!.inputPerMTokenUsd))
        assertEquals(0, BigDecimal("0.31").compareTo(geminiPro.cachedInputPerMTokenUsd))
        assertEquals(0, BigDecimal("10.00").compareTo(geminiPro.outputPerMTokenUsd))

        val geminiFlash = pricing["gemini-2-5-flash"]
        assertNotNull(geminiFlash, "gemini-2-5-flash pricing must be present in application.yml")
        assertEquals(0, BigDecimal("0.30").compareTo(geminiFlash!!.inputPerMTokenUsd))
        assertEquals(0, BigDecimal("0.075").compareTo(geminiFlash.cachedInputPerMTokenUsd))
        assertEquals(0, BigDecimal("2.50").compareTo(geminiFlash.outputPerMTokenUsd))
    }
}
