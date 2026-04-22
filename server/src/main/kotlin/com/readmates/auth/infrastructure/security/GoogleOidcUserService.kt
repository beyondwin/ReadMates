package com.readmates.auth.infrastructure.security

import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest
import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserService
import org.springframework.security.oauth2.core.OAuth2AuthenticationException
import org.springframework.security.oauth2.core.OAuth2Error
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser
import org.springframework.security.oauth2.core.oidc.user.OidcUser
import org.springframework.stereotype.Component

@Component
class GoogleOidcUserService : OidcUserService() {
    override fun loadUser(userRequest: OidcUserRequest): OidcUser {
        val user = super.loadUser(userRequest)
        requireVerifiedEmail(user)
        return DefaultOidcUser(
            user.authorities,
            user.idToken,
            user.userInfo,
            "email",
        )
    }

    private fun requireVerifiedEmail(user: OidcUser) {
        val email = user.claims["email"] as? String
        val emailVerified = when (val claim = user.claims["email_verified"]) {
            is Boolean -> claim
            is String -> claim.equals("true", ignoreCase = true)
            else -> false
        }

        if (email.isNullOrBlank() || !emailVerified) {
            throw OAuth2AuthenticationException(
                OAuth2Error("invalid_user_info", "Google account must provide a verified email", null),
            )
        }
    }
}
