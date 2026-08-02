package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.InvitationDomainException
import com.readmates.auth.application.service.AuthSessionService
import com.readmates.auth.application.service.GoogleLoginException
import com.readmates.auth.application.service.GoogleLoginService
import com.readmates.auth.application.service.InvitationService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.security.core.Authentication
import org.springframework.security.core.AuthenticationException
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.web.WebAttributes
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.stereotype.Component
import org.springframework.web.util.UriComponentsBuilder
import java.net.URI
import java.util.Locale

@Component
class ReadmatesOAuthSuccessHandler(
    private val googleLoginService: GoogleLoginService,
    private val invitationService: InvitationService,
    private val authSessionService: AuthSessionService,
    private val oauthReturnState: OAuthReturnState,
    @param:Value("\${readmates.app-base-url:http://localhost:3000}")
    private val appBaseUrl: String,
) : AuthenticationSuccessHandler,
    AuthenticationFailureHandler {
    private val appOrigin = readmatesAppOrigin(appBaseUrl)

    override fun onAuthenticationSuccess(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authentication: Authentication,
    ) {
        var signedReturnState: String? = null
        try {
            val oidcUser = authentication.principal as OidcUser
            val context = capturedFlowContext(request)
            val inviteToken = context.inviteToken
            signedReturnState = context.signedReturnState
            val targetClubSlug =
                context.joinClubSlug?.takeIf {
                    it == oauthReturnState.scopedAppClubSlugFromState(signedReturnState)
                }
            val login =
                if (inviteToken != null) {
                    val acceptedMember =
                        invitationService.acceptGoogleInvitation(
                            rawToken = inviteToken,
                            googleSubjectId = oidcUser.subject,
                            email = oidcUser.email,
                            displayName = oidcUser.fullName ?: oidcUser.getClaimAsString("name"),
                            profileImageUrl = oidcUser.getClaimAsString("picture"),
                            expectedClubSlug = oauthReturnState.inviteClubSlugFromReturnState(signedReturnState, inviteToken),
                        )
                    OAuthLoginRedirect(
                        userId = acceptedMember.userId,
                        returnTarget =
                            oauthReturnState.inviteReturnTargetFromState(
                                signedState = signedReturnState,
                                clubSlug = acceptedMember.clubSlug,
                                inviteToken = inviteToken,
                            ) ?: oauthReturnState.inviteReturnTarget(acceptedMember.clubSlug, inviteToken),
                    )
                } else {
                    val loginResult =
                        googleLoginService.loginVerifiedGoogleUserForSession(
                            googleSubjectId = oidcUser.subject,
                            email = oidcUser.email,
                            displayName = oidcUser.fullName ?: oidcUser.getClaimAsString("name"),
                            profileImageUrl = oidcUser.getClaimAsString("picture"),
                            targetClubSlug = targetClubSlug,
                        )
                    OAuthLoginRedirect(
                        userId = loginResult.userId,
                        returnTarget = oauthReturnState.validatedReturnTarget(signedReturnState),
                    )
                }
            val issuedSession =
                authSessionService.issueSession(
                    userId = login.userId.toString(),
                    userAgent = request.getHeader("User-Agent"),
                    ipAddress = request.remoteAddr,
                )

            response.addHeader(HttpHeaders.SET_COOKIE, authSessionService.sessionCookie(issuedSession.rawToken))
            response.sendRedirect(oauthReturnState.redirectUrl(login.returnTarget))
        } catch (exception: RuntimeException) {
            redirectDomainLoginError(request, response, exception, signedReturnState)
        } finally {
            clearServletAuthenticationState(request)
        }
    }

    override fun onAuthenticationFailure(
        request: HttpServletRequest,
        response: HttpServletResponse,
        exception: AuthenticationException,
    ) {
        try {
            val signedReturnState = capturedFlowContext(request).signedReturnState
            redirectToLoginError(
                request,
                response,
                "google",
                oauthReturnState.loginRetryReturnTarget(signedReturnState),
            )
        } finally {
            clearServletAuthenticationState(request)
        }
    }

    private fun redirectDomainLoginError(
        request: HttpServletRequest,
        response: HttpServletResponse,
        exception: RuntimeException,
        signedReturnState: String?,
    ) {
        if (exception !is GoogleLoginException && exception !is InvitationDomainException) {
            throw exception
        }
        val error =
            if (exception is GoogleLoginException && exception.redirectError == "membership-left") {
                "membership-left"
            } else {
                "google"
            }
        redirectToLoginError(
            request,
            response,
            error,
            oauthReturnState.loginRetryReturnTarget(signedReturnState),
        )
    }

    private fun redirectToLoginError(
        request: HttpServletRequest,
        response: HttpServletResponse,
        error: String,
        returnTarget: String? = null,
    ) {
        clearStaleAppSessionCookie(request, response)
        val redirect =
            UriComponentsBuilder
                .fromUriString("$appOrigin/login")
                .queryParam("error", error)
                .apply {
                    if (returnTarget != null) queryParam("returnTo", returnTarget)
                }.build()
                .encode()
                .toUriString()
        response.sendRedirect(redirect)
    }

    private fun clearStaleAppSessionCookie(
        request: HttpServletRequest,
        response: HttpServletResponse,
    ) {
        val rawToken =
            request.cookies
                ?.firstOrNull { it.name == AuthSessionService.COOKIE_NAME }
                ?.value
                ?: return
        if (authSessionService.findValidSession(rawToken) == null) {
            response.addHeader(HttpHeaders.SET_COOKIE, authSessionService.clearedSessionCookie())
        }
    }

    private fun capturedInviteToken(request: HttpServletRequest): String? {
        val session = request.getSession(false) ?: return null
        val inviteToken =
            InviteTokenFormat.normalize(
                session
                    .getAttribute(OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE)
                    ?.toString(),
            )
        session.removeAttribute(OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE)
        return inviteToken
    }

    private fun capturedReturnState(request: HttpServletRequest): String? {
        val session = request.getSession(false) ?: return null
        val signedState = session.getAttribute(OAuthReturnState.SESSION_ATTRIBUTE)?.toString()
        session.removeAttribute(OAuthReturnState.SESSION_ATTRIBUTE)
        return signedState
    }

    private fun capturedGuestJoinClub(request: HttpServletRequest): String? {
        val session = request.getSession(false) ?: return null
        val clubSlug =
            OAuthGuestJoinSession.normalize(
                session.getAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE)?.toString(),
            )
        session.removeAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE)
        return clubSlug
    }

    private fun capturedFlowContext(request: HttpServletRequest): OAuthFlowContext {
        val consumed = OAuthFlowContextRepository.consumeContext(request)
        return when {
            consumed != null -> consumed
            request.getParameter("state") != null -> OAuthFlowContext(null, null, null)
            else ->
                OAuthFlowContext(
                    signedReturnState = capturedReturnState(request),
                    inviteToken = capturedInviteToken(request),
                    joinClubSlug = capturedGuestJoinClub(request),
                )
        }
    }

    private fun clearServletAuthenticationState(request: HttpServletRequest) {
        try {
            OAuthFlowContextRepository.consumeContext(request)
        } finally {
            try {
                SecurityContextHolder.clearContext()
            } finally {
                val session = request.getSession(false) ?: return
                session.removeAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY)
                session.removeAttribute(WebAttributes.AUTHENTICATION_EXCEPTION)
                request.changeSessionId()
            }
        }
    }
}

private data class OAuthLoginRedirect(
    val userId: java.util.UUID,
    val returnTarget: String,
)

internal fun readmatesAppOrigin(appBaseUrl: String): String {
    val rawValue = appBaseUrl.trim().ifEmpty { "http://localhost:3000" }
    val uri =
        try {
            URI.create(rawValue)
        } catch (exception: IllegalArgumentException) {
            throw IllegalArgumentException("readmates.app-base-url must be an http/https origin", exception)
        }
    val scheme = uri.scheme?.lowercase(Locale.ROOT)

    require(scheme == "http" || scheme == "https") {
        "readmates.app-base-url must use http or https"
    }
    require(!uri.host.isNullOrBlank()) {
        "readmates.app-base-url must include a host"
    }
    require(uri.rawUserInfo == null && (uri.rawPath.isNullOrEmpty() || uri.rawPath == "/")) {
        "readmates.app-base-url must be an origin without user info or path"
    }
    require(uri.rawQuery == null && uri.rawFragment == null) {
        "readmates.app-base-url must not include query or fragment"
    }

    return URI(scheme, null, uri.host, uri.port, null, null, null).toString()
}
