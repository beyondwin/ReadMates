package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.service.AuthenticatedMemberResolver
import com.readmates.club.adapter.`in`.web.ClubContextHeader
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.club.application.port.out.LoadSupportAccessGrantPort
import com.readmates.shared.security.CurrentPlatformAdmin
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
class MemberAuthoritiesFilter(
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
    private val resolveClubContextUseCase: ResolveClubContextUseCase,
    private val loadSupportAccessGrantPort: LoadSupportAccessGrantPort,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val authentication = SecurityContextHolder.getContext().authentication
        val email = authentication.emailOrNull()

        if (authentication != null && email != null) {
            val requestedClubContext = request.resolveRequestedClubContext()
            val member = if (requestedClubContext.supplied && requestedClubContext.context == null) {
                null
            } else {
                authenticatedMemberResolver.resolveByEmail(email, requestedClubContext.context)
            }
            val authorities = authentication.authorities
                .filterNot { it.authority in MEMBER_ROLE_AUTHORITIES }
                .toMutableList()

            if (member != null) {
                val roleAuthority = if (member.isViewer) {
                    "ROLE_VIEWER"
                } else {
                    "ROLE_${member.role}"
                }
                authorities += SimpleGrantedAuthority(roleAuthority)
            } else if (requestedClubContext.context != null &&
                authentication.authorities.any { it.authority == PLATFORM_ADMIN_AUTHORITY }
            ) {
                // Platform admin with an active support access grant gets elevated to ROLE_HOST
                val userId = when (val principal = authentication.principal) {
                    is CurrentUser -> principal.userId
                    is CurrentPlatformAdmin -> principal.userId
                    else -> null
                }
                if (userId != null &&
                    loadSupportAccessGrantPort.hasActiveGrant(userId, requestedClubContext.context.clubId)
                ) {
                    authorities += SimpleGrantedAuthority("ROLE_HOST")
                }
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

    private fun HttpServletRequest.resolveRequestedClubContext(): RequestedClubContext {
        val slug = getHeader(ClubContextHeader.CLUB_SLUG)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
        if (slug != null) {
            return RequestedClubContext(supplied = true, context = resolveClubContextUseCase.resolveBySlug(slug))
        }

        val host = getHeader(ClubContextHeader.CLUB_HOST)
            ?.trim()
            ?.takeIf { it.isNotEmpty() }
        if (host != null) {
            return RequestedClubContext(supplied = true, context = resolveClubContextUseCase.resolveByHost(host))
        }

        return RequestedClubContext(supplied = false, context = null)
    }

    private companion object {
        val MEMBER_ROLE_AUTHORITIES = setOf("ROLE_HOST", "ROLE_MEMBER", "ROLE_VIEWER")
        const val PLATFORM_ADMIN_AUTHORITY = "ROLE_PLATFORM_ADMIN"
    }

    private data class RequestedClubContext(
        val supplied: Boolean,
        val context: ResolvedClubContext?,
    )
}
