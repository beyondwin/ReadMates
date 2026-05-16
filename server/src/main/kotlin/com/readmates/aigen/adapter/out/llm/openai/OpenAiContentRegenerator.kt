package com.readmates.aigen.adapter.out.llm.openai

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.adapter.out.llm.common.LlmErrorMapper
import com.readmates.aigen.adapter.out.llm.common.LlmGenerationException
import com.readmates.aigen.adapter.out.llm.common.LlmPromptBuilder
import com.readmates.aigen.adapter.out.llm.common.SessionImportSchemaResource
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.RegenerationInput
import com.readmates.aigen.application.model.RegenerationOutput
import com.readmates.aigen.application.model.SessionImportV1Snapshot
import com.readmates.aigen.application.port.out.SessionContentRegenerator
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/**
 * OpenAI provider implementation of [SessionContentRegenerator].
 *
 * Narrows the `readmates-session-import:v1` schema down to just the
 * field(s) corresponding to the requested [GenerationItem] and passes
 * the narrowed schema to OpenAI via
 * `response_format = { type: "json_schema", json_schema: { name,
 * schema, strict: true } }` so the model can only return that subset
 * (spec design doc §9.2). The port implementation is responsible for
 * setting `store: false` (no data retention).
 *
 * Parses the resulting JSON object into the appropriate typed value:
 *
 * - SUMMARY               -> [String]
 * - HIGHLIGHTS            -> List<[SessionImportV1Snapshot.AuthoredText]>
 * - ONE_LINE_REVIEWS      -> List<[SessionImportV1Snapshot.AuthoredText]>
 * - FEEDBACK_DOCUMENT     -> [FeedbackDocumentValue]
 *
 * The narrowed schema is derived from the full schema's `properties`
 * sub-tree so it stays in sync if the schema evolves.
 *
 * Gated behind `readmates.aigen.enabled=true` AND
 * `readmates.aigen.mock != true`.
 */
@Component
@ConditionalOnProperty(prefix = "readmates", name = ["aigen.enabled"], havingValue = "true")
@ConditionalOnProperty(
    prefix = "readmates.aigen",
    name = ["mock"],
    havingValue = "false",
    matchIfMissing = true,
)
class OpenAiContentRegenerator(
    private val openAiApi: OpenAiApiPort,
    private val schemaResource: SessionImportSchemaResource,
) : SessionContentRegenerator {
    override val provider: Provider = Provider.OPENAI

    private val mapper = ObjectMapper()

    override fun regenerateItem(input: RegenerationInput): RegenerationOutput {
        val systemPrompt =
            LlmPromptBuilder.buildRegenSystemPrompt(
                meta = input.sessionMeta,
                item = input.item,
                instructions = input.instructions,
                currentSnapshot = input.currentResult,
            )
        val narrowed = narrowSchema(schemaResource.schema(), input.item)
        val userText = buildUserText(input)
        val schemaName = schemaNameFor(input.item)

        val result =
            try {
                openAiApi.callJsonSchema(
                    model = input.model.name,
                    systemPrompt = systemPrompt,
                    userText = userText,
                    transcriptText = input.transcript,
                    schemaName = schemaName,
                    schema = narrowed,
                )
                // Catching Throwable intentionally — any provider-side failure must be
                // funnelled through LlmErrorMapper so the surfaced message never echoes
                // a transcript snippet from Throwable.message (PII protection).
            } catch (
                @Suppress("TooGenericExceptionCaught") t: Throwable,
            ) {
                val mapped = LlmErrorMapper.mapException(t, Provider.OPENAI)
                throw LlmGenerationException(mapped, t)
            }

        val patchedValue = parseValue(result.parsed, input.item)
        return RegenerationOutput(
            patchedItem = input.item,
            patchedValue = patchedValue,
            usage = result.usage,
        )
    }

    private fun buildUserText(input: RegenerationInput): String {
        val current = currentResultJson(input.currentResult)
        return "현재 결과 (참고용 JSON, 변경 금지):\n" +
            mapper.writeValueAsString(current) +
            "\n\n위 결과에서 " + itemLabel(input.item) +
            " 항목만 다시 생성해 emit_session_import_v1_partial tool 로 출력해주세요."
    }

    private fun currentResultJson(snapshot: SessionImportV1Snapshot): ObjectNode {
        val node = mapper.createObjectNode()
        node.put("summary", snapshot.summary)
        node.set<ObjectNode>("highlights", authoredArray(snapshot.highlights))
        node.set<ObjectNode>("oneLineReviews", authoredArray(snapshot.oneLineReviews))
        node.put("feedbackDocumentFileName", snapshot.feedbackDocumentFileName)
        node.put("feedbackDocumentMarkdown", snapshot.feedbackDocumentMarkdown)
        return node
    }

    private fun authoredArray(items: List<SessionImportV1Snapshot.AuthoredText>): com.fasterxml.jackson.databind.node.ArrayNode {
        val arr = mapper.createArrayNode()
        items.forEach { item ->
            val obj = arr.addObject()
            obj.put("authorName", item.authorName)
            obj.put("text", item.text)
        }
        return arr
    }

    private fun itemLabel(item: GenerationItem): String =
        when (item) {
            GenerationItem.SUMMARY -> "summary"
            GenerationItem.HIGHLIGHTS -> "highlights"
            GenerationItem.ONE_LINE_REVIEWS -> "oneLineReviews"
            GenerationItem.FEEDBACK_DOCUMENT -> "feedbackDocumentFileName + feedbackDocumentMarkdown"
        }

    private fun schemaNameFor(item: GenerationItem): String =
        when (item) {
            GenerationItem.SUMMARY -> "session_import_v1_summary"
            GenerationItem.HIGHLIGHTS -> "session_import_v1_highlights"
            GenerationItem.ONE_LINE_REVIEWS -> "session_import_v1_oneLineReviews"
            GenerationItem.FEEDBACK_DOCUMENT -> "session_import_v1_feedbackDocument"
        }

    private fun parseValue(
        node: ObjectNode,
        item: GenerationItem,
    ): Any =
        when (item) {
            GenerationItem.SUMMARY -> node.path("summary").asText()
            GenerationItem.HIGHLIGHTS -> parseAuthoredList(node.path("highlights"))
            GenerationItem.ONE_LINE_REVIEWS -> parseAuthoredList(node.path("oneLineReviews"))
            GenerationItem.FEEDBACK_DOCUMENT ->
                FeedbackDocumentValue(
                    fileName = node.path("feedbackDocumentFileName").asText(),
                    markdown = node.path("feedbackDocumentMarkdown").asText(),
                )
        }

    private fun parseAuthoredList(node: JsonNode): List<SessionImportV1Snapshot.AuthoredText> {
        if (!node.isArray) return emptyList()
        return node.map {
            SessionImportV1Snapshot.AuthoredText(
                authorName = it.path("authorName").asText(),
                text = it.path("text").asText(),
            )
        }
    }

    /**
     * Builds a strict object sub-schema from the full session-import schema
     * containing only the properties relevant to [item]. Keeps the
     * sub-schema in sync with the source-of-truth schema resource: if the
     * inner shape of `highlights[*]` ever changes, the narrowed schema
     * inherits the change automatically.
     */
    private fun narrowSchema(
        full: ObjectNode,
        item: GenerationItem,
    ): ObjectNode {
        val keys: List<String> =
            when (item) {
                GenerationItem.SUMMARY -> listOf("summary")
                GenerationItem.HIGHLIGHTS -> listOf("highlights")
                GenerationItem.ONE_LINE_REVIEWS -> listOf("oneLineReviews")
                GenerationItem.FEEDBACK_DOCUMENT ->
                    listOf(
                        "feedbackDocumentFileName",
                        "feedbackDocumentMarkdown",
                    )
            }
        val sourceProps = full.path("properties") as ObjectNode

        val narrowed = mapper.createObjectNode()
        narrowed.put("type", "object")
        narrowed.put("additionalProperties", false)
        val required = narrowed.putArray("required")
        keys.forEach { required.add(it) }
        val props = narrowed.putObject("properties")
        keys.forEach { k ->
            val sub =
                sourceProps.get(k)
                    ?: error("Schema is missing required property '$k' for item $item")
            props.set<JsonNode>(k, sub.deepCopy())
        }
        return narrowed
    }

    /** Carrier for FEEDBACK_DOCUMENT regeneration since two fields are returned together. */
    data class FeedbackDocumentValue(
        val fileName: String,
        val markdown: String,
    )
}
