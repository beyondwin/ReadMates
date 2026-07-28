@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.model.AiGenerationActor
import com.readmates.aigen.application.port.`in`.GetAiGenerationCapabilitiesUseCase
import com.readmates.shared.security.CurrentMember
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/host/clubs/{clubSlug}/ai-generation/capabilities")
class AiGenerationCapabilitiesController(
    private val capabilities: GetAiGenerationCapabilitiesUseCase,
) {
    @GetMapping
    fun get(
        @PathVariable clubSlug: String,
        member: CurrentMember,
    ): AiGenerationCapabilitiesResponse {
        val view =
            capabilities.get(
                clubSlug = clubSlug,
                actor =
                    AiGenerationActor(
                        userId = member.userId,
                        membershipId = member.membershipId,
                        clubId = member.clubId,
                        clubSlug = member.clubSlug,
                        isHost = member.isHost,
                    ),
            )
        return AiGenerationCapabilitiesResponse(enabled = view.enabled)
    }
}

data class AiGenerationCapabilitiesResponse(
    val enabled: Boolean,
)
