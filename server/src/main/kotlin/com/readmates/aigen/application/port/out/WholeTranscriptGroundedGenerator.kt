package com.readmates.aigen.application.port.out

import com.readmates.aigen.application.model.GenerationItem
import com.readmates.aigen.application.model.GroundedAuthoredText
import com.readmates.aigen.application.model.GroundedFeedbackSection
import com.readmates.aigen.application.model.GroundedGenerationDraft
import com.readmates.aigen.application.model.GroundedTextBlock
import com.readmates.aigen.application.model.ModelId
import com.readmates.aigen.application.model.Provider
import com.readmates.aigen.application.model.TokenUsage

data class StructuredGenerationRequest(
    val model: String,
    val systemText: String,
    val userText: String,
    val schemaJson: String,
    val maxOutputTokens: Int,
)

fun RenderedGroundedRequest.forModel(model: ModelId): StructuredGenerationRequest =
    StructuredGenerationRequest(
        model = model.name,
        systemText = systemText,
        userText = userText,
        schemaJson = schemaJson,
        maxOutputTokens = maxOutputTokens,
    )

data class GroundedGenerationOutput(
    val draft: GroundedGenerationDraft,
    val usage: TokenUsage,
    val usageComplete: Boolean = true,
)

sealed interface GroundedSectionRepairOutput {
    val section: GenerationItem
    val usage: TokenUsage
    val usageComplete: Boolean

    data class Summary(
        val blocks: List<GroundedTextBlock>,
        override val usage: TokenUsage,
        override val usageComplete: Boolean = true,
    ) : GroundedSectionRepairOutput {
        override val section = GenerationItem.SUMMARY
    }

    data class Highlights(
        val items: List<GroundedAuthoredText>,
        override val usage: TokenUsage,
        override val usageComplete: Boolean = true,
    ) : GroundedSectionRepairOutput {
        override val section = GenerationItem.HIGHLIGHTS
    }

    data class OneLineReviews(
        val items: List<GroundedAuthoredText>,
        override val usage: TokenUsage,
        override val usageComplete: Boolean = true,
    ) : GroundedSectionRepairOutput {
        override val section = GenerationItem.ONE_LINE_REVIEWS
    }

    data class FeedbackDocument(
        val fileName: String,
        val sections: List<GroundedFeedbackSection>,
        override val usage: TokenUsage,
        override val usageComplete: Boolean = true,
    ) : GroundedSectionRepairOutput {
        override val section = GenerationItem.FEEDBACK_DOCUMENT
    }
}

interface WholeTranscriptGroundedGenerator {
    val provider: Provider

    fun generate(
        model: ModelId,
        request: RenderedGroundedRequest,
    ): GroundedGenerationOutput

    fun repair(
        model: ModelId,
        section: GenerationItem,
        request: RenderedGroundedRequest,
    ): GroundedSectionRepairOutput
}
