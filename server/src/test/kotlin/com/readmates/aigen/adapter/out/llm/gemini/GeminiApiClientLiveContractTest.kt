package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable

/**
 * Live contract test for [GeminiApiClient.callResponseSchema].
 *
 * Skipped by default — only runs when `READMATES_AIGEN_GEMINI_API_KEY`
 * is set. JUnit reports this class as 0 executed / 1 skipped when the
 * env var is absent (the documented "green" RED→GREEN form for an
 * env-gated live contract test, mirroring
 * [com.readmates.aigen.adapter.out.llm.claude.ClaudeApiClientLiveContractTest]
 * and [com.readmates.aigen.adapter.out.llm.openai.OpenAiApiClientLiveContractTest]).
 *
 * When enabled, this test makes ONE real Gemini `models.generateContent`
 * request via the `com.google.genai:google-genai:1.53.0` Java SDK with a
 * minimal `responseSchema`. Asserts only the structural contract
 * (non-null result, non-zero `inputTokens`) — no content assertion,
 * because the smoke test must not couple to model output wording.
 *
 * NOTE: this test is NOT tagged `integration` so it runs in the
 * `:unitTest` task (which excludes only `integration`/`container`/
 * `architecture` tags); when the env var is unset, the
 * `@EnabledIfEnvironmentVariable` precondition short-circuits execution
 * before the SDK is touched, so headless CI loads zero network state.
 */
@EnabledIfEnvironmentVariable(named = GeminiApiClient.API_KEY_ENV, matches = ".+")
class GeminiApiClientLiveContractTest {
    private val mapper = ObjectMapper()

    @Test
    fun `callResponseSchema returns parsed object and non-zero input tokens against live Gemini API`() {
        val client = GeminiApiClient()
        val schema =
            mapper.readTree(
                """
                {
                  "type": "object",
                  "properties": { "value": { "type": "string" } },
                  "required": ["value"]
                }
                """.trimIndent(),
            ) as ObjectNode

        val result =
            client.callResponseSchema(
                model = "gemini-2.5-flash",
                systemPrompt = "You are a smoke-test helper. Always emit a JSON object matching the schema.",
                userText = "Please respond with value=\"ok\".",
                transcriptText = "(smoke transcript — irrelevant content)",
                responseSchema = schema,
            )

        assertNotNull(result)
        assertTrue(result.usage.inputTokens > 0, "expected non-zero inputTokens, got ${result.usage.inputTokens}")
    }
}
