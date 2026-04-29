package com.readmates.auth.infrastructure.security

import jakarta.servlet.http.HttpServletRequest
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest

class PrimaryOriginOAuthAuthorizationRequestResolver(
    clientRegistrationRepository: ClientRegistrationRepository,
    authBaseUrl: String,
) : OAuth2AuthorizationRequestResolver {
    private val delegate = DefaultOAuth2AuthorizationRequestResolver(
        clientRegistrationRepository,
        OAuth2AuthorizationRequestRedirectFilter.DEFAULT_AUTHORIZATION_REQUEST_BASE_URI,
    )
    private val authOrigin = readmatesAppOrigin(authBaseUrl)

    override fun resolve(request: HttpServletRequest): OAuth2AuthorizationRequest? {
        val registrationId = request.registrationIdFromDefaultPath()
        return delegate.resolve(request)?.withPrimaryOriginRedirectUri(registrationId)
    }

    override fun resolve(request: HttpServletRequest, clientRegistrationId: String): OAuth2AuthorizationRequest? =
        delegate.resolve(request, clientRegistrationId)
            ?.withPrimaryOriginRedirectUri(clientRegistrationId)

    private fun OAuth2AuthorizationRequest.withPrimaryOriginRedirectUri(registrationId: String?): OAuth2AuthorizationRequest =
        if (registrationId.isNullOrBlank()) {
            this
        } else {
            OAuth2AuthorizationRequest.from(this)
                .redirectUri("$authOrigin/login/oauth2/code/$registrationId")
                .build()
        }

    private fun HttpServletRequest.registrationIdFromDefaultPath(): String? {
        val prefix = "${OAuth2AuthorizationRequestRedirectFilter.DEFAULT_AUTHORIZATION_REQUEST_BASE_URI}/"
        return requestURI
            .substringAfter(prefix, missingDelimiterValue = "")
            .substringBefore("/")
            .takeIf { it.isNotBlank() }
    }
}
