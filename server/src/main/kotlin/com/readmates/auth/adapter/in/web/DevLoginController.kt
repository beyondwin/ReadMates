package com.readmates.auth.adapter.`in`.web

import com.readmates.auth.application.port.`in`.DevLoginMemberUseCase
import com.readmates.auth.domain.MembershipStatus
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
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
        val identity =
            devLoginMember.findDevSeedLoginIdentityByEmail(request.email)
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Unknown dev login email")
        val member = identity.member
        val principal = member ?: CurrentUser(userId = identity.userId, email = identity.email)
        val authorities = mutableListOf<SimpleGrantedAuthority>()
        if (member != null) {
            authorities += SimpleGrantedAuthority(member.roleAuthority())
        }
        if (identity.platformAdmin != null) {
            authorities += SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN")
        }
        val authentication =
            UsernamePasswordAuthenticationToken(
                principal,
                "N/A",
                authorities,
            )
        val securityContext = SecurityContextHolder.createEmptyContext()
        securityContext.authentication = authentication
        SecurityContextHolder.setContext(securityContext)
        httpRequest.session.setAttribute(
            HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
            securityContext,
        )

        return if (member != null) {
            AuthMemberResponse.from(member, platformAdmin = identity.platformAdmin)
        } else {
            AuthMemberResponse.authenticatedUser(
                userId = identity.userId,
                email = identity.email,
                platformAdmin = identity.platformAdmin,
            )
        }
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout(httpRequest: HttpServletRequest) {
        SecurityContextHolder.clearContext()
        httpRequest.getSession(false)?.invalidate()
    }

    private fun CurrentMember.roleAuthority(): String =
        if (membershipStatus == MembershipStatus.VIEWER) {
            "ROLE_VIEWER"
        } else {
            "ROLE_$role"
        }
}
