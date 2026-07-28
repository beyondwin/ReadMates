@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.application.port.`in`

import com.readmates.aigen.application.model.AiGenerationActor

interface GetAiGenerationCapabilitiesUseCase {
    fun get(
        clubSlug: String,
        actor: AiGenerationActor,
    ): AiGenerationCapabilitiesView
}

data class AiGenerationCapabilitiesView(
    val enabled: Boolean,
)
