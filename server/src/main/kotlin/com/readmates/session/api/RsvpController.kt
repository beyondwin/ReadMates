package com.readmates.session.api

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.session.application.SessionRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import jakarta.validation.Valid
import jakarta.validation.constraints.Pattern
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

data class UpdateRsvpRequest(
    @field:Pattern(regexp = "NO_RESPONSE|GOING|MAYBE|DECLINED")
    val status: String,
)

@RestController
@RequestMapping("/api/sessions/current/rsvp")
class RsvpController(
    private val memberAccountRepository: MemberAccountRepository,
    private val sessionRepository: SessionRepository,
) {
    @PatchMapping
    fun update(
        authentication: Authentication?,
        @Valid @RequestBody request: UpdateRsvpRequest,
    ) = sessionRepository.updateRsvp(currentMember(authentication), request.status)

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}
