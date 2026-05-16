package com.readmates.aigen.adapter.out.llm.openai

import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.application.model.TokenUsage

/**
 * Outbound port abstracting the OpenAI Java SDK call for a single
 * `chat.completions.create` (or `responses.create`) request that forces
 * the model to emit a JSON object matching a strict JSON Schema.
 * Introduced so [OpenAiContentGenerator] and [OpenAiContentRegenerator]
 * can be unit-tested with an in-memory fake without depending on the live
 * SDK or a real API key.
 *
 * Implementation contract:
 * - `systemPrompt` is sent as the request's `system` message.
 * - `userText` is the first user message (prelude).
 * - `transcriptText` is appended as a separate user message containing
 *   the raw transcript. OpenAI's automatic prompt-caching is handled by
 *   the SDK; cache control is NOT surfaced through this port.
 * - `schemaName` is OpenAI's `response_format.json_schema.name`
 *   (for example `"session_import_v1"` for full generation or
 *   `"session_import_v1_summary"` for SUMMARY regeneration).
 * - `schema` is supplied as `response_format.json_schema.schema` and the
 *   request MUST set `strict = true`.
 * - The implementation MUST set `store = false` so OpenAI does not
 *   retain prompt/completion data (spec §9.1, §9.3 — PII protection).
 * - The returned [OpenAiToolResult] carries the parsed JSON object
 *   (Jackson 2 `ObjectNode`, matching
 *   [com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource])
 *   plus the token usage breakdown.
 *
 * Exceptions thrown by the implementation are mapped to a domain
 * `GenerationError` by callers via `LlmErrorMapper`; this port does NOT
 * mask PII itself.
 */
interface OpenAiApiPort {
    // Long parameter list intentional — each field is a named, type-safe slice of
    // the OpenAI chat.completions.create request that test fakes record individually.
    @Suppress("LongParameterList")
    fun callJsonSchema(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        schemaName: String,
        schema: ObjectNode,
    ): OpenAiToolResult
}

data class OpenAiToolResult(
    val parsed: ObjectNode,
    val usage: TokenUsage,
)
