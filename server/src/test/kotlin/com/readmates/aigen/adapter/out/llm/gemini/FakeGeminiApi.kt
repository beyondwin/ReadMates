package com.readmates.aigen.adapter.out.llm.gemini

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.application.model.TokenUsage

/**
 * In-memory [GeminiApiPort] used by unit tests. Records the most recent
 * call's arguments so tests can assert on them, and either returns a
 * canned [GeminiToolResult] or throws a configured exception.
 */
class FakeGeminiApi(
    private val result: GeminiToolResult =
        GeminiToolResult(
            parsed = ObjectMapper().createObjectNode(),
            usage = TokenUsage(0, 0, 0),
        ),
    private val throwException: Throwable? = null,
) : GeminiApiPort {
    var lastModel: String? = null
        private set
    var lastSystemPrompt: String? = null
        private set
    var lastUserText: String? = null
        private set
    var lastTranscriptText: String? = null
        private set
    var lastResponseSchema: ObjectNode? = null
        private set
    var lastMaxOutputTokens: Int? = null
        private set

    override fun callResponseSchema(
        model: String,
        systemPrompt: String,
        userText: String,
        transcriptText: String,
        responseSchema: ObjectNode,
        maxOutputTokens: Int,
    ): GeminiToolResult {
        lastModel = model
        lastSystemPrompt = systemPrompt
        lastUserText = userText
        lastTranscriptText = transcriptText
        lastResponseSchema = responseSchema.deepCopy()
        lastMaxOutputTokens = maxOutputTokens
        throwException?.let { throw it }
        return result
    }
}
