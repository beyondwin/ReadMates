package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.service.AuthenticatedMemberResolver
import com.readmates.auth.application.service.AuthoritySynthesisRequest
import com.readmates.auth.application.service.AuthoritySynthesisService
import com.readmates.auth.application.service.ClubContextInput
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
 * Branching rules (delegated to [AuthoritySynthesisService]):
 * - When [RequestedClubContext.source] is SLUG and the slug is registered, lookup the member and synthesize
 *   role + host + platform admin authorities.
 * - When [RequestedClubContext.source] is SLUG and the slug is NOT registered (`supplied=true && context=null`),
 *   the member lookup is intentionally skipped (`member=null`). Authorities are then composed entirely from
 *   platform admin + host support grants. Do NOT add a `member==null` short-circuit guard above this branch;
 *   doing so would silently strip support-grant authorities. See ADR-0013 for context.
 * - When [RequestedClubContext.source] is HOST_FALLBACK or NONE, return an unscoped principal.
 *
 * This filter is in the infrastructure layer: it is allowed to use Spring Security types and
 * adapter types. It maps result authority strings → [SimpleGrantedAuthority] at this boundary.
 */
@Component
class MemberAuthoritiesFilter(
    private val authoritySynthesisService: AuthoritySynthesisService,
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
            val resolvedClubContext = requestedClubContext.context

            val member =
                if (requestedClubContext.supplied && resolvedClubContext == null) {
                    null
                } else {
                    authenticatedMemberResolver.resolveByEmail(email, resolvedClubContext)
                }

            val userId =
                when (val principal = authentication.principal) {
                    is CurrentMember -> principal.userId
                    is CurrentUser -> principal.userId
                    else -> null
                }

            // Pre-fetch the support synthesis only when the preconditions could be satisfied.
            // This avoids an unnecessary DB round-trip in the common (non-admin) case.
            val supportSynthesis =
                if (
                    userId != null &&
                    resolvedClubContext != null &&
                    requestedClubContext.supplied &&
                    member == null
                ) {
                    checkSupportAccessGrantUseCase.synthesizeHostCurrentMember(
                        userId = userId,
                        email = email,
                        clubId = resolvedClubContext.clubId,
                        clubSlug = resolvedClubContext.slug,
                        clubName = resolvedClubContext.name,
                    )
                } else {
                    null
                }

            val synthesisRequest =
                AuthoritySynthesisRequest(
                    incomingAuthorities = authentication.authorities.mapNotNull { it.authority }.toSet(),
                    email = email,
                    userId = userId,
                    clubContext =
                        ClubContextInput(
                            supplied = requestedClubContext.supplied,
                            clubId = resolvedClubContext?.clubId,
                            clubSlug = resolvedClubContext?.slug,
                            clubName = resolvedClubContext?.name,
                        ),
                    member = member,
                    supportSynthesis = supportSynthesis,
                )

            val result = authoritySynthesisService.synthesize(synthesisRequest)

            // Attach synthesis to request attribute so CurrentMemberArgumentResolver can reuse it
            result.supportSynthesisToAttach?.let { synthesis ->
                request.setAttribute(CheckSupportAccessGrantUseCase.SUPPORT_SYNTHESIS_REQUEST_ATTR, synthesis)
            }

            // Map authority strings → SimpleGrantedAuthority at this infrastructure boundary
            val grantedAuthorities = result.authorities.map { SimpleGrantedAuthority(it) }

            val mappedAuthentication =
                UsernamePasswordAuthenticationToken(
                    authentication.principal ?: authentication.name,
                    authentication.credentials,
                    grantedAuthorities,
                )
            mappedAuthentication.details = authentication.details
            SecurityContextHolder.getContext().authentication = mappedAuthentication
        }

        filterChain.doFilter(request, response)
    }
}
