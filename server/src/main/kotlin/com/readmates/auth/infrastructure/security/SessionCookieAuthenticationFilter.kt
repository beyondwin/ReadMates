package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.auth.application.service.AuthenticatedMemberResolver
import com.readmates.club.adapter.`in`.web.resolveClubContext
import com.readmates.club.application.port.`in`.ResolveClubContextUseCase
import com.readmates.shared.security.CurrentMember
import com.readmates.shared.security.CurrentUser
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
    private val resolveClubContextUseCase: ResolveClubContextUseCase,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val rawToken =
            request.cookies
                ?.firstOrNull { it.name == AuthSessionService.COOKIE_NAME }
                ?.value
                ?.takeIf { it.isNotBlank() }

        if (rawToken != null && SecurityContextHolder.getContext().authentication == null) {
            val session =
                authSessionService
                    .findValidSession(rawToken)
                    ?.takeUnless { it.revoked }

            if (session != null) {
                val requestedClubContext = request.resolveClubContext(resolveClubContextUseCase)
                val member =
                    if (requestedClubContext.supplied && requestedClubContext.context == null) {
                        null
                    } else {
                        authenticatedMemberResolver.resolveByUserId(session.userId, requestedClubContext.context)
                    }
                val authentication =
                    if (member != null) {
                        UsernamePasswordAuthenticationToken(
                            member.email,
                            null,
                            listOf(SimpleGrantedAuthority(member.roleAuthority())),
                        )
                    } else if (request.isOwnProfilePatch()) {
                        authenticatedMemberResolver
                            .resolveProfileByUserId(session.userId)
                            ?.let { profileMember ->
                                UsernamePasswordAuthenticationToken(
                                    profileMember.email,
                                    null,
                                    emptyList(),
                                )
                            }
                    } else if (request.isAuthMeGet() || request.isAdminApi()) {
                        authenticatedMemberResolver
                            .resolveProfileByUserId(session.userId)
                            ?.let { profileMember ->
                                UsernamePasswordAuthenticationToken(
                                    profileMember,
                                    null,
                                    emptyList(),
                                )
                            }
                            ?: authenticatedMemberResolver
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
                        authenticatedMemberResolver
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

    private fun CurrentMember.roleAuthority(): String =
        if (isViewer) {
            "ROLE_VIEWER"
        } else {
            "ROLE_$role"
        }

    private fun HttpServletRequest.isOwnProfilePatch(): Boolean = method == "PATCH" && requestURI == "/api/me/profile"

    private fun HttpServletRequest.isAuthMeGet(): Boolean = method == "GET" && requestURI == "/api/auth/me"

    private fun HttpServletRequest.isAdminApi(): Boolean = requestURI == "/api/admin" || requestURI.startsWith("/api/admin/")

    private fun HttpServletRequest.isHostApi(): Boolean = requestURI == "/api/host" || requestURI.startsWith("/api/host/")
}
