package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.application.model.TokenUsage

/**
 * Outbound port abstracting the Google GenAI Java SDK call for a single
 * `models.generateContent` request that forces the model to emit a JSON
 * object matching a strict JSON Schema (Gemini's OpenAPI 3.0 subset).
 * Introduced so [GeminiContentGenerator] and [GeminiContentRegenerator]
 * can be unit-tested with an in-memory fake without depending on the
 * live SDK or a real API key.
 *
 * Implementation contract:
 * - `systemPrompt` is sent as the request's `systemInstruction`.
 * - `userText` is the first user message (prelude).
 * - `transcriptText` is appended as a separate user message containing
 *   the raw transcript.
 * - `responseSchema` is supplied as `generationConfig.responseSchema`
 *   AFTER having been converted to Gemini's OpenAPI 3.0 subset via
 *   [GeminiSchemaCompatAdapter]. The request MUST also set
 *   `generationConfig.responseMimeType = "application/json"`.
 *
 * Retention contract (spec §5.7):
 * - The implementation MUST configure the SDK so that prompt/response
 *   data is NOT retained for product improvement. Concretely, the
 *   request MUST be issued with `disablePromptLogging = true` (or the
 *   equivalent flag exposed by the current `com.google.genai` Java SDK
 *   release — for example, the `data_policy.no_retention` request-level
 *   option, or the `x-goog-data-policy: no-retention` header). The
 *   spec requirement is "retention 최소 옵션을 강제한다" — no opt-in,
 *   no per-call override.
 *
 * - The returned [GeminiToolResult] carries the parsed JSON object
 *   (Jackson 2 `ObjectNode`, matching
 *   [com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource])
 *   plus the token usage breakdown.
 *
 * Exceptions thrown by the implementation are mapped to a domain
 * `GenerationError` by callers via `LlmErrorMapper`; this port does NOT
 * mask PII itself.
 */
interface GeminiApiPort {
    // Long parameter list intentional — each field is a named, type-safe slice of
    // the Gemini generateContent request that test fakes record individually.
    @Suppress("LongParameterList")
    fun callResponseSchema(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        responseSchema: ObjectNode,
    ): GeminiToolResult
}

data class GeminiToolResult(
    val parsed: ObjectNode,
    val usage: TokenUsage,
)
