package com.readmates.auth.api

import com.readmates.auth.application.InvitationService
import com.readmates.auth.application.MemberAccountRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import jakarta.validation.Valid
import jakarta.validation.constraints.Email
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.util.UUID

class CreateInvitationRequest(email: String, name: String, applyToCurrentSession: Boolean? = null) {
    @field:NotBlank
    @field:Email
    val email: String = email.trim()

    @field:NotBlank
    val name: String = name.trim()

    val applyToCurrentSession: Boolean = applyToCurrentSession ?: true
}

@RestController
@RequestMapping("/api/host/invitations")
class HostInvitationController(
    private val memberAccountRepository: MemberAccountRepository,
    private val invitationService: InvitationService,
) {
    @GetMapping
    fun list(authentication: Authentication?) =
        invitationService.listHostInvitations(currentMember(authentication))

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        authentication: Authentication?,
        @Valid @RequestBody request: CreateInvitationRequest,
    ) = invitationService.createInvitation(
        host = currentMember(authentication),
        email = request.email,
        name = request.name,
        applyToCurrentSession = request.applyToCurrentSession,
    )

    @PostMapping("/{invitationId}/revoke")
    fun revoke(
        authentication: Authentication?,
        @PathVariable invitationId: String,
    ) = invitationService.revokeInvitation(currentMember(authentication), parseInvitationId(invitationId))

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}

internal fun parseInvitationId(invitationId: String): UUID =
    runCatching { UUID.fromString(invitationId) }
        .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid invitation id") }
