package com.readmates.aigen.adapter.out.llm.claude

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable

/**
 * Live contract test for [ClaudeApiClient.callTool].
 *
 * Skipped by default — only runs when `READMATES_AIGEN_ANTHROPIC_API_KEY`
 * is set. JUnit reports this class as 0 executed / 1 skipped when the
 * env var is absent (this is the documented "green" RED→GREEN form for
 * an env-gated live contract test).
 *
 * When enabled, this test makes ONE real Anthropic API request via the
 * 2.27.0 Java SDK with a minimal tool schema. Asserts only the
 * structural contract (non-null result, non-zero `inputTokens`) — no
 * content assertion, because the smoke test must not couple to model
 * output wording.
 *
 * NOTE: this test is NOT tagged `integration` so it runs in the
 * `:unitTest` task (which excludes only `integration`/`container`/
 * `architecture` tags); when the env var is unset, the
 * `@EnabledIfEnvironmentVariable` precondition short-circuits the
 * test execution before the SDK is touched, so headless CI loads zero
 * network state.
 */
@EnabledIfEnvironmentVariable(named = ClaudeApiClient.API_KEY_ENV, matches = ".+")
class ClaudeApiClientLiveContractTest {
    private val mapper = ObjectMapper()

    @Test
    fun `callTool returns parsed tool input and non-zero input tokens against live Anthropic API`() {
        val client = ClaudeApiClient()
        val schema =
            mapper.readTree(
                """
                {
                  "type": "object",
                  "properties": { "value": { "type": "string" } },
                  "required": ["value"]
                }
                """.trimIndent(),
            ) as com.fasterxml.jackson.databind.node.ObjectNode

        val result =
            client.callTool(
                model = "claude-sonnet-4-5-20250929",
                systemPrompt = "You are a smoke-test helper. Always invoke the report_value tool.",
                userText = "Please call report_value with value=\"ok\".",
                transcriptText = "(smoke transcript — irrelevant content)",
                toolName = "report_value",
                toolSchema = schema,
                expectCacheControl = false,
                maxOutputTokens = 4096,
            )

        assertNotNull(result)
        assertTrue(
            result.usage.nonCachedInputTokens > 0,
            "expected non-zero inputTokens, got ${result.usage.nonCachedInputTokens}",
        )
    }
}
