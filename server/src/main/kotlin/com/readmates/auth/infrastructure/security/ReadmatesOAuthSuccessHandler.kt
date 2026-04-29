package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.AuthSessionService
import com.readmates.auth.application.GoogleLoginException
import com.readmates.auth.application.GoogleLoginService
import com.readmates.auth.application.InvitationDomainException
import com.readmates.auth.application.InvitationService
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpHeaders
import org.springframework.security.core.Authentication
import org.springframework.security.core.AuthenticationException
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.authentication.AuthenticationFailureHandler
import org.springframework.security.web.authentication.AuthenticationSuccessHandler
import org.springframework.stereotype.Component
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
) : AuthenticationSuccessHandler, AuthenticationFailureHandler {
    private val appOrigin = readmatesAppOrigin(appBaseUrl)

    override fun onAuthenticationSuccess(
        request: HttpServletRequest,
        response: HttpServletResponse,
        authentication: Authentication,
    ) {
        val oidcUser = authentication.principal as OidcUser
        try {
            val inviteToken = capturedInviteToken(request)
            val signedReturnState = capturedReturnState(request)
            val login = if (inviteToken != null) {
                val acceptedMember = invitationService.acceptGoogleInvitation(
                    rawToken = inviteToken,
                    googleSubjectId = oidcUser.subject,
                    email = oidcUser.email,
                    displayName = oidcUser.fullName ?: oidcUser.getClaimAsString("name"),
                    profileImageUrl = oidcUser.getClaimAsString("picture"),
                )
                OAuthLoginRedirect(
                    userId = acceptedMember.userId,
                    returnTarget = oauthReturnState.inviteReturnTarget(acceptedMember.clubSlug, inviteToken),
                )
            } else {
                val loginResult = googleLoginService.loginVerifiedGoogleUserForSession(
                    googleSubjectId = oidcUser.subject,
                    email = oidcUser.email,
                    displayName = oidcUser.fullName ?: oidcUser.getClaimAsString("name"),
                    profileImageUrl = oidcUser.getClaimAsString("picture"),
                )
                OAuthLoginRedirect(
                    userId = loginResult.userId,
                    returnTarget = oauthReturnState.validatedReturnTarget(signedReturnState),
                )
            }
            val issuedSession = authSessionService.issueSession(
                userId = login.userId.toString(),
                userAgent = request.getHeader("User-Agent"),
                ipAddress = request.remoteAddr,
            )

            response.addHeader(HttpHeaders.SET_COOKIE, authSessionService.sessionCookie(issuedSession.rawToken))
            clearServletAuthenticationState(request)
            response.sendRedirect(oauthReturnState.redirectUrl(login.returnTarget))
        } catch (exception: RuntimeException) {
            if (exception !is GoogleLoginException && exception !is InvitationDomainException) {
                throw exception
            }
            val error = if (exception is GoogleLoginException) {
                exception.redirectError
            } else {
                "google"
            }
            redirectToLoginError(request, response, error)
        }
    }

    override fun onAuthenticationFailure(
        request: HttpServletRequest,
        response: HttpServletResponse,
        exception: AuthenticationException,
    ) {
        redirectToLoginError(request, response, "google")
    }

    private fun redirectToLoginError(request: HttpServletRequest, response: HttpServletResponse, error: String) {
        response.addHeader(HttpHeaders.SET_COOKIE, authSessionService.clearedSessionCookie())
        clearServletAuthenticationState(request)
        response.sendRedirect("$appOrigin/login?error=$error")
    }

    private fun capturedInviteToken(request: HttpServletRequest): String? {
        val session = request.getSession(false) ?: return null
        val inviteToken = InviteTokenFormat.normalize(
            session.getAttribute(OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE)
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

    private fun clearServletAuthenticationState(request: HttpServletRequest) {
        SecurityContextHolder.clearContext()
        request.getSession(false)?.invalidate()
    }
}

private data class OAuthLoginRedirect(
    val userId: java.util.UUID,
    val returnTarget: String,
)

internal fun readmatesAppOrigin(appBaseUrl: String): String {
    val rawValue = appBaseUrl.trim().ifEmpty { "http://localhost:3000" }
    val uri = try {
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
