@file:Suppress("ktlint:standard:package-name")

package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.security.CurrentPlatformAdmin
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/admin/ai-generation/capabilities")
class PlatformAdminAiGenerationCapabilitiesController(
    private val properties: AiGenerationProperties,
) {
    @GetMapping
    fun get(
        @Suppress("UNUSED_PARAMETER") admin: CurrentPlatformAdmin,
    ): AiGenerationCapabilitiesResponse = AiGenerationCapabilitiesResponse(enabled = properties.enabled)
}
