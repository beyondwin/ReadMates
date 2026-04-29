package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.port.`in`.PreviewInvitationUseCase
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
class InvitationController(
    private val invitations: PreviewInvitationUseCase,
) {
    @GetMapping("/api/invitations/{token}")
    fun preview(@PathVariable token: String) = invitations.previewInvitation(token)

    @GetMapping("/api/clubs/{clubSlug}/invitations/{token}")
    fun previewForClub(@PathVariable clubSlug: String, @PathVariable token: String) =
        invitations.previewInvitation(token, clubSlug)

    @PostMapping("/api/invitations/{token}/accept")
    fun accept(@PathVariable("token") _token: String): Nothing =
        throw ResponseStatusException(HttpStatus.GONE, "Password invitation acceptance has been removed")

    @PostMapping("/api/clubs/{clubSlug}/invitations/{token}/accept")
    fun acceptForClub(@PathVariable("clubSlug") _clubSlug: String, @PathVariable("token") _token: String): Nothing =
        throw ResponseStatusException(HttpStatus.GONE, "Password invitation acceptance has been removed")
}
