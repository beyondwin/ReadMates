package com.readmates.aigen.config

import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.WholeTranscriptGroundedGenerator
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class AiGenerationBeansConfigTest {
    @Test
    fun `grounded map requires every enabled provider`() {
        assertThatThrownBy {
            AiGenerationBeansConfig().validateGroundedGenerators(
                emptyMap(),
                AiGenerationProperties(enabledProviders = setOf("OPENAI")),
            )
        }.isInstanceOf(IllegalArgumentException::class.java)
    }

    @Test
    fun `grounded map accepts the single Spring AI implementation for enabled providers`() {
        val generator = org.mockito.Mockito.mock(WholeTranscriptGroundedGenerator::class.java)
        val map = mapOf(Provider.OPENAI to generator)

        assertThat(
            AiGenerationBeansConfig().validateGroundedGenerators(
                map,
                AiGenerationProperties(enabledProviders = setOf("OPENAI")),
            ),
        ).isSameAs(map)
    }
}
