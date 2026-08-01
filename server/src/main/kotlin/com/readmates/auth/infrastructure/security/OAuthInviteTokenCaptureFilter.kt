package com.readmates.auth.infrastructure.security

import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class OAuthInviteTokenCaptureFilter(
    private val oauthReturnState: OAuthReturnState,
) : OncePerRequestFilter() {
    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        if (request.method == "GET" && request.requestURI.startsWith("/oauth2/authorization/")) {
            val existingSession = request.getSession(false)
            existingSession?.removeAttribute(OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE)
            existingSession?.removeAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE)
            val rawInviteToken = request.getParameter("inviteToken")
            val inviteToken = InviteTokenFormat.normalize(rawInviteToken)
            if (inviteToken != null) {
                request.session.setAttribute(
                    OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE,
                    inviteToken,
                )
            }

            val signedReturnState = oauthReturnState.signReturnTarget(request.getParameter("returnTo"))
            val session = request.getSession(false)
            if (signedReturnState != null) {
                request.session.setAttribute(OAuthReturnState.SESSION_ATTRIBUTE, signedReturnState)
            } else {
                session?.removeAttribute(OAuthReturnState.SESSION_ATTRIBUTE)
            }

            if (rawInviteToken == null && signedReturnState != null) {
                val signedClubSlug = oauthReturnState.scopedAppClubSlugFromState(signedReturnState)
                val requestedClubSlug = OAuthGuestJoinSession.normalize(request.getParameter("joinClub"))
                if (signedClubSlug != null && requestedClubSlug == signedClubSlug) {
                    request.session.setAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE, signedClubSlug)
                }
            }
        }

        filterChain.doFilter(request, response)
    }
}
