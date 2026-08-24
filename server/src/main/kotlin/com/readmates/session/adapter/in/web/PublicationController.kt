package com.readmates.session.adapter.`in`.web

import com.readmates.session.application.model.UpsertPublicationCommand
import com.readmates.session.application.port.`in`.UpsertPublicationUseCase
import com.readmates.session.domain.PublicSiteVisibility
import com.readmates.session.domain.SessionAccessScope
import com.readmates.sessionrecord.application.model.SessionRecordVisibility
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import tools.jackson.databind.JsonNode
import java.util.UUID

data class HostSessionPublicationRequest(
    @field:NotBlank val publicSummary: String,
    val accessScope: SessionAccessScope? = null,
    val siteVisibility: PublicSiteVisibility? = null,
    val visibility: SessionRecordVisibility? = null,
) {
    fun toCommand(
        host: CurrentMember,
        sessionId: UUID,
    ): UpsertPublicationCommand =
        UpsertPublicationCommand(
            host,
            sessionId,
            publicSummary.trim(),
            visibility ?: SessionRecordVisibility.HOST_ONLY,
            accessScope,
            siteVisibility,
        )
}

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/publication")
class PublicationController(
    private val upsertPublicationUseCase: UpsertPublicationUseCase,
    private val envelopes: HostMutationEnvelopeReader,
) {
    @PutMapping
    fun publish(
        @PathVariable sessionId: String,
        @RequestBody body: JsonNode,
        member: CurrentMember,
    ): Any {
        val envelope = envelopes.publication(body)
        return upsertPublicationUseCase.upsertPublication(
            envelope.command.toCommand(member, parseHostSessionId(sessionId)).copy(
                expectedPublicationRevision = envelope.expected.publicationRevision,
                expectedExposureRevision = envelope.expected.exposureRevision,
                idempotencyKey = envelope.idempotencyKey,
            ),
        )
    }
}
