package com.readmates.aigen.adapter.out.llm.springai

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.aigen.adapter.out.llm.common.LlmStructuredOutputException
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.jupiter.api.Test

class GroundedStructuredOutputConverterTest {
    private val objectMapper = ObjectMapper()

    @Test
    fun `returns the exact versioned schema and keeps the renderer as the only prompt source`() {
        val schema = """{"${'$'}schema":"https://json-schema.org/draft/2020-12/schema","title":"grounded-v2"}"""
        val converter = GroundedStructuredOutputConverter(schema, objectMapper)

        assertThat(converter.jsonSchema).isEqualTo(schema)
        assertThat(converter.format).isEmpty()
    }

    @Test
    fun `converts only a JSON object`() {
        val converter = GroundedStructuredOutputConverter("{}", objectMapper)

        assertThat(converter.convert("""{"format":"readmates-grounded-generation:v2"}""").path("format").asText())
            .isEqualTo("readmates-grounded-generation:v2")
        assertThatThrownBy { converter.convert("[1,2,3]") }
            .isInstanceOf(LlmStructuredOutputException::class.java)
            .hasMessage("provider returned invalid structured output")
    }
}
