package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.port.`in`.ManageHostInvitationsUseCase
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

@RestController
@RequestMapping("/api/host/invitations")
class HostInvitationController(
    private val invitations: ManageHostInvitationsUseCase,
) {
    @GetMapping
    fun list(
        currentMember: CurrentMember,
        @RequestParam(required = false) limit: Int?,
        @RequestParam(required = false) cursor: String?,
    ) = invitations.listHostInvitations(
        currentMember,
        PageRequest.cursor(limit, cursor, defaultLimit = 50, maxLimit = 100),
    )

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        currentMember: CurrentMember,
        @Valid @RequestBody request: CreateInvitationRequest,
    ) = invitations.createInvitation(
        host = currentMember,
        email = request.email,
        name = request.name,
        applyToCurrentSession = request.applyToCurrentSession,
    )

    @PostMapping("/{invitationId}/revoke")
    fun revoke(
        currentMember: CurrentMember,
        @PathVariable invitationId: String,
    ) = invitations.revokeInvitation(currentMember, parseInvitationId(invitationId))
}

internal fun parseInvitationId(invitationId: String): UUID =
    runCatching { UUID.fromString(invitationId) }
        .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid invitation id") }
