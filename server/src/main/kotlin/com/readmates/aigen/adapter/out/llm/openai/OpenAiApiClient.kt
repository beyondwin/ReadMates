package com.readmates.aigen.adapter.out.llm.openai

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.openai.client.OpenAIClient
import com.openai.client.okhttp.OpenAIOkHttpClient
import com.openai.core.JsonValue
import com.openai.models.ResponseFormatJsonSchema
import com.openai.models.chat.completions.ChatCompletionCreateParams
import com.readmates.aigen.adapter.out.llm.common.StructuredOutputJson
import com.readmates.aigen.application.model.TokenUsage
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.time.Duration

/**
 * Live [OpenAiApiPort] adapter backed by `com.openai:openai-java`.
 *
 * Resolves the API key from `READMATES_AIGEN_OPENAI_API_KEY` at the
 * first call site so the bean still loads in test contexts where the
 * env var is unset.
 *
 * Wire shape (per spec §5, §9.1, §9.3 and OpenAiApiPort KDoc):
 *  - `system` carries the prompt verbatim.
 *  - Two separate user messages: `userText` first (prelude), then
 *    `transcriptText` second.
 *  - `response_format = json_schema` with `strict = true` and the
 *    incoming `ObjectNode` piped through as the raw schema body
 *    (top-level entries mapped onto the `Schema` builder's
 *    `additionalProperties`).
 *  - `store = false` so OpenAI does NOT retain prompt/completion data
 *    (spec §9.1, §9.3 — PII protection).
 *
 * Provider exceptions are NOT caught here — callers
 * ([OpenAiContentGenerator] / [OpenAiContentRegenerator]) wrap them via
 * `LlmErrorMapper.mapException(t, Provider.OPENAI)` so the surfaced
 * message never echoes transcript text (PII protection).
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
    private val objectMapper = ObjectMapper()

    @Suppress("LongParameterList")
    override fun callJsonSchema(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        schemaName: String,
        schema: ObjectNode,
        maxOutputTokens: Int,
    ): OpenAiToolResult {
        val apiKey = System.getenv(API_KEY_ENV)
        check(!apiKey.isNullOrBlank()) {
            "$API_KEY_ENV not set; required when readmates.aigen.enabled=true and mock=false"
        }

        val client: OpenAIClient =
            OpenAIOkHttpClient
                .builder()
                .apiKey(apiKey)
                .timeout(PROVIDER_TIMEOUT)
                .maxRetries(SDK_MAX_RETRIES)
                .build()

        val responseFormat = buildResponseFormat(schemaName, schema)

        val params =
            ChatCompletionCreateParams
                .builder()
                .model(model)
                .maxCompletionTokens(maxOutputTokens.toLong())
                // spec §9.1 / §9.3: OpenAI must not retain prompt or
                // completion data — set store=false on every request.
                .store(false)
                .responseFormat(responseFormat)
                .addSystemMessage(systemPrompt)
                .addUserMessage(userText)
                .addUserMessage(transcriptText)
                .build()

        val completion = client.chat().completions().create(params)

        val choice =
            completion.choices().firstOrNull()
                ?: error("OpenAI response had no choices; model=$model schema=$schemaName")
        val content =
            choice
                .message()
                .content()
                .orElseThrow {
                    IllegalStateException(
                        "OpenAI response had no message content; model=$model schema=$schemaName",
                    )
                }

        val parsed = StructuredOutputJson.parseObject(content, objectMapper)

        val usage =
            completion.usage().orElseThrow {
                IllegalStateException(
                    "OpenAI response missing usage; model=$model schema=$schemaName",
                )
            }
        // OpenAI prompt_tokens is gross input and cached_tokens is its cached
        // subset, so subtract the latter for the non-cached billing channel.
        val cachedTokens =
            usage
                .promptTokensDetails()
                .flatMap { it.cachedTokens() }
                .orElse(0L)
        val tokenUsage =
            TokenUsage(
                nonCachedInputTokens = (usage.promptTokens() - cachedTokens).coerceAtLeast(0L),
                cacheWriteInputTokens = 0,
                cacheReadInputTokens = cachedTokens,
                outputTokens = usage.completionTokens(),
            )

        return OpenAiToolResult(parsed = parsed, usage = tokenUsage)
    }

    private fun buildResponseFormat(
        schemaName: String,
        schema: ObjectNode,
    ): ResponseFormatJsonSchema {
        val schemaBuilder = ResponseFormatJsonSchema.JsonSchema.Schema.builder()
        for ((key, value) in schema.properties()) {
            schemaBuilder.putAdditionalProperty(key, JsonValue.fromJsonNode(value))
        }
        val jsonSchema =
            ResponseFormatJsonSchema.JsonSchema
                .builder()
                .name(schemaName)
                .strict(true)
                .schema(schemaBuilder.build())
                .build()
        return ResponseFormatJsonSchema
            .builder()
            .jsonSchema(jsonSchema)
            .build()
    }

    companion object {
        const val API_KEY_ENV: String = "READMATES_AIGEN_OPENAI_API_KEY"
        internal const val SDK_MAX_RETRIES: Int = 0
        private val PROVIDER_TIMEOUT: Duration = Duration.ofMinutes(4)
    }
}
