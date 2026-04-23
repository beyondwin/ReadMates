package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.port.`in`.DevLoginMemberUseCase
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Profile
import org.springframework.http.HttpStatus
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/dev")
@Profile("!prod & !production")
@ConditionalOnProperty(prefix = "readmates.dev", name = ["login-enabled"], havingValue = "true")
class DevLoginController(
    private val devLoginMember: DevLoginMemberUseCase,
) {
    @PostMapping("/login")
    fun login(
        @Valid @RequestBody request: DevLoginRequest,
        httpRequest: HttpServletRequest,
    ): AuthMemberResponse {
        val member = devLoginMember.findDevSeedActiveMemberByEmail(request.email)
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown dev login email")
        val authentication = UsernamePasswordAuthenticationToken(
            member.email,
            "N/A",
            listOf(SimpleGrantedAuthority("ROLE_${member.role}")),
        )
        val securityContext = SecurityContextHolder.createEmptyContext()
        securityContext.authentication = authentication
        SecurityContextHolder.setContext(securityContext)
        httpRequest.session.setAttribute(
            HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
            securityContext,
        )

        return AuthMemberResponse.from(member)
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout(httpRequest: HttpServletRequest) {
        SecurityContextHolder.clearContext()
        httpRequest.getSession(false)?.invalidate()
    }
}
