package com.readmates.aigen.adapter.out.llm.claude

import com.fasterxml.jackson.databind.JsonNode
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
 * Claude provider implementation of [SessionContentGenerator].
 *
 * Builds the deterministic system prompt via [LlmPromptBuilder], forces
 * the model to invoke the `emit_session_import_v1` tool with the full
 * `readmates-session-import:v1` JSON Schema as `input_schema`, and
 * parses the resulting tool_use input back into a
 * [SessionImportV1Snapshot]. Caller is responsible for downstream
 * validation (author-name match, highlights count, etc.).
 *
 * All provider exceptions are wrapped via [LlmErrorMapper] +
 * [LlmGenerationException] so the surfaced message never echoes
 * transcript text (PII protection).
 *
 * Gated behind `readmates.aigen.enabled=true` so test contexts that
 * leave aigen disabled do not require this bean — or an API key — to load.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@ConditionalOnProperty(
    prefix = "readmates.aigen",
    name = ["mock"],
    havingValue = "false",
    matchIfMissing = true,
)
class ClaudeContentGenerator(
    private val claudeApi: ClaudeApiPort,
    private val schemaResource: SessionImportSchemaResource,
) : SessionContentGenerator {
    override val provider: Provider = Provider.CLAUDE

    override fun generateFull(input: GenerationInput): GenerationOutput {
        val systemPrompt = LlmPromptBuilder.buildFullSystemPrompt(input.sessionMeta, input.instructions)
        val result =
            try {
                claudeApi.callTool(
                    model = input.model.name,
                    systemPrompt = systemPrompt,
                    userText = USER_PRELUDE,
                    transcriptText = input.transcript,
                    toolName = TOOL_NAME,
                    toolSchema = schemaResource.schema(),
                    expectCacheControl = true,
                )
                // Catching Throwable intentionally — any provider-side failure must be
                // funnelled through LlmErrorMapper so the surfaced message never echoes
                // a transcript snippet from Throwable.message (PII protection).
            } catch (
                @Suppress("TooGenericExceptionCaught") t: Throwable,
            ) {
                val mapped = LlmErrorMapper.mapException(t, Provider.CLAUDE)
                throw LlmGenerationException(mapped, t)
            }

        val snapshot = parseSnapshot(result.input)
        return GenerationOutput(snapshot, result.usage)
    }

    private fun parseSnapshot(node: com.fasterxml.jackson.databind.node.ObjectNode): SessionImportV1Snapshot =
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
        const val TOOL_NAME: String = "emit_session_import_v1"
        const val USER_PRELUDE: String =
            "다음 녹취록을 바탕으로 readmates-session-import:v1 JSON 을 emit_session_import_v1 tool 호출로 생성해주세요."
    }
}
