package com.readmates.session.api

import com.readmates.auth.application.MemberAccountRepository
import com.readmates.session.application.CurrentSessionPayload
import com.readmates.session.application.SessionRepository
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import org.springframework.http.HttpStatus
import org.springframework.security.core.Authentication
import org.springframework.web.server.ResponseStatusException
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/sessions/current")
class CurrentSessionController(
    private val memberAccountRepository: MemberAccountRepository,
    private val sessionRepository: SessionRepository,
) {
    @GetMapping
    fun current(authentication: Authentication?): CurrentSessionPayload =
        sessionRepository.findCurrentSession(currentMember(authentication))

    private fun currentMember(authentication: Authentication?): CurrentMember {
        val email = authentication.emailOrNull() ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
        return memberAccountRepository.findActiveMemberByEmail(email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED)
    }
}
