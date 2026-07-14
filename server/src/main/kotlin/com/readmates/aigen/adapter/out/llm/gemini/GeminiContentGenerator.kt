package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.adapter.out.llm.common.LlmErrorMapper
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.llm.common.LlmPromptBuilder
import com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource
import com.readmates.aigen.application.model.GenerationInput
import com.readmates.aigen.application.model.GenerationOutput
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.port.out.SessionContentGenerator
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.time.LocalDate

/**
 * Gemini provider implementation of [SessionContentGenerator].
 *
 * Builds the deterministic system prompt via [LlmPromptBuilder]
 * (identical to the Claude / OpenAI adapters so generation results do
 * not vary because of accidental prompt drift), converts the full
 * `readmates-session-import:v1` JSON Schema to Gemini's OpenAPI 3.0
 * subset via [GeminiSchemaCompatAdapter], and passes it to Gemini via
 * `generationConfig.responseSchema` so the model can only return that
 * shape. Data retention (spec §5.7) is enforced operator-side by
 * provisioning `READMATES_AIGEN_GEMINI_API_KEY` in a paid-tier Google
 * AI Studio project; see [GeminiApiClient] KDoc and
 * `docs/operations/runbooks/ai-session-generation.md` §9. Caller is
 * responsible for downstream validation (author-name match, highlights
 * count, etc.).
 *
 * All provider exceptions are wrapped via [LlmErrorMapper] +
 * [LlmGenerationException] so the surfaced message never echoes
 * transcript text (PII protection).
 *
 * Gated behind `readmates.aigen.enabled=true` AND
 * `readmates.aigen.mock != true` so the `aigen-mock` profile can swap
 * in a stub generator.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@ConditionalOnProperty(
    prefix = "readmates.aigen",
    name = ["mock"],
    havingValue = "false",
    matchIfMissing = true,
)
class GeminiContentGenerator(
    private val geminiApi: GeminiApiPort,
    private val schemaResource: SessionImportSchemaResource,
    private val schemaAdapter: GeminiSchemaCompatAdapter,
) : SessionContentGenerator {
    override val provider: Provider = Provider.GEMINI

    override fun generateFull(input: GenerationInput): GenerationOutput {
        val systemPrompt = LlmPromptBuilder.buildFullSystemPrompt(input.sessionMeta, input.instructions)
        val geminiSchema = schemaAdapter.convert(schemaResource.schema())
        val result =
            try {
                geminiApi.callResponseSchema(
                    model = input.model.name,
                    systemPrompt = systemPrompt,
                    userText = USER_PRELUDE,
                    transcriptText = input.transcript,
                    responseSchema = geminiSchema,
                    maxOutputTokens = 4096,
                )
                // Catching Throwable intentionally — any provider-side failure must be
                // funnelled through LlmErrorMapper so the surfaced message never echoes
                // a transcript snippet from Throwable.message (PII protection).
            } catch (
                @Suppress("TooGenericExceptionCaught") t: Throwable,
            ) {
                val mapped = LlmErrorMapper.mapException(t, Provider.GEMINI)
                throw LlmGenerationException(mapped, t)
            }

        val snapshot = parseSnapshot(result.parsed)
        return GenerationOutput(snapshot, result.usage)
    }

    private fun parseSnapshot(node: ObjectNode): SessionImportV1Snapshot =
        SessionImportV1Snapshot(
            format = node.path("format").asText(),
            sessionNumber = node.path("sessionNumber").asInt(),
            bookTitle = node.path("bookTitle").asText(),
            meetingDate = LocalDate.parse(node.path("meetingDate").asText()),
            summary = node.path("summary").asText(),
            highlights = parseAuthoredList(node.path("highlights")),
            oneLineReviews = parseAuthoredList(node.path("oneLineReviews")),
            feedbackDocumentFileName = node.path("feedbackDocumentFileName").asText(),
            feedbackDocumentMarkdown = node.path("feedbackDocumentMarkdown").asText(),
        )

    private fun parseAuthoredList(node: JsonNode): List<SessionImportV1Snapshot.AuthoredText> {
        if (!node.isArray) return emptyList()
        return node.map {
            SessionImportV1Snapshot.AuthoredText(
                authorName = it.path("authorName").asText(),
                text = it.path("text").asText(),
            )
        }
    }

    companion object {
        /**
         * User prelude — identical to
         * [com.readmates.aigen.adapter.out.llm.claude.ClaudeContentGenerator.USER_PRELUDE]
         * and [com.readmates.aigen.adapter.out.llm.openai.OpenAiContentGenerator.USER_PRELUDE]
         * so Gemini, OpenAI and Claude receive the same prompt body. The literal
         * `emit_session_import_v1` tool name is preserved verbatim because the
         * prompt is part of the cross-provider contract; Gemini honours the JSON
         * Schema through `responseSchema`, not through tool calling, so the
         * embedded tool-call reference is purely directive.
         */
        const val USER_PRELUDE: String =
            "다음 녹취록을 바탕으로 readmates-session-import:v1 JSON 을 emit_session_import_v1 tool 호출로 생성해주세요."
    }
}
