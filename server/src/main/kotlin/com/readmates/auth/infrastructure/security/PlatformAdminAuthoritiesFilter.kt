package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.port.`in`.ResolveCurrentMemberUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
import com.readmates.shared.security.emailOrNull
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class PlatformAdminAuthoritiesFilter(
    private val resolveCurrentMemberUseCase: ResolveCurrentMemberUseCase,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val authentication = SecurityContextHolder.getContext().authentication
        val userId = when (val principal = authentication?.principal) {
            is CurrentMember -> principal.userId
            is CurrentUser -> principal.userId
            else -> authentication.emailOrNull()
                ?.let(resolveCurrentMemberUseCase::findUserIdByEmail)
        }

        if (authentication != null && userId != null) {
            val platformAdmin = resolveCurrentMemberUseCase.findPlatformAdmin(userId)
            if (platformAdmin != null && authentication.authorities.none { it.authority == PLATFORM_ADMIN_AUTHORITY }) {
                val mappedAuthentication = UsernamePasswordAuthenticationToken(
                    authentication.principal ?: authentication.name,
                    authentication.credentials,
                    authentication.authorities + SimpleGrantedAuthority(PLATFORM_ADMIN_AUTHORITY),
                )
                mappedAuthentication.details = authentication.details
                SecurityContextHolder.getContext().authentication = mappedAuthentication
            }
        }

        filterChain.doFilter(request, response)
    }

    private companion object {
        const val PLATFORM_ADMIN_AUTHORITY = "ROLE_PLATFORM_ADMIN"
    }
}
