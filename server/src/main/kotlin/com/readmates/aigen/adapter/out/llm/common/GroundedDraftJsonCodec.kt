package com.readmates.aigen.adapter.out.llm.common

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.model.GenerationError
import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedAuthoredText
import com.readmates.aigen.application.model.GroundedFeedbackSection
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundedTextBlock
import com.readmates.aigen.application.model.TokenUsage
import com.readmates.aigen.application.port.out.GroundedSectionRepairOutput
import org.springframework.stereotype.Component
import java.time.LocalDate

@Component
class GroundedDraftJsonCodec {
    fun draft(node: ObjectNode): GroundedGenerationDraft =
        decodeSafely {
            GroundedGenerationDraft(
                format = node.requiredText("format"),
                sessionNumber = node.requiredInt("sessionNumber"),
                bookTitle = node.requiredText("bookTitle"),
                meetingDate = LocalDate.parse(node.requiredText("meetingDate")),
                summaryBlocks = textBlocks(node.requiredArray("summaryBlocks")),
                highlights = authored(node.requiredArray("highlights")),
                oneLineReviews = authored(node.requiredArray("oneLineReviews")),
                feedbackDocumentFileName = node.requiredText("feedbackDocumentFileName"),
                feedbackSections = feedback(node.requiredArray("feedbackSections")),
            )
        }

    fun repair(
        node: ObjectNode,
        section: GenerationItem,
        usage: TokenUsage,
    ): GroundedSectionRepairOutput =
        decodeSafely {
            when (section) {
                GenerationItem.SUMMARY ->
                    GroundedSectionRepairOutput.Summary(textBlocks(node.requiredArray("summaryBlocks")), usage)
                GenerationItem.HIGHLIGHTS ->
                    GroundedSectionRepairOutput.Highlights(authored(node.requiredArray("highlights")), usage)
                GenerationItem.ONE_LINE_REVIEWS ->
                    GroundedSectionRepairOutput.OneLineReviews(authored(node.requiredArray("oneLineReviews")), usage)
                GenerationItem.FEEDBACK_DOCUMENT ->
                    GroundedSectionRepairOutput.FeedbackDocument(
                        fileName = node.requiredText("feedbackDocumentFileName"),
                        sections = feedback(node.requiredArray("feedbackSections")),
                        usage = usage,
                    )
            }
        }

    private fun textBlocks(nodes: List<JsonNode>): List<GroundedTextBlock> =
        nodes.map { node -> GroundedTextBlock(node.requiredText("text"), node.requiredStringArray("evidenceTurnIds")) }

    private fun authored(nodes: List<JsonNode>): List<GroundedAuthoredText> =
        nodes.map { node ->
            GroundedAuthoredText(
                node.requiredText("authorName"),
                node.requiredText("text"),
                node.requiredStringArray("evidenceTurnIds"),
            )
        }

    private fun feedback(nodes: List<JsonNode>): List<GroundedFeedbackSection> =
        nodes.map { node ->
            GroundedFeedbackSection(
                node.requiredText("heading"),
                node.requiredText("markdown"),
                node.requiredStringArray("evidenceTurnIds"),
            )
        }

    private fun <T> decodeSafely(block: () -> T): T =
        try {
            block()
        } catch (
            @Suppress("TooGenericExceptionCaught") error: Throwable,
        ) {
            throw LlmGenerationException(
                GenerationError(ErrorCode.SCHEMA_INVALID, INVALID_OUTPUT_MESSAGE),
                error,
            )
        }

    private fun JsonNode.requiredText(name: String): String =
        path(name).takeIf { it.isTextual && it.asText().isNotBlank() }?.asText()
            ?: error(INVALID_OUTPUT_MESSAGE)

    private fun JsonNode.requiredInt(name: String): Int =
        path(name).takeIf(JsonNode::isIntegralNumber)?.asInt()
            ?: error(INVALID_OUTPUT_MESSAGE)

    private fun JsonNode.requiredArray(name: String): List<JsonNode> =
        path(name).takeIf(JsonNode::isArray)?.toList()
            ?: error(INVALID_OUTPUT_MESSAGE)

    private fun JsonNode.requiredStringArray(name: String): List<String> =
        requiredArray(name).map { it.takeIf(JsonNode::isTextual)?.asText() ?: error(INVALID_OUTPUT_MESSAGE) }

    private companion object {
        const val INVALID_OUTPUT_MESSAGE = "provider returned invalid grounded output"
    }
}
