package com.readmates.aigen.application.service

import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.port.`in`.AiGenerationCapabilitiesView
import com.readmates.aigen.application.port.`in`.GetAiGenerationCapabilitiesUseCase
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.security.AccessDeniedException
import org.springframework.stereotype.Service

@Service
class AiGenerationCapabilitiesService(
    private val properties: AiGenerationProperties,
) : GetAiGenerationCapabilitiesUseCase {
    override fun get(
        clubSlug: String,
        actor: AiGenerationActor,
    ): AiGenerationCapabilitiesView {
        if (!actor.isHost || actor.clubSlug != clubSlug) {
            throw AccessDeniedException("Host of '$clubSlug' required")
        }
        return AiGenerationCapabilitiesView(enabled = properties.enabled)
    }
}
