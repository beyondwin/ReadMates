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
    private val delegate =
        DefaultOAuth2AuthorizationRequestResolver(
            clientRegistrationRepository,
            OAuth2AuthorizationRequestRedirectFilter.DEFAULT_AUTHORIZATION_REQUEST_BASE_URI,
        )
    private val authOrigin = readmatesAppOrigin(authBaseUrl)

    override fun resolve(request: HttpServletRequest): OAuth2AuthorizationRequest? {
        val registrationId = request.registrationIdFromDefaultPath()
        return delegate
            .resolve(request)
            ?.withReadmatesAuthorizationParameters(registrationId, request.shouldChooseAccount())
    }

    override fun resolve(
        request: HttpServletRequest,
        clientRegistrationId: String,
    ): OAuth2AuthorizationRequest? =
        delegate
            .resolve(request, clientRegistrationId)
            ?.withReadmatesAuthorizationParameters(clientRegistrationId, request.shouldChooseAccount())

    private fun OAuth2AuthorizationRequest.withReadmatesAuthorizationParameters(
        registrationId: String?,
        chooseAccount: Boolean,
    ): OAuth2AuthorizationRequest {
        if (registrationId.isNullOrBlank()) return this

        val builder =
            OAuth2AuthorizationRequest
                .from(this)
                .redirectUri("$authOrigin/login/oauth2/code/$registrationId")
        if (chooseAccount) {
            builder.additionalParameters(additionalParameters + ("prompt" to "select_account"))
        }
        return builder.build()
    }

    private fun HttpServletRequest.shouldChooseAccount(): Boolean = getParameter("chooseAccount") == "true"

    private fun HttpServletRequest.registrationIdFromDefaultPath(): String? {
        val prefix = "${OAuth2AuthorizationRequestRedirectFilter.DEFAULT_AUTHORIZATION_REQUEST_BASE_URI}/"
        return requestURI
            .substringAfter(prefix, missingDelimiterValue = "")
            .substringBefore("/")
            .takeIf { it.isNotBlank() }
    }
}
