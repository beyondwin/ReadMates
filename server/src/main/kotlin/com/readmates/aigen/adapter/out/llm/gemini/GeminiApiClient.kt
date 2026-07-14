package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.google.genai.Client
import com.google.genai.types.Content
import com.google.genai.types.GenerateContentConfig
import com.google.genai.types.HttpOptions
import com.google.genai.types.Part
import com.google.genai.types.Schema
import com.readmates.aigen.adapter.out.llm.common.StructuredOutputJson
import com.readmates.aigen.application.model.TokenUsage
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicBoolean

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
 *  - `maxOutputTokens` is supplied by the caller (4,096 legacy; 16,384 grounded).
 *
 * Retention contract (spec §5.7 — "retention 최소 옵션을 강제한다"):
 *  - The PRIMARY retention mechanism for the public Gemini Developer
 *    API is the **Google AI Studio project tier**, not a request flag.
 *    A project with Gemini API billing enabled (paid tier) is
 *    contractually guaranteed not to use prompts/responses for product
 *    improvement; a free-tier project does NOT carry that guarantee
 *    and Google may use the traffic for training.
 *  - Operator requirement: `READMATES_AIGEN_GEMINI_API_KEY` MUST be
 *    provisioned in a paid-tier Google AI Studio project. This is
 *    enforced at the operator/runbook layer (see
 *    `docs/operations/runbooks/ai-session-generation.md` §9 "Gemini
 *    retention policy") because there is no programmatic way for the
 *    SDK to assert the tier of the project behind a given API key.
 *  - `com.google.genai:google-genai:1.53.0` exposes NO request-level
 *    `disablePromptLogging` / `dataPolicy` flag on
 *    [GenerateContentConfig.Builder] (verified by jar inspection +
 *    context7 docs at implementation time). We send the HTTP header
 *    `x-goog-data-policy: no-retention` on every outbound request via
 *    `Client.builder().httpOptions(...)` as a **best-effort,
 *    belt-and-suspenders** signal — it costs nothing to send, and if a
 *    future server-side change ever honours it on the public Gemini
 *    Developer API we benefit immediately. It is NOT a documented
 *    public-API contract and MAY be silently dropped today; the
 *    paid-tier project provisioning above is the actual enforcement.
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
    private val retentionNoticeLogged = AtomicBoolean(false)

    @Suppress("LongParameterList")
    override fun callResponseSchema(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        responseSchema: ObjectNode,
        maxOutputTokens: Int,
    ): GeminiToolResult {
        val apiKey = System.getenv(API_KEY_ENV)
        check(!apiKey.isNullOrBlank()) {
            "$API_KEY_ENV not set; required when readmates.aigen.enabled=true and mock=false"
        }

        if (retentionNoticeLogged.compareAndSet(false, true)) {
            logger.info(RETENTION_POLICY_LOG_MESSAGE)
        }

        val httpOptions =
            HttpOptions
                .builder()
                // spec §5.7: data retention minimisation. The PRIMARY mechanism
                // is the paid-tier Google AI Studio project the API key is
                // provisioned in (see KDoc + runbook). The `x-goog-data-policy:
                // no-retention` header below is a best-effort, belt-and-
                // suspenders signal — it is NOT a documented public Gemini API
                // contract and MAY be silently dropped today, so it does NOT
                // replace the tier requirement.
                .headers(mapOf(DATA_POLICY_HEADER to DATA_POLICY_NO_RETENTION))
                .build()

        return Client
            .builder()
            .apiKey(apiKey)
            .httpOptions(httpOptions)
            .build()
            .use { client ->
                val config = buildConfig(systemPrompt, responseSchema, maxOutputTokens)
                val contents = buildContents(userText, transcriptText)
                val response = client.models.generateContent(model, contents, config)
                parseResponse(response, model)
            }
    }

    private fun buildConfig(
        systemPrompt: String,
        responseSchema: ObjectNode,
        maxOutputTokens: Int,
    ): GenerateContentConfig =
        GenerateContentConfig
            .builder()
            .systemInstruction(Content.fromParts(Part.fromText(systemPrompt)))
            .responseMimeType("application/json")
            .responseSchema(Schema.fromJson(responseSchema.toString()))
            .maxOutputTokens(maxOutputTokens)
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
        val parsed = StructuredOutputJson.parseObject(text, objectMapper)

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
        private const val USER_ROLE: String = "user"
        private const val DATA_POLICY_HEADER: String = "x-goog-data-policy"
        private const val DATA_POLICY_NO_RETENTION: String = "no-retention"
        private const val RETENTION_POLICY_LOG_MESSAGE: String =
            "GeminiApiClient: retention policy depends on Google AI Studio project tier — " +
                "confirm paid-tier provisioning; see " +
                "docs/operations/runbooks/ai-session-generation.md"
        private val logger = LoggerFactory.getLogger(GeminiApiClient::class.java)
    }
}
