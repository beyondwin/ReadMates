package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.AuthSessionService
import com.readmates.auth.application.AuthenticatedMemberResolver
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class SessionCookieAuthenticationFilter(
    private val authSessionService: AuthSessionService,
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val rawToken = request.cookies
            ?.firstOrNull { it.name == AuthSessionService.COOKIE_NAME }
            ?.value
            ?.takeIf { it.isNotBlank() }

        if (rawToken != null && SecurityContextHolder.getContext().authentication == null) {
            val member = authSessionService.findValidSession(rawToken)
                ?.takeUnless { it.revoked }
                ?.let { authenticatedMemberResolver.resolveByUserId(it.userId) }

            if (member != null) {
                val roleAuthority = if (member.isPendingApproval) {
                    "ROLE_PENDING_APPROVAL"
                } else {
                    "ROLE_${member.role}"
                }
                val authentication = UsernamePasswordAuthenticationToken(
                    member.email,
                    null,
                    listOf(SimpleGrantedAuthority(roleAuthority)),
                )
                authentication.details = WebAuthenticationDetailsSource().buildDetails(request)
                SecurityContextHolder.getContext().authentication = authentication
            }
        }

        filterChain.doFilter(request, response)
    }
}
