package com.readmates.auth.api

import com.readmates.auth.application.InvitationService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/invitations")
class InvitationController(
    private val invitationService: InvitationService,
) {
    @GetMapping("/{token}")
    fun preview(@PathVariable token: String) = invitationService.previewInvitation(token)

    @PostMapping("/{token}/accept")
    fun accept(@PathVariable("token") _token: String): Nothing =
        throw ResponseStatusException(HttpStatus.GONE, "Password invitation acceptance has been removed")
}
