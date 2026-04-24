package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.emailOrNull
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/auth/me")
class AuthMeController(
    private val resolveCurrentMemberUseCase: ResolveCurrentMemberUseCase,
) {
    @GetMapping
    fun me(authentication: Authentication?): AuthMemberResponse {
        val sessionProfileMember = authentication?.principal as? CurrentMember
        if (sessionProfileMember != null) {
            return AuthMemberResponse.from(sessionProfileMember)
        }

        val email = authentication.emailOrNull()
        val member = email?.let(resolveCurrentMemberUseCase::resolveByEmail)
            ?: return AuthMemberResponse.anonymous(email)
        return AuthMemberResponse.from(member)
    }
}
