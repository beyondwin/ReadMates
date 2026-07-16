package com.readmates.aigen.adapter.out.llm.claude

import com.anthropic.client.AnthropicClient
import com.anthropic.client.okhttp.AnthropicOkHttpClient
import com.anthropic.core.JsonValue
import com.anthropic.models.messages.CacheControlEphemeral
import com.anthropic.models.messages.ContentBlockParam
import com.anthropic.models.messages.MessageCreateParams
import com.anthropic.models.messages.TextBlockParam
import com.anthropic.models.messages.Tool
import com.anthropic.models.messages.ToolChoiceTool
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.adapter.out.llm.common.StructuredOutputJson
import com.readmates.aigen.application.model.TokenUsage
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.time.Duration

/**
 * Live [ClaudeApiPort] adapter backed by `com.anthropic:anthropic-java`.
 *
 * Resolves the API key from `READMATES_AIGEN_ANTHROPIC_API_KEY` at the
 * first call site so the bean still loads in test contexts where the
 * env var is unset.
 *
 * Wire shape (per spec §5 and ClaudeApiPort KDoc):
 *  - `system` carries the prompt verbatim.
 *  - User message has two text blocks: `userText` first (no
 *    cache_control), `transcriptText` second (with
 *    `cache_control: { type: "ephemeral" }` when `expectCacheControl`).
 *  - One `Tool` with `name=toolName` and our `ObjectNode` schema mapped
 *    to `Tool.InputSchema` (`type` lifted to the typed field, the rest
 *    of the schema's top-level properties piped through
 *    `putAdditionalProperty` so the on-wire JSON exactly mirrors the
 *    incoming schema).
 *  - `tool_choice = { type: "tool", name: toolName }` forces a single
 *    `tool_use` block and `strict = true` constrains its input to the schema.
 *
 * Provider exceptions are NOT caught here — callers
 * ([ClaudeContentGenerator] / [ClaudeContentRegenerator]) wrap them via
 * `LlmErrorMapper.mapException(t, Provider.CLAUDE)` so the surfaced
 * message never echoes transcript text (PII protection).
 *
 * Gated behind `readmates.aigen.enabled=true` to match the rest of the
 * adapter beans; ensures the integration test context
 * (`application-test.yml`, `aigen.enabled=false`) does not require the
 * API key to bootstrap the Spring application context.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
open class ClaudeApiClient : ClaudeApiPort {
    private val objectMapper = ObjectMapper()

    @Suppress("LongParameterList")
    override fun callTool(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        toolName: String,
        toolSchema: ObjectNode,
        expectCacheControl: Boolean,
        maxOutputTokens: Int,
    ): ClaudeToolResult {
        val apiKey = System.getenv(API_KEY_ENV)
        check(!apiKey.isNullOrBlank()) {
            "$API_KEY_ENV not set; required when readmates.aigen.enabled=true"
        }

        val client: AnthropicClient =
            AnthropicOkHttpClient
                .builder()
                .apiKey(apiKey)
                .timeout(PROVIDER_TIMEOUT)
                .maxRetries(SDK_MAX_RETRIES)
                .build()

        val tool = buildTool(toolName, toolSchema)
        val userBlocks = buildUserBlocks(userText, transcriptText, expectCacheControl)

        val params =
            MessageCreateParams
                .builder()
                .model(model)
                .maxTokens(maxOutputTokens.toLong())
                .system(systemPrompt)
                .addUserMessageOfBlockParams(userBlocks)
                .addTool(tool)
                .toolChoice(
                    ToolChoiceTool
                        .builder()
                        .name(toolName)
                        .build(),
                ).build()

        val message = client.messages().create(params)

        val toolUse =
            message
                .content()
                .firstNotNullOfOrNull { block -> block.toolUse().orElse(null) }
                ?: error("Claude response did not contain a tool_use block; tool=$toolName")

        val inputNode = objectMapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(toolUse._input())
        val inputObject = StructuredOutputJson.requireObject(inputNode)

        val usage = message.usage()
        // Anthropic reports non-cached, cache-creation, and cache-read input
        // separately, so preserve those billing channels without aggregation.
        val cacheCreation = usage.cacheCreationInputTokens().orElse(0L)
        val cacheRead = usage.cacheReadInputTokens().orElse(0L)
        val tokenUsage =
            TokenUsage(
                nonCachedInputTokens = usage.inputTokens(),
                cacheWriteInputTokens = cacheCreation,
                cacheReadInputTokens = cacheRead,
                outputTokens = usage.outputTokens(),
            )

        return ClaudeToolResult(input = inputObject, usage = tokenUsage)
    }

    internal fun buildTool(
        toolName: String,
        toolSchema: ObjectNode,
    ): Tool {
        val inputSchemaBuilder = Tool.InputSchema.builder()
        val typeNode = toolSchema.get("type")
        if (typeNode != null) {
            inputSchemaBuilder.type(JsonValue.fromJsonNode(typeNode))
        }
        for ((key, value) in toolSchema.properties()) {
            if (key == "type") continue
            inputSchemaBuilder.putAdditionalProperty(key, JsonValue.fromJsonNode(value))
        }

        return Tool
            .builder()
            .name(toolName)
            .inputSchema(inputSchemaBuilder.build())
            .strict(true)
            .build()
    }

    private fun buildUserBlocks(
        userText: String,
        transcriptText: String,
        expectCacheControl: Boolean,
    ): List<ContentBlockParam> {
        val userBlock =
            TextBlockParam
                .builder()
                .text(userText)
                .build()
        val transcriptBuilder =
            TextBlockParam
                .builder()
                .text(transcriptText)
        if (expectCacheControl) {
            transcriptBuilder.cacheControl(CacheControlEphemeral.builder().build())
        }
        return listOf(
            ContentBlockParam.ofText(userBlock),
            ContentBlockParam.ofText(transcriptBuilder.build()),
        )
    }

    companion object {
        const val API_KEY_ENV: String = "READMATES_AIGEN_ANTHROPIC_API_KEY"
        internal const val SDK_MAX_RETRIES: Int = 0
        private val PROVIDER_TIMEOUT: Duration = Duration.ofMinutes(4)
    }
}
