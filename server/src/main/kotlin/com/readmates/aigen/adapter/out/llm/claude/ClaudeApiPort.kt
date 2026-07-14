package com.readmates.aigen.adapter.out.llm.claude

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.StructuredGenerationRequest

/**
 * Outbound port abstracting the Anthropic Java SDK call for a single
 * `messages.create` request that forces the model to emit a specific
 * tool call. Introduced so [ClaudeContentGenerator] and
 * [ClaudeContentRegenerator] can be unit-tested with an in-memory fake
 * without depending on the live SDK or a real API key.
 *
 * Implementation contract:
 * - `systemPrompt` is sent as the request's `system` field.
 * - `userText` is the first user content block (no cache_control).
 * - `transcriptText` is the second user content block; when
 *   `expectCacheControl` is true, the block carries
 *   `cache_control: { type: "ephemeral" }` to enable Anthropic prompt
 *   caching for the long transcript.
 * - `toolName` + `toolSchema` define a single registered tool with
 *   `input_schema = toolSchema` and `tool_choice = { type: "tool", name: toolName }`,
 *   forcing the model to invoke exactly that tool with `strict = true` schema validation.
 * - `maxOutputTokens` is always explicit: legacy callers pass 4,096 and grounded callers pass 16,384.
 * - The returned [ClaudeToolResult] carries the parsed tool input
 *   (Jackson 2 `ObjectNode`, matching [com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource])
 *   and the token usage breakdown.
 *
 * Exceptions thrown by the implementation are mapped to a domain
 * `GenerationError` by callers via `LlmErrorMapper`; this port does NOT
 * mask PII itself.
 */
interface ClaudeApiPort {
    fun callStructuredTool(
        request: StructuredGenerationRequest,
        toolName: String,
    ): ClaudeToolResult =
        callTool(
            model = request.model,
            systemPrompt = request.systemText,
            userText = "",
            transcriptText = request.userText,
            toolName = toolName,
            toolSchema = ObjectMapper().readTree(request.schemaJson) as ObjectNode,
            expectCacheControl = true,
            maxOutputTokens = request.maxOutputTokens,
        )

    // Long parameter list intentional — each field is a named, type-safe slice of
    // the Anthropic messages.create request that test fakes record individually.
    // Wrapping them in a struct would add ceremony without improving readability
    // since every parameter is exactly used once at the call site.
    @Suppress("LongParameterList")
    fun callTool(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        toolName: String,
        toolSchema: ObjectNode,
        expectCacheControl: Boolean,
        maxOutputTokens: Int,
    ): ClaudeToolResult
}

data class ClaudeToolResult(
    val input: ObjectNode,
    val usage: TokenUsage,
)
