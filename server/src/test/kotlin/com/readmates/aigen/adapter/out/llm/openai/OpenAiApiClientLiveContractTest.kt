package com.readmates.aigen.adapter.out.llm.openai

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable

/**
 * Live contract test for [OpenAiApiClient.callJsonSchema].
 *
 * Skipped by default — only runs when `READMATES_AIGEN_OPENAI_API_KEY`
 * is set. JUnit reports this class as 0 executed / 1 skipped when the
 * env var is absent (the documented "green" RED→GREEN form for an
 * env-gated live contract test, mirroring
 * [com.readmates.aigen.adapter.out.llm.claude.ClaudeApiClientLiveContractTest]).
 *
 * When enabled, this test makes ONE real OpenAI Chat Completions request
 * via the 4.32.0 Java SDK with a minimal strict JSON Schema. Asserts only
 * the structural contract (non-null result, non-zero `inputTokens`) — no
 * content assertion, because the smoke test must not couple to model
 * output wording.
 *
 * NOTE: this test is NOT tagged `integration` so it runs in the
 * `:unitTest` task (which excludes only `integration`/`container`/
 * `architecture` tags); when the env var is unset, the
 * `@EnabledIfEnvironmentVariable` precondition short-circuits execution
 * before the SDK is touched, so headless CI loads zero network state.
 */
@EnabledIfEnvironmentVariable(named = OpenAiApiClient.API_KEY_ENV, matches = ".+")
class OpenAiApiClientLiveContractTest {
    private val mapper = ObjectMapper()

    @Test
    fun `callJsonSchema returns parsed object and non-zero input tokens against live OpenAI API`() {
        val client = OpenAiApiClient()
        val schema =
            mapper.readTree(
                """
                {
                  "type": "object",
                  "properties": { "value": { "type": "string" } },
                  "required": ["value"],
                  "additionalProperties": false
                }
                """.trimIndent(),
            ) as ObjectNode

        val result =
            client.callJsonSchema(
                model = "gpt-4o-mini",
                systemPrompt = "You are a smoke-test helper. Always emit a JSON object matching the schema.",
                userText = "Please respond with value=\"ok\".",
                transcriptText = "(smoke transcript — irrelevant content)",
                schemaName = "smoke_test",
                schema = schema,
            )

        assertNotNull(result)
        assertTrue(result.usage.inputTokens > 0, "expected non-zero inputTokens, got ${result.usage.inputTokens}")
    }
}
