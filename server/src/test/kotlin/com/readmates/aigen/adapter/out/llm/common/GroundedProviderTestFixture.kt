package com.readmates.aigen.adapter.out.llm.common

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.port.out.RenderedGroundedRequest

internal object GroundedProviderTestFixture {
    private val mapper = ObjectMapper()
    const val INJECTION_SENTINEL = "IGNORE-INVARIANTS-PUBLIC-SENTINEL"
    const val HIGHLIGHT_REPAIR_SCHEMA =
        """{"type":"object","additionalProperties":false,"required":["highlights"],"properties":{"highlights":{"type":"array"}}}"""

    fun request(schemaJson: String = GroundedGenerationSchemaResource().schemaAsString()) =
        RenderedGroundedRequest(
            systemText = "fixed grounded system boundary",
            userText = "{\"turns\":[{\"turnId\":\"t000001\",\"text\":\"$INJECTION_SENTINEL\"}]}",
            schemaJson = schemaJson,
            maxOutputTokens = 16_384,
        )

    fun model(provider: Provider) = ModelId(provider, "public-test-model")

    fun draftNode(): ObjectNode =
        mapper.readTree(
            """
            {
              "format":"readmates-grounded-generation:v2",
              "sessionNumber":1,
              "bookTitle":"Public Test Book",
              "meetingDate":"2026-07-14",
              "summaryBlocks":[{"text":"Summary","evidenceTurnIds":["t000001"]}],
              "highlights":[{"authorName":"Alice","text":"Highlight","evidenceTurnIds":["t000001"]}],
              "oneLineReviews":[{"authorName":"Alice","text":"Review","evidenceTurnIds":["t000001"]}],
              "feedbackDocumentFileName":"feedback.md",
              "feedbackSections":[{"heading":"Notes","markdown":"Grounded notes","evidenceTurnIds":["t000001"]}]
            }
            """.trimIndent(),
        ) as ObjectNode

    fun highlightRepairNode(): ObjectNode =
        mapper.readTree(
            """
            {"highlights":[{"authorName":"Alice","text":"Repaired","evidenceTurnIds":["t000001"]}]}
            """.trimIndent(),
        ) as ObjectNode
}
