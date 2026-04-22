package com.readmates.session.api

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.session.application.SessionRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class PublicationRequest(
    @field:NotBlank val publicSummary: String,
    val isPublic: Boolean,
)

@RestController
@RequestMapping("/api/host/sessions/{sessionId}/publication")
class PublicationController(
    private val memberAccountRepository: MemberAccountRepository,
    private val sessionRepository: SessionRepository,
) {
    @PutMapping
    fun publish(
        authentication: Authentication?,
        @PathVariable sessionId: String,
        @Valid @RequestBody request: PublicationRequest,
    ) = sessionRepository.upsertPublication(currentMember(authentication), parseHostSessionId(sessionId), request)

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}
