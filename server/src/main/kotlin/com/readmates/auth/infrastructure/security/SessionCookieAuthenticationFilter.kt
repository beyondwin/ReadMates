package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.AuthSessionService
import com.readmates.auth.application.AuthenticatedMemberResolver
import com.readmates.shared.security.CurrentMember
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
            val session = authSessionService.findValidSession(rawToken)
                ?.takeUnless { it.revoked }

            if (session != null) {
                val member = authenticatedMemberResolver.resolveByUserId(session.userId)
                val authentication = if (member != null) {
                    UsernamePasswordAuthenticationToken(
                        member.email,
                        null,
                        listOf(SimpleGrantedAuthority(member.roleAuthority())),
                    )
                } else if (request.isOwnProfilePatch()) {
                    authenticatedMemberResolver.resolveProfileByUserId(session.userId)
                        ?.let { profileMember ->
                            UsernamePasswordAuthenticationToken(
                                profileMember.email,
                                null,
                                emptyList(),
                            )
                        }
                } else {
                    null
                }

                if (authentication != null) {
                    authentication.details = WebAuthenticationDetailsSource().buildDetails(request)
                    SecurityContextHolder.getContext().authentication = authentication
                }
            }
        }

        filterChain.doFilter(request, response)
    }

    private fun CurrentMember.roleAuthority(): String =
        if (isViewer) {
            "ROLE_VIEWER"
        } else {
            "ROLE_$role"
        }

    private fun HttpServletRequest.isOwnProfilePatch(): Boolean =
        method == "PATCH" && requestURI == "/api/me/profile"
}
