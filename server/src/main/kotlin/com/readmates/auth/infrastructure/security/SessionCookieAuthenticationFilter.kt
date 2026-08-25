package com.readmates.auth.infrastructure.security

import com.readmates.auth.adapter.`in`.security.AuthClubContextSource
import com.readmates.auth.adapter.`in`.security.resolveAuthClubContext
import com.readmates.auth.application.model.AuthenticatedMemberSnapshot
import com.readmates.auth.application.port.`in`.ManageAuthSessionUseCase
import com.readmates.auth.application.port.`in`.ResolveAuthenticatedPrincipalUseCase
import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.club.application.model.ResolvedClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
import com.readmates.shared.security.HostAuthorityLossCode
import com.readmates.shared.security.HostAuthorityLossContract
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpHeaders
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class SessionCookieAuthenticationFilter(
    private val manageAuthSessionUseCase: ManageAuthSessionUseCase,
    private val resolveAuthenticatedPrincipalUseCase: ResolveAuthenticatedPrincipalUseCase,
    private val resolveClubContextUseCase: ResolveClubContextUseCase,
    private val hostAuthorityContextCookie: HostAuthorityContextCookie,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val rawToken =
            request.cookies
                ?.firstOrNull { it.name == manageAuthSessionUseCase.sessionCookieName }
                ?.value
                ?.takeIf { it.isNotBlank() }

        if (rawToken != null && SecurityContextHolder.getContext().authentication == null) {
            val session =
                manageAuthSessionUseCase
                    .findValidSession(rawToken)
                    ?.takeUnless { it.revoked }

            if (session != null) {
                val rawHostAuthorityContext =
                    request.cookies
                        ?.firstOrNull { it.name == HostAuthorityContextCookie.COOKIE_NAME }
                        ?.value
                val priorHostAuthority = hostAuthorityContextCookie.verify(rawHostAuthorityContext, session)
                if (rawHostAuthorityContext != null && priorHostAuthority == null) {
                    response.addHeader(HttpHeaders.SET_COOKIE, hostAuthorityContextCookie.clear())
                }
                val requestedClubContext = request.resolveAuthClubContext(resolveClubContextUseCase)
                val member =
                    if (requestedClubContext.supplied && requestedClubContext.context == null) {
                        null
                    } else {
                        resolveAuthenticatedPrincipalUseCase.resolveByUserId(
                            session.userId,
                            requestedClubContext.context,
                        )
                    }
                val authorityLoss =
                    request.hostAuthorityLossCode(
                        requestedClubContext.source,
                        requestedClubContext.context,
                        priorHostAuthority,
                        member,
                    )
                authorityLoss?.let { request.setAttribute(HostAuthorityLossContract.REQUEST_ATTRIBUTE, it) }
                member
                    ?.takeIf {
                        request.shouldIssueHostAuthorityContext(requestedClubContext.source, it, authorityLoss)
                    }?.let { activeHost ->
                        response.addHeader(
                            HttpHeaders.SET_COOKIE,
                            hostAuthorityContextCookie.issue(session.id, session.expiresAt, activeHost.actor.clubId),
                        )
                    }
                val authentication =
                    if (member != null) {
                        UsernamePasswordAuthenticationToken(
                            member.toCurrentMember(),
                            null,
                            listOf(SimpleGrantedAuthority(member.roleAuthority())),
                        )
                    } else if (request.isOwnProfileMutation()) {
                        resolveAuthenticatedPrincipalUseCase
                            .resolveProfileByUserId(session.userId)
                            ?.let { profileMember ->
                                UsernamePasswordAuthenticationToken(
                                    profileMember.toCurrentMember(),
                                    null,
                                    emptyList(),
                                )
                            }
                    } else if (request.isAuthMeGet() || request.isAdminApi()) {
                        resolveAuthenticatedPrincipalUseCase
                            .resolveProfileByUserId(session.userId)
                            ?.let { profileMember ->
                                UsernamePasswordAuthenticationToken(
                                    profileMember.toCurrentMember(),
                                    null,
                                    emptyList(),
                                )
                            }
                            ?: resolveAuthenticatedPrincipalUseCase
                                .resolveUserById(session.userId)
                                ?.let { currentUser ->
                                    UsernamePasswordAuthenticationToken(
                                        currentUser,
                                        null,
                                        emptyList(),
                                    )
                                }
                    } else if (request.isHostApi()) {
                        // Platform admins hitting /api/host/** have no club membership, but may have a support grant.
                        // Emit a CurrentUser principal with no authorities; MemberAuthoritiesFilter will add ROLE_HOST
                        // if an active HOST_SUPPORT_READ grant exists for this request's club context.
                        resolveAuthenticatedPrincipalUseCase
                            .resolveUserById(session.userId)
                            ?.let { currentUser ->
                                UsernamePasswordAuthenticationToken(
                                    currentUser,
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

    private fun AuthenticatedMemberSnapshot.roleAuthority(): String =
        if (membershipStatus == MembershipStatus.VIEWER) {
            "ROLE_VIEWER"
        } else {
            "ROLE_$role"
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

    private fun HttpServletRequest.isOwnProfileMutation(): Boolean =
        (method == "PATCH" && requestURI in setOf("/api/me/profile", "/api/me/avatar")) ||
            (method == "PUT" && requestURI == "/api/me/profile")

    private fun HttpServletRequest.isAuthMeGet(): Boolean = method == "GET" && requestURI == "/api/auth/me"

    private fun HttpServletRequest.isAdminApi(): Boolean = requestURI == "/api/admin" || requestURI.startsWith("/api/admin/")

    private fun HttpServletRequest.isHostApi(): Boolean = requestURI == "/api/host" || requestURI.startsWith("/api/host/")

    private fun HttpServletRequest.hostAuthorityLossCode(
        source: AuthClubContextSource,
        requestedClub: ResolvedClubContext?,
        priorHostAuthority: VerifiedHostAuthorityContext?,
        currentMember: AuthenticatedMemberSnapshot?,
    ): HostAuthorityLossCode? {
        if (!isHostApi() || source != AuthClubContextSource.SLUG || requestedClub == null) {
            return null
        }
        return when {
            currentMember?.membershipStatus == MembershipStatus.SUSPENDED -> HostAuthorityLossCode.MEMBERSHIP_SUSPENDED
            priorHostAuthority?.clubId == requestedClub.clubId && !currentMember.isActiveHost() ->
                HostAuthorityLossCode.HOST_AUTHORITY_REVOKED
            !isSafeMethod() &&
                priorHostAuthority != null &&
                priorHostAuthority.clubId != requestedClub.clubId &&
                currentMember != null -> HostAuthorityLossCode.CROSS_CLUB_SCOPE
            else -> null
        }
    }

    private fun HttpServletRequest.shouldIssueHostAuthorityContext(
        source: AuthClubContextSource,
        currentMember: AuthenticatedMemberSnapshot,
        authorityLoss: HostAuthorityLossCode?,
    ): Boolean =
        isHostApi() &&
            source == AuthClubContextSource.SLUG &&
            currentMember.isActiveHost() &&
            authorityLoss == null

    private fun HttpServletRequest.isSafeMethod(): Boolean = method in SAFE_METHODS

    private fun AuthenticatedMemberSnapshot?.isActiveHost(): Boolean =
        this?.role == MembershipRole.HOST && membershipStatus == MembershipStatus.ACTIVE

    private companion object {
        val SAFE_METHODS = setOf("GET", "HEAD", "OPTIONS")
    }
}
