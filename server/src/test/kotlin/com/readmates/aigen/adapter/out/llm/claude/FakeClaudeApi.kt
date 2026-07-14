package com.readmates.aigen.adapter.out.llm.claude

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.application.model.TokenUsage

/**
 * In-memory ClaudeApiPort used by unit tests. Records the most recent
 * call's arguments so tests can assert on them, and either returns a
 * canned [ClaudeToolResult] or throws a configured exception.
 */
class FakeClaudeApi(
    private val result: ClaudeToolResult =
        ClaudeToolResult(
            input = ObjectMapper().createObjectNode(),
            usage = TokenUsage(0, 0, 0),
        ),
    private val throwException: Throwable? = null,
) : ClaudeApiPort {
    var lastModel: String? = null
        private set
    var lastSystemPrompt: String? = null
        private set
    var lastUserText: String? = null
        private set
    var lastTranscriptText: String? = null
        private set
    var lastToolName: String? = null
        private set
    var lastToolSchema: ObjectNode? = null
        private set
    var lastExpectCacheControl: Boolean? = null
        private set
    var lastMaxOutputTokens: Int? = null
        private set

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
        lastModel = model
        lastSystemPrompt = systemPrompt
        lastUserText = userText
        lastTranscriptText = transcriptText
        lastToolName = toolName
        lastToolSchema = toolSchema.deepCopy()
        lastExpectCacheControl = expectCacheControl
        lastMaxOutputTokens = maxOutputTokens
        throwException?.let { throw it }
        return result
    }
}
