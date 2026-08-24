package com.readmates.auth.infrastructure.security

import com.readmates.auth.adapter.`in`.security.AuthClubContextSource
import com.readmates.auth.adapter.`in`.security.resolveAuthClubContext
import com.readmates.auth.application.model.AuthenticatedMemberSnapshot
import com.readmates.auth.application.model.AuthoritySynthesisRequest
import com.readmates.auth.application.model.ClubContextInput
import com.readmates.auth.application.port.`in`.ResolveAuthenticatedPrincipalUseCase
import com.readmates.auth.application.port.`in`.SynthesizeAuthoritiesUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.port.`in`.CheckSupportAccessGrantUseCase
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
import com.readmates.shared.security.HostAuthorityLossCode
import com.readmates.shared.security.HostAuthorityLossContract
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
 * Branching rules (delegated to [SynthesizeAuthoritiesUseCase]):
 * - When [RequestedAuthClubContext.source] is [AuthClubContextSource.SLUG] and the slug is registered,
 *   lookup the member and synthesize
 *   role + host + platform admin authorities.
 * - When [RequestedAuthClubContext.source] is [AuthClubContextSource.SLUG] and the slug is NOT registered
 *   (`supplied=true && context=null`),
 *   the member lookup is intentionally skipped (`member=null`). Authorities are then composed entirely from
 *   platform admin + host support grants. Do NOT add a `member==null` short-circuit guard above this branch;
 *   doing so would silently strip support-grant authorities. See ADR-0013 for context.
 * - When [RequestedAuthClubContext.source] is [AuthClubContextSource.HOST_FALLBACK] or [AuthClubContextSource.NONE],
 *   return an unscoped principal.
 *
 * This filter is in the infrastructure layer: it is allowed to use Spring Security types and
 * adapter types. It maps result authority strings → [SimpleGrantedAuthority] at this boundary.
 */
@Component
class MemberAuthoritiesFilter(
    private val synthesizeAuthoritiesUseCase: SynthesizeAuthoritiesUseCase,
    private val resolveAuthenticatedPrincipalUseCase: ResolveAuthenticatedPrincipalUseCase,
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
            val requestedClubContext = request.resolveAuthClubContext(resolveClubContextUseCase)
            val resolvedClubContext = requestedClubContext.context
            val priorMember = authentication.principal as? CurrentMember

            val member =
                if (requestedClubContext.supplied && resolvedClubContext == null) {
                    null
                } else {
                    resolveAuthenticatedPrincipalUseCase.resolveByEmail(email, resolvedClubContext)
                }

            val authorityLoss =
                request.hostAuthorityLossCode(
                    requestedClubContext.source,
                    resolvedClubContext,
                    priorMember,
                    member,
                )
            request.recordAuthorityLoss(authorityLoss)

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

            val result = synthesizeAuthoritiesUseCase.synthesize(synthesisRequest)

            // Attach synthesis to request attribute so CurrentMemberArgumentResolver can reuse it
            result.supportSynthesisToAttach?.let { synthesis ->
                request.setAttribute(CheckSupportAccessGrantUseCase.SUPPORT_SYNTHESIS_REQUEST_ATTR, synthesis)
            }

            // Map authority strings → SimpleGrantedAuthority at this infrastructure boundary
            val grantedAuthorities =
                result.authorities.toGrantedAuthorities(authorityLoss)

            val mappedAuthentication =
                UsernamePasswordAuthenticationToken(
                    member?.toCurrentMember() ?: authentication.principal ?: authentication.name,
                    authentication.credentials,
                    grantedAuthorities,
                )
            mappedAuthentication.details = authentication.details
            SecurityContextHolder.getContext().authentication = mappedAuthentication
        }

        filterChain.doFilter(request, response)
    }

    private fun AuthenticatedMemberSnapshot.toCurrentMember(): CurrentMember =
        CurrentMember(
            userId = actor.userId,
            membershipId = actor.membershipId,
            clubId = actor.clubId,
            clubSlug = actor.clubSlug,
            email = email,
            displayName = displayName,
            accountName = accountName,
            role = role,
            membershipStatus = membershipStatus,
            clubName = clubName,
            avatarKey = avatarKey,
        )

    private fun HttpServletRequest.hostAuthorityLossCode(
        source: AuthClubContextSource,
        requestedClub: com.readmates.club.application.model.ResolvedClubContext?,
        priorMember: CurrentMember?,
        currentMember: AuthenticatedMemberSnapshot?,
    ): HostAuthorityLossCode? =
        if (isHostApi() && source == AuthClubContextSource.SLUG && requestedClub != null && currentMember != null) {
            classifyHostAuthorityLoss(requestedClub, priorMember, currentMember)
        } else {
            null
        }

    private fun HttpServletRequest.recordAuthorityLoss(code: HostAuthorityLossCode?) {
        code?.let { setAttribute(HostAuthorityLossContract.REQUEST_ATTRIBUTE, it) }
    }

    private fun Set<String>.toGrantedAuthorities(authorityLoss: HostAuthorityLossCode?): List<SimpleGrantedAuthority> =
        filterNot { authorityLoss != null && it == HOST_AUTHORITY }
            .map(::SimpleGrantedAuthority)

    private fun HttpServletRequest.isHostApi(): Boolean = requestURI == HOST_API_ROOT || requestURI.startsWith(HOST_API_PREFIX)

    private companion object {
        const val HOST_API_ROOT = "/api/host"
        const val HOST_API_PREFIX = "/api/host/"
        const val HOST_AUTHORITY = "ROLE_HOST"
    }
}

private fun classifyHostAuthorityLoss(
    requestedClub: com.readmates.club.application.model.ResolvedClubContext,
    priorMember: CurrentMember?,
    currentMember: AuthenticatedMemberSnapshot,
): HostAuthorityLossCode? {
    val priorHost = priorMember?.takeIf { it.userId == currentMember.actor.userId && it.isHost }
    return when {
        priorHost != null && priorHost.clubId != requestedClub.clubId -> HostAuthorityLossCode.CROSS_CLUB_SCOPE
        priorHost != null &&
            currentMember.membershipStatus == MembershipStatus.ACTIVE &&
            currentMember.role != MembershipRole.HOST -> HostAuthorityLossCode.HOST_AUTHORITY_REVOKED
        currentMember.membershipStatus == MembershipStatus.SUSPENDED -> HostAuthorityLossCode.MEMBERSHIP_SUSPENDED
        else -> null
    }
}
