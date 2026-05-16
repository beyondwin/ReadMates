package com.readmates.aigen.adapter.`in`.web

import com.readmates.aigen.application.AiGenerationException
import com.readmates.aigen.application.model.ErrorCode
import com.readmates.aigen.application.port.`in`.GetClubAiDefaultsUseCase
import com.readmates.aigen.application.port.`in`.UpdateClubAiDefaultsUseCase
import com.readmates.aigen.config.AiGenerationProperties
import com.readmates.shared.security.CurrentMember
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * REST adapter for the per-club AI defaults endpoints (spec §7.6).
 *
 *  - GET  /api/host/clubs/{clubSlug}/ai-defaults  -> {"defaultModel": String?}
 *  - PUT  /api/host/clubs/{clubSlug}/ai-defaults  body: {"defaultModel": String}
 *
 * Both endpoints short-circuit to 503 [ErrorCode.AI_DISABLED] when the
 * `readmates.aigen.enabled` kill switch is off, mirroring [AiGenerationController].
 * Authorization (host of the club) is enforced by the application service.
 */
@RestController
@RequestMapping("/api/host/clubs/{clubSlug}/ai-defaults")
@ConditionalOnProperty(prefix = "readmates.aigen", name = ["enabled"], havingValue = "true")
class ClubAiDefaultsController(
    private val getUc: GetClubAiDefaultsUseCase,
    private val updateUc: UpdateClubAiDefaultsUseCase,
    private val props: AiGenerationProperties,
) {
    @GetMapping
    fun get(
        @PathVariable clubSlug: String,
        member: CurrentMember,
    ): ClubAiDefaultsResponse {
        ensureEnabled()
        val view = getUc.get(clubSlug, member)
        return ClubAiDefaultsResponse(defaultModel = view.defaultModel)
    }

    @PutMapping(consumes = [MediaType.APPLICATION_JSON_VALUE])
    fun update(
        @PathVariable clubSlug: String,
        @RequestBody body: UpdateClubAiDefaultsRequest,
        member: CurrentMember,
    ) {
        ensureEnabled()
        updateUc.update(clubSlug, body.defaultModel, member)
    }

    private fun ensureEnabled() {
        if (!props.enabled) {
            throw AiGenerationException.Coded(ErrorCode.AI_DISABLED, "AI generation is disabled")
        }
    }
}

data class ClubAiDefaultsResponse(
    val defaultModel: String?,
)

data class UpdateClubAiDefaultsRequest(
    val defaultModel: String,
)
