package com.readmates.auth.infrastructure.security

import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.util.matcher.RegexRequestMatcher
import org.springframework.security.web.util.matcher.RequestMatcher
import org.springframework.web.filter.ForwardedHeaderFilter

@Configuration
class SecurityConfig(
    private val bffSecretFilter: BffSecretFilter,
    private val sessionCookieAuthenticationFilter: SessionCookieAuthenticationFilter,
    private val rateLimitFilter: RateLimitFilter,
    private val memberAuthoritiesFilter: MemberAuthoritiesFilter,
    private val oAuthInviteTokenCaptureFilter: OAuthInviteTokenCaptureFilter,
    private val googleOidcUserService: GoogleOidcUserService,
    private val readmatesOAuthSuccessHandler: ReadmatesOAuthSuccessHandler,
    private val clientRegistrationRepository: ObjectProvider<ClientRegistrationRepository>,
) {
    private val oAuthForwardedHeaderFilter = ForwardedHeaderFilter()

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .csrf {
                it.ignoringRequestMatchers(
                    "/api/dev/login",
                    "/api/dev/logout",
                    "/api/auth/login",
                    "/api/auth/logout",
                    "/api/auth/password-reset/**",
                    "/api/sessions/current/rsvp",
                    "/api/sessions/current/checkin",
                    "/api/sessions/current/questions",
                    "/api/sessions/current/reviews",
                    "/api/sessions/current/one-line-reviews",
                    "/api/host/sessions",
                    "/api/host/invitations",
                )
                it.ignoringRequestMatchers(
                    methodAndPath("PATCH", Regex("^/api/host/sessions/[^/]+$")),
                    methodAndPath("PATCH", Regex("^/api/host/sessions/[^/]+/visibility$")),
                    methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/open$")),
                    methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/close$")),
                    methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/publish$")),
                    methodAndPath("DELETE", Regex("^/api/host/sessions/[^/]+$")),
                    methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/attendance$")),
                    methodAndPath("PUT", Regex("^/api/host/sessions/[^/]+/publication$")),
                    methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/feedback-document$")),
                    methodAndPath("POST", Regex("^/api/host/invitations/[^/]+/revoke$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/password-reset$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/(activate|deactivate-viewer)$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/approve$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/reject$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/(suspend|restore|deactivate)$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/current-session/(add|remove)$")),
                    methodAndPath("POST", Regex("^/api/host/notifications/process$")),
                    methodAndPath("POST", Regex("^/api/host/notifications/test-mail$")),
                    methodAndPath("POST", Regex("^/api/host/notifications/items/[^/]+/(retry|restore)$")),
                    methodAndPath("POST", Regex("^/api/me/membership/leave$")),
                    methodAndPath("PATCH", Regex("^/api/me/profile$")),
                    methodAndPath("PUT", Regex("^/api/me/notifications/preferences$")),
                    methodAndPath("PATCH", Regex("^/api/host/members/[^/]+/profile$")),
                    methodAndPath("POST", Regex("^/api/invitations/[^/]+/accept$")),
                    methodAndPath("POST", Regex("^/api/dev/invitations/[^/]+/accept$")),
                )
            }
            .authorizeHttpRequests {
                it.requestMatchers(
                    "/error",
                    "/internal/health",
                    "/api/auth/login",
                    "/api/auth/logout",
                    "/api/auth/password-reset/**",
                    "/api/dev/login",
                    "/api/dev/logout",
                    "/oauth2/**",
                    "/login/oauth2/**",
                ).permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/auth/me").permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/public/**").permitAll()
                    .requestMatchers("/api/invitations/**").permitAll()
                    .requestMatchers(methodAndPath("POST", Regex("^/api/dev/invitations/[^/]+/accept$"))).permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/sessions/current").hasAnyRole("HOST", "MEMBER", "VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/sessions/upcoming").hasAnyRole("HOST", "MEMBER", "VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/archive/**").hasAnyRole("HOST", "MEMBER", "VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/notes/**").hasAnyRole("HOST", "MEMBER", "VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/app/me").hasAnyRole("HOST", "MEMBER", "VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/app/pending", "/api/app/viewer").hasRole("VIEWER")
                    .requestMatchers(methodAndPath("PATCH", Regex("^/api/me/profile$"))).permitAll()
                    .requestMatchers(methodAndPath("PATCH", Regex("^/api/host/members/[^/]+/profile$"))).permitAll()
                    .requestMatchers("/api/host/**").hasRole("HOST")
                    .requestMatchers(HttpMethod.GET, "/api/feedback-documents/me").hasAnyRole("HOST", "MEMBER", "VIEWER")
                    .requestMatchers(RegexRequestMatcher("^/api/sessions/[^/]+/feedback-document$", "GET"))
                    .hasAnyRole("HOST", "MEMBER", "VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/**").hasAnyRole("HOST", "MEMBER")
                    .requestMatchers("/api/**").hasAnyRole("HOST", "MEMBER")
                    .anyRequest().authenticated()
            }
            .exceptionHandling {
                it.authenticationEntryPoint(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
            }
            .addFilterBefore(bffSecretFilter, AnonymousAuthenticationFilter::class.java)
            .addFilterBefore(sessionCookieAuthenticationFilter, AnonymousAuthenticationFilter::class.java)
            .addFilterAfter(rateLimitFilter, SessionCookieAuthenticationFilter::class.java)
            .addFilterBefore(oAuthForwardedHeaderFilter, OAuth2AuthorizationRequestRedirectFilter::class.java)
            .addFilterBefore(oAuthInviteTokenCaptureFilter, OAuth2AuthorizationRequestRedirectFilter::class.java)
            .addFilterAfter(memberAuthoritiesFilter, AnonymousAuthenticationFilter::class.java)

        if (clientRegistrationRepository.ifAvailable != null) {
            http.oauth2Login {
                it.userInfoEndpoint { endpoint ->
                    endpoint.oidcUserService(googleOidcUserService)
                }
                it.successHandler(readmatesOAuthSuccessHandler)
                it.failureHandler(readmatesOAuthSuccessHandler)
            }
        }

        return http.build()
    }

    @Bean
    fun rateLimitFilterRegistration(rateLimitFilter: RateLimitFilter): FilterRegistrationBean<RateLimitFilter> =
        FilterRegistrationBean(rateLimitFilter).apply {
            isEnabled = false
        }
}

private fun methodAndPath(method: String, pathPattern: Regex): RequestMatcher =
    RequestMatcher { request -> request.method == method && pathPattern.matches(request.requestURI) }
