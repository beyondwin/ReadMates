package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.google.genai.Client
import com.google.genai.types.Content
import com.google.genai.types.GenerateContentConfig
import com.google.genai.types.HttpOptions
import com.google.genai.types.Part
import com.google.genai.types.Schema
import com.readmates.aigen.application.model.TokenUsage
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * Live [GeminiApiPort] adapter backed by `com.google.genai:google-genai:1.53.0`.
 *
 * Resolves the API key from `READMATES_AIGEN_GEMINI_API_KEY` at the
 * first call site so the bean still loads in test contexts where the
 * env var is unset.
 *
 * Wire shape (per spec §5 and [GeminiApiPort] KDoc):
 *  - `systemInstruction` carries the prompt verbatim as a single
 *    `Content.fromParts(Part.fromText(systemPrompt))`.
 *  - Two separate user `Content` entries (role `user`): `userText`
 *    first (prelude), then `transcriptText` second. Sent as a
 *    `List<Content>` to the unary
 *    `client.models.generateContent(model, contents, config)` form
 *    that the 1.53.0 SDK exposes.
 *  - `responseMimeType = "application/json"` and the incoming
 *    [ObjectNode] piped through `Schema.fromJson(...)` for
 *    `responseSchema` (Gemini's OpenAPI 3.0 subset — the schema is
 *    pre-adapted upstream by `GeminiSchemaCompatAdapter`).
 *  - `maxOutputTokens = 4096`, matching the Claude/OpenAI ceiling.
 *
 * Retention contract (spec §5.7 — "retention 최소 옵션을 강제한다"):
 *  - `com.google.genai:google-genai:1.53.0` exposes NO request-level
 *    `disablePromptLogging` / `dataPolicy` flag on
 *    [GenerateContentConfig.Builder] (verified by jar inspection +
 *    context7 docs at implementation time). The only API-level lever
 *    available in this SDK release is the HTTP header
 *    `x-goog-data-policy: no-retention`, which we set via
 *    `Client.builder().httpOptions(...)` at the client level so every
 *    outbound request carries it. If a later SDK release exposes a
 *    typed flag, this should switch to use it.
 *
 * Provider exceptions are NOT caught here — callers
 * ([GeminiContentGenerator] / [GeminiContentRegenerator]) wrap them
 * via `LlmErrorMapper.mapException(t, Provider.GEMINI)` so the
 * surfaced message never echoes transcript text (PII protection).
 *
 * Gated behind `readmates.aigen.enabled=true` AND
 * `readmates.aigen.mock != true` so the `aigen-mock` profile can swap
 * in a stub.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@ConditionalOnProperty(
    prefix = "readmates.aigen",
    name = ["mock"],
    havingValue = "false",
    matchIfMissing = true,
)
open class GeminiApiClient : GeminiApiPort {
    private val objectMapper = ObjectMapper()

    @Suppress("LongParameterList")
    override fun callResponseSchema(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        responseSchema: ObjectNode,
    ): GeminiToolResult {
        val apiKey = System.getenv(API_KEY_ENV)
        check(!apiKey.isNullOrBlank()) {
            "$API_KEY_ENV not set; required when readmates.aigen.enabled=true and mock=false"
        }

        val httpOptions =
            HttpOptions
                .builder()
                // spec §5.7: data retention minimisation. No SDK-level flag is
                // available in google-genai 1.53.0; the `x-goog-data-policy`
                // header is the API-level lever and applies to every request
                // issued by this client.
                .headers(mapOf(DATA_POLICY_HEADER to DATA_POLICY_NO_RETENTION))
                .build()

        return Client
            .builder()
            .apiKey(apiKey)
            .httpOptions(httpOptions)
            .build()
            .use { client ->
                val config = buildConfig(systemPrompt, responseSchema)
                val contents = buildContents(userText, transcriptText)
                val response = client.models.generateContent(model, contents, config)
                parseResponse(response, model)
            }
    }

    private fun buildConfig(
        systemPrompt: String,
        responseSchema: ObjectNode,
    ): GenerateContentConfig =
        GenerateContentConfig
            .builder()
            .systemInstruction(Content.fromParts(Part.fromText(systemPrompt)))
            .responseMimeType("application/json")
            .responseSchema(Schema.fromJson(responseSchema.toString()))
            // Follow-up: move maxOutputTokens to AiGenerationProperties when a
            // per-call budget knob is introduced. 4096 mirrors the Claude/OpenAI
            // ceiling for the structured JSON payload.
            .maxOutputTokens(DEFAULT_MAX_OUTPUT_TOKENS)
            .build()

    private fun buildContents(
        userText: String,
        transcriptText: String,
    ): List<Content> =
        listOf(
            Content
                .builder()
                .role(USER_ROLE)
                .parts(listOf(Part.fromText(userText)))
                .build(),
            Content
                .builder()
                .role(USER_ROLE)
                .parts(listOf(Part.fromText(transcriptText)))
                .build(),
        )

    private fun parseResponse(
        response: com.google.genai.types.GenerateContentResponse,
        model: String,
    ): GeminiToolResult {
        val text = response.text()
        check(!text.isNullOrBlank()) {
            "Gemini response had no text; model=$model"
        }
        val parsed =
            (objectMapper.readTree(text) as? ObjectNode)
                ?: error("Gemini response content was not a JSON object; model=$model")

        val usage =
            response.usageMetadata().orElseThrow {
                IllegalStateException("Gemini response missing usageMetadata; model=$model")
            }
        // Gemini billing model: `promptTokenCount` is the total input
        // token count for the call. `cachedContentTokenCount` is the
        // subset served from explicit `cachedContent` (treated here as
        // the cached portion already included in promptTokenCount, to
        // mirror Claude/OpenAI accounting where domain inputTokens is
        // the gross input billable count). `candidatesTokenCount` is
        // the output count.
        val tokenUsage =
            TokenUsage(
                inputTokens = usage.promptTokenCount().orElse(0).toLong(),
                cachedInputTokens = usage.cachedContentTokenCount().orElse(0).toLong(),
                outputTokens = usage.candidatesTokenCount().orElse(0).toLong(),
            )

        return GeminiToolResult(parsed = parsed, usage = tokenUsage)
    }

    companion object {
        const val API_KEY_ENV: String = "READMATES_AIGEN_GEMINI_API_KEY"
        private const val DEFAULT_MAX_OUTPUT_TOKENS: Int = 4096
        private const val USER_ROLE: String = "user"
        private const val DATA_POLICY_HEADER: String = "x-goog-data-policy"
        private const val DATA_POLICY_NO_RETENTION: String = "no-retention"
    }
}
