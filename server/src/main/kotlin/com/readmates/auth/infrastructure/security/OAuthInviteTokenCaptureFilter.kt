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
            val inviteToken = InviteTokenFormat.normalize(request.getParameter("inviteToken"))
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
        }

        filterChain.doFilter(request, response)
    }
}
