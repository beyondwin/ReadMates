package com.readmates.aigen.adapter.out.llm.openai

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.application.model.TokenUsage

/**
 * In-memory OpenAiApiPort used by unit tests. Records the most recent
 * call's arguments so tests can assert on them, and either returns a
 * canned [OpenAiToolResult] or throws a configured exception.
 */
class FakeOpenAiApi(
    private val result: OpenAiToolResult =
        OpenAiToolResult(
            parsed = ObjectMapper().createObjectNode(),
            usage =
                TokenUsage(
                    nonCachedInputTokens = 0,
                    cacheWriteInputTokens = 0,
                    cacheReadInputTokens = 0,
                    outputTokens = 0,
                ),
        ),
    private val throwException: Throwable? = null,
) : OpenAiApiPort {
    var lastModel: String? = null
        private set
    var lastSystemPrompt: String? = null
        private set
    var lastUserText: String? = null
        private set
    var lastTranscriptText: String? = null
        private set
    var lastSchemaName: String? = null
        private set
    var lastSchema: ObjectNode? = null
        private set
    var lastMaxOutputTokens: Int? = null
        private set

    override fun callJsonSchema(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        schemaName: String,
        schema: ObjectNode,
        maxOutputTokens: Int,
    ): OpenAiToolResult {
        lastModel = model
        lastSystemPrompt = systemPrompt
        lastUserText = userText
        lastTranscriptText = transcriptText
        lastSchemaName = schemaName
        lastSchema = schema.deepCopy()
        lastMaxOutputTokens = maxOutputTokens
        throwException?.let { throw it }
        return result
    }
}
