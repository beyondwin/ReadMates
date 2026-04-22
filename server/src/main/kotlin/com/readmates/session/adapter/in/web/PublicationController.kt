package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.`in`.UpsertPublicationUseCase
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

data class PublicationRequest(
    @field:NotBlank val publicSummary: String,
    val isPublic: Boolean,
) {
    fun toCommand(host: CurrentMember, sessionId: UUID): UpsertPublicationCommand =
        UpsertPublicationCommand(host, sessionId, publicSummary, isPublic)
}

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/publication")
class PublicationController(
    private val upsertPublicationUseCase: UpsertPublicationUseCase,
) {
    @PutMapping
    fun publish(
        @PathVariable sessionId: String,
        @Valid @RequestBody request: PublicationRequest,
        member: CurrentMember,
    ) = upsertPublicationUseCase.upsertPublication(request.toCommand(member, parseHostSessionId(sessionId)))
}
