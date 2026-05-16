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
 * - The spec requirement is "retention 최소 옵션을 강제한다" — no
 *   opt-in, no per-call override. For the public Gemini Developer API
 *   this is enforced at the **operator layer**, not via a typed SDK
 *   flag: `READMATES_AIGEN_GEMINI_API_KEY` MUST be provisioned in a
 *   paid-tier Google AI Studio project (Gemini API billing enabled),
 *   which is contractually guaranteed not to use prompts/responses for
 *   product improvement. Free-tier projects are NOT acceptable. See
 *   `docs/operations/runbooks/ai-session-generation.md` §9 "Gemini
 *   retention policy" for the provisioning checklist.
 * - Implementations MAY additionally send the
 *   `x-goog-data-policy: no-retention` HTTP header on every request as
 *   a best-effort, belt-and-suspenders signal. That header is NOT a
 *   documented public Gemini API contract today and the server MAY
 *   silently drop it, so it does NOT replace the paid-tier project
 *   requirement above.
 * - The port returns provider exceptions raw — callers wrap them via
 *   [com.readmates.aigen.adapter.out.llm.common.LlmErrorMapper] so the
 *   surfaced message never echoes transcript text.
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
