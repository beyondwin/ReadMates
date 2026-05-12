package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.service.AuthenticatedMemberResolver
import com.readmates.club.adapter.`in`.web.resolveClubContext
import com.readmates.club.application.port.`in`.CheckSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
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

/**
 * Resolves authorities for the current principal.
 *
 * Branching rules:
 * - When [RequestedClubContext.source] is SLUG and the slug is registered, lookup the member and synthesize
 *   role + host + platform admin authorities.
 * - When [RequestedClubContext.source] is SLUG and the slug is NOT registered (`supplied=true && context=null`),
 *   the member lookup is intentionally skipped (`member=null`). Authorities are then composed entirely from
 *   platform admin + host support grants. Do NOT add a `member==null` short-circuit guard above this branch;
 *   doing so would silently strip support-grant authorities. See ADR-0013 for context.
 * - When [RequestedClubContext.source] is HOST_FALLBACK or NONE, return an unscoped principal.
 */
@Component
class MemberAuthoritiesFilter(
    private val authenticatedMemberResolver: AuthenticatedMemberResolver,
    private val resolveClubContextUseCase: ResolveClubContextUseCase,
    private val checkSupportAccessGrantUseCase: CheckSupportAccessGrantUseCase,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val authentication = SecurityContextHolder.getContext().authentication
        val email = authentication.emailOrNull()

        if (authentication != null && email != null) {
            val requestedClubContext = request.resolveClubContext(resolveClubContextUseCase)
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
            } else if (
                authentication.authorities.any { it.authority == PLATFORM_ADMIN_AUTHORITY } &&
                requestedClubContext.supplied &&
                requestedClubContext.context != null
            ) {
                // Platform admin with no club membership — check for an active HOST_SUPPORT_READ grant
                val clubContext = requestedClubContext.context
                val userId = when (val principal = authentication.principal) {
                    is CurrentMember -> principal.userId
                    is CurrentUser -> principal.userId
                    else -> null
                }
                if (userId != null) {
                    val synthesis = checkSupportAccessGrantUseCase.synthesizeHostCurrentMember(
                        userId = userId,
                        email = email,
                        clubId = clubContext.clubId,
                        clubSlug = clubContext.slug,
                        clubName = clubContext.name,
                    )
                    if (synthesis != null) {
                        // Store in request attribute so CurrentMemberArgumentResolver can reuse it
                        request.setAttribute(CheckSupportAccessGrantUseCase.SUPPORT_SYNTHESIS_REQUEST_ATTR, synthesis)
                        authorities += SimpleGrantedAuthority("ROLE_HOST")
                    }
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

    private companion object {
        val MEMBER_ROLE_AUTHORITIES = setOf("ROLE_HOST", "ROLE_MEMBER", "ROLE_VIEWER")
        const val PLATFORM_ADMIN_AUTHORITY = "ROLE_PLATFORM_ADMIN"
    }
}
