package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.AuthenticatedMemberResolver
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
class MemberAuthoritiesFilter(
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val authentication = SecurityContextHolder.getContext().authentication
        val email = authentication.emailOrNull()

        if (authentication != null && email != null) {
            val member = authenticatedMemberResolver.resolve(authentication)
            val authorities = authentication.authorities
                .filterNot { it.authority in MEMBER_ROLE_AUTHORITIES }
                .toMutableList()

            if (member != null) {
                val roleAuthority = if (member.isPendingApproval) {
                    "ROLE_PENDING_APPROVAL"
                } else {
                    "ROLE_${member.role}"
                }
                authorities += SimpleGrantedAuthority(roleAuthority)
            }

            val mappedAuthentication = UsernamePasswordAuthenticationToken(
                authentication.principal ?: authentication.name,
                authentication.credentials,
                authorities,
            )
            mappedAuthentication.details = authentication.details
            SecurityContextHolder.getContext().authentication = mappedAuthentication
        }

        filterChain.doFilter(request, response)
    }

    private companion object {
        val MEMBER_ROLE_AUTHORITIES = setOf("ROLE_HOST", "ROLE_MEMBER", "ROLE_PENDING_APPROVAL")
    }
}
