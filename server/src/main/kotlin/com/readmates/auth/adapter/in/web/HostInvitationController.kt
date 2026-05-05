package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.port.`in`.ManageHostInvitationsUseCase
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
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

private const val MAX_INVITATION_EMAIL_LENGTH = 320

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

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidationError(error: MethodArgumentNotValidException): ResponseEntity<InvitationErrorResponse> {
        val fieldErrors = error.bindingResult.fieldErrors
        val response = when {
            fieldErrors.any { it.field == "email" && isOverEmailLengthLimit(it.rejectedValue) } ->
                InvitationErrorResponse(
                    code = "INVALID_INVITATION_EMAIL",
                    message = "Email must be 320 characters or less",
                )
            fieldErrors.any { it.field == "email" } ->
                InvitationErrorResponse(
                    code = "INVALID_INVITATION_EMAIL",
                    message = "Invalid invitation email",
                )
            fieldErrors.any { it.field == "name" } -> InvitationErrorResponse(
                code = "INVALID_INVITATION_NAME",
                message = "Name is required",
            )
            else -> InvitationErrorResponse(
                code = "INVALID_INVITATION_REQUEST",
                message = "Invalid invitation request",
            )
        }
        return ResponseEntity.badRequest().body(response)
    }

    private fun isOverEmailLengthLimit(value: Any?): Boolean =
        (value as? String)?.trim()?.length?.let { it > MAX_INVITATION_EMAIL_LENGTH } == true
}

internal fun parseInvitationId(invitationId: String): UUID =
    runCatching { UUID.fromString(invitationId) }
        .getOrElse { throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid invitation id") }
