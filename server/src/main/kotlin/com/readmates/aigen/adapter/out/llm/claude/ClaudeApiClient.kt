package com.readmates.aigen.adapter.out.llm.claude

import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * Live [ClaudeApiPort] adapter backed by `com.anthropic:anthropic-java`.
 *
 * Resolves the API key from `READMATES_AIGEN_ANTHROPIC_API_KEY` at the
 * first call site so the bean still loads in test contexts where the
 * env var is unset. The actual `client.messages().create(...)` wiring
 * (Tool with custom `input_schema` JsonValue, `ToolChoiceTool` to force
 * the named tool, `TextBlockParam.cacheControl(CacheControlEphemeral)`
 * on the transcript block, and `content().toolUse()` parsing) is
 * deferred to a follow-up task that introduces an integration test
 * with a real API key — Phase 0 unit tests exercise the contract via
 * [FakeClaudeApi] against [ClaudeApiPort] directly. See task 1.6
 * STATUS for SDK_STATUS notes.
 *
 * Gated behind `readmates.aigen.enabled=true` to match the rest of the
 * adapter beans; this also ensures the integration test context
 * (`application-test.yml`, `aigen.enabled=false`) does not require the
 * API key to bootstrap the Spring application context.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
open class ClaudeApiClient : ClaudeApiPort {
    @Suppress("LongParameterList")
    override fun callTool(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        toolName: String,
        toolSchema: ObjectNode,
        expectCacheControl: Boolean,
    ): ClaudeToolResult {
        val apiKey = System.getenv(API_KEY_ENV)
        check(!apiKey.isNullOrBlank()) {
            "$API_KEY_ENV not set; required when readmates.aigen.enabled=true"
        }
        // Live SDK call wiring (Tool input_schema JsonValue,
        // ToolChoiceTool, TextBlockParam.cacheControl, Usage parsing)
        // is intentionally TODO until a Phase 1 integration test lands.
        // Unit tests in task 1.6 cover the generator/regenerator
        // contract via a fake ClaudeApiPort.
        throw NotImplementedError(
            "Live Anthropic SDK call wiring TODO; covered by FakeClaudeApi in unit tests.",
        )
    }

    companion object {
        const val API_KEY_ENV: String = "READMATES_AIGEN_ANTHROPIC_API_KEY"
    }
}
