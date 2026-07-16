package com.readmates.aigen.adapter.out.llm.springai

import com.fasterxml.jackson.databind.ObjectMapper
import com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource
import com.readmates.aigen.adapter.out.llm.gemini.GeminiSchemaCompatAdapter
import com.readmates.aigen.config.GoogleGenAiSpringAiModelFactory
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable
import org.springframework.ai.chat.client.ChatClient
import org.springframework.ai.google.genai.GoogleGenAiChatOptions
import java.time.Duration

/**
 * Opt-in paid contract for the preview model's no-thinking structured-output behavior.
 * Normal CI never sends this request: key, paid-tier confirmation, and an explicit live flag are all required.
 */
@EnabledIfEnvironmentVariable(named = GoogleGenAiSpringAiModelFactory.API_KEY_ENV, matches = ".+")
@EnabledIfEnvironmentVariable(named = "READMATES_AIGEN_GOOGLE_PAID_TIER_RETENTION_CONFIRMED", matches = "true")
@EnabledIfEnvironmentVariable(named = "READMATES_AIGEN_LIVE_CONTRACT", matches = "true")
class GoogleGenAiSpringAiLiveContractTest {
    @Test
    fun `preview model accepts zero thinking and strict JSON output`() {
        val apiKey = requireNotNull(System.getenv(GoogleGenAiSpringAiModelFactory.API_KEY_ENV))
        val schema =
            """
            {
              "type":"object",
              "properties":{"value":{"type":"string"}},
              "required":["value"],
              "additionalProperties":false
            }
            """.trimIndent()
        val providerSchema = GeminiSchemaCompatAdapter(SessionImportSchemaResource()).adapt(schema)
        assertThat(providerSchema).doesNotContain("additionalProperties")
        val options =
            GoogleGenAiChatOptions
                .builder()
                .model("gemini-3-flash-preview")
                .maxOutputTokens(256)
                .responseMimeType("application/json")
                .outputSchema(providerSchema)
                .thinkingBudget(0)
                .includeThoughts(false)
                .googleSearchRetrieval(false)
                .includeServerSideToolInvocations(false)
        val model =
            GoogleGenAiSpringAiModelFactory
                .create(apiKey = apiKey, timeout = Duration.ofMinutes(4))
                .model

        val entity =
            ChatClient
                .create(model)
                .prompt()
                .user("Return a JSON object whose value field is the word ok.")
                .options(options)
                .call()
                .responseEntity(GroundedStructuredOutputConverter(providerSchema, ObjectMapper())) {
                    it.useProviderStructuredOutput()
                }

        assertThat(entity.entity()?.path("value")?.isTextual).isTrue()
        assertThat(
            entity
                .response()
                ?.metadata
                ?.usage
                ?.promptTokens,
        ).isPositive()
    }
}
