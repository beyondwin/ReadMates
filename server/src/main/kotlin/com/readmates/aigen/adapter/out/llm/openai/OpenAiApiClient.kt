package com.readmates.aigen.adapter.out.llm.openai

import com.fasterxml.jackson.databind.node.ObjectNode
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * Live [OpenAiApiPort] adapter backed by `com.openai:openai-java`.
 *
 * Resolves the API key from `READMATES_AIGEN_OPENAI_API_KEY` at the
 * first call site so the bean still loads in test contexts where the
 * env var is unset. The actual `client.chat().completions().create(...)`
 * wiring (`response_format = ResponseFormatJsonSchema(strict=true, ...)`,
 * `store(false)` for no data retention, and `Usage` parsing) is deferred
 * to a follow-up task that introduces an integration test with a real
 * API key — Phase 4 unit tests exercise the contract via [FakeOpenAiApi]
 * against [OpenAiApiPort] directly. Mirrors the Claude adapter pattern
 * established in task 1.6.
 *
 * Gated behind `readmates.aigen.enabled=true` AND
 * `readmates.aigen.mock != true` so the `aigen-mock` profile can swap in
 * a stub.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@ConditionalOnProperty(
    prefix = "readmates.aigen",
    name = ["mock"],
    havingValue = "false",
    matchIfMissing = true,
)
open class OpenAiApiClient : OpenAiApiPort {
    @Suppress("LongParameterList")
    override fun callJsonSchema(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        schemaName: String,
        schema: ObjectNode,
    ): OpenAiToolResult {
        val apiKey = System.getenv(API_KEY_ENV)
        check(!apiKey.isNullOrBlank()) {
            "$API_KEY_ENV not set; required when readmates.aigen.enabled=true and mock=false"
        }
        // Live SDK call wiring (ResponseFormatJsonSchema with strict=true,
        // store(false) for no data retention, Usage parsing) is
        // intentionally TODO until a Phase 4 integration test lands.
        // Unit tests in task 4.2 cover the generator/regenerator
        // contract via a fake OpenAiApiPort.
        throw NotImplementedError(
            "Live OpenAI SDK call wiring TODO; covered by FakeOpenAiApi in unit tests.",
        )
    }

    companion object {
        const val API_KEY_ENV: String = "READMATES_AIGEN_OPENAI_API_KEY"
    }
}
