package com.readmates.auth.infrastructure.security

import org.springframework.beans.factory.ObjectProvider
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.web.servlet.FilterRegistrationBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.security.access.hierarchicalroles.RoleHierarchy
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestRedirectFilter
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter
import org.springframework.security.web.authentication.HttpStatusEntryPoint
import org.springframework.security.web.util.matcher.RegexRequestMatcher
import org.springframework.security.web.util.matcher.RequestMatcher
import org.springframework.web.filter.ForwardedHeaderFilter

private val AI_GENERATE_MUTATION_PATH =
    Regex("^/api/host/sessions/[^/]+/ai-generate/jobs/[^/]+/(regenerate|commit)$")

@Configuration
class SecurityConfig(
    private val bffSecretFilter: BffSecretFilter,
    private val sessionCookieAuthenticationFilter: SessionCookieAuthenticationFilter,
    private val rateLimitFilter: RateLimitFilter,
    private val memberAuthoritiesFilter: MemberAuthoritiesFilter,
    private val platformAdminAuthoritiesFilter: PlatformAdminAuthoritiesFilter,
    private val oAuthInviteTokenCaptureFilter: OAuthInviteTokenCaptureFilter,
    private val googleOidcUserService: GoogleOidcUserService,
    private val readmatesOAuthSuccessHandler: ReadmatesOAuthSuccessHandler,
    private val clientRegistrationRepository: ObjectProvider<ClientRegistrationRepository>,
    @param:Value("\${readmates.auth.auth-base-url:\${readmates.app-base-url:http://localhost:3000}}")
    private val authBaseUrl: String,
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
                    methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/session-import/(preview|commit)$")),
                    methodAndPath("POST", Regex("^/api/host/sessions/[^/]+/ai-generate/jobs$")),
                    methodAndPath("POST", AI_GENERATE_MUTATION_PATH),
                    methodAndPath("DELETE", Regex("^/api/host/sessions/[^/]+/ai-generate/jobs/[^/]+$")),
                    methodAndPath("PUT", Regex("^/api/host/clubs/[^/]+/ai-defaults$")),
                    methodAndPath("POST", Regex("^/api/host/invitations/[^/]+/revoke$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/(activate|deactivate-viewer)$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/approve$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/reject$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/(suspend|restore|deactivate)$")),
                    methodAndPath("POST", Regex("^/api/host/members/[^/]+/current-session/(add|remove)$")),
                    methodAndPath("POST", Regex("^/api/host/notifications/process$")),
                    methodAndPath("POST", Regex("^/api/host/notifications/test-mail$")),
                    methodAndPath("POST", Regex("^/api/host/notifications/manual/preview$")),
                    methodAndPath("POST", Regex("^/api/host/notifications/manual$")),
                    methodAndPath("POST", Regex("^/api/host/notifications/items/[^/]+/(retry|restore)$")),
                    methodAndPath("PUT", Regex("^/api/archive/sessions/[^/]+/my-long-review$")),
                    methodAndPath("POST", Regex("^/api/me/membership/leave$")),
                    methodAndPath("PATCH", Regex("^/api/me/profile$")),
                    methodAndPath("PUT", Regex("^/api/me/notifications/preferences$")),
                    methodAndPath("POST", Regex("^/api/me/notifications/[^/]+/read$")),
                    methodAndPath("POST", Regex("^/api/me/notifications/read-all$")),
                    methodAndPath("PATCH", Regex("^/api/host/members/[^/]+/profile$")),
                    methodAndPath("POST", Regex("^/api/invitations/[^/]+/accept$")),
                    methodAndPath("POST", Regex("^/api/clubs/[^/]+/invitations/[^/]+/accept$")),
                    methodAndPath("POST", Regex("^/api/dev/invitations/[^/]+/accept$")),
                    methodAndPath("PATCH", Regex("^/api/admin/clubs/[^/]+$")),
                    methodAndPath("POST", Regex("^/api/admin/clubs/onboarding/preview$")),
                    methodAndPath("POST", Regex("^/api/admin/clubs/onboarding$")),
                    methodAndPath("POST", Regex("^/api/admin/clubs/[^/]+/domains$")),
                    methodAndPath("POST", Regex("^/api/admin/domains/[^/]+/check$")),
                    methodAndPath("POST", Regex("^/api/admin/notifications/replay-preview$")),
                    methodAndPath("POST", Regex("^/api/admin/notifications/replay-confirm$")),
                    methodAndPath("POST", Regex("^/api/admin/support/grants$")),
                    methodAndPath("DELETE", Regex("^/api/admin/support/grants/[^/]+$")),
                    methodAndPath("POST", Regex("^/api/admin/support-access-grants$")),
                    methodAndPath("DELETE", Regex("^/api/admin/support-access-grants/[^/]+$")),
                )
            }.authorizeHttpRequests {
                it
                    .requestMatchers(
                        "/error",
                        "/internal/health",
                        "/api/auth/login",
                        "/api/auth/logout",
                        "/api/dev/login",
                        "/api/dev/logout",
                        "/oauth2/**",
                        "/login/oauth2/**",
                    ).permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/auth/me")
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/public/**")
                    .permitAll()
                    .requestMatchers("/api/invitations/**")
                    .permitAll()
                    .requestMatchers(methodAndPath("GET", Regex("^/api/clubs/[^/]+/invitations/[^/]+$")))
                    .permitAll()
                    .requestMatchers(methodAndPath("POST", Regex("^/api/clubs/[^/]+/invitations/[^/]+/accept$")))
                    .permitAll()
                    .requestMatchers(methodAndPath("POST", Regex("^/api/dev/invitations/[^/]+/accept$")))
                    .permitAll()
                    .requestMatchers(HttpMethod.GET, "/api/sessions/current")
                    .hasRole("VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/sessions/upcoming")
                    .hasRole("VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/archive/**")
                    .hasRole("VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/notes/**")
                    .hasRole("VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/app/me")
                    .hasRole("VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/app/pending", "/api/app/viewer")
                    .hasAuthority("ROLE_VIEWER")
                    .requestMatchers(methodAndPath("PATCH", Regex("^/api/me/profile$")))
                    .authenticated()
                    .requestMatchers(methodAndPath("PATCH", Regex("^/api/host/members/[^/]+/profile$")))
                    .authenticated()
                    .requestMatchers("/api/admin/**")
                    .hasRole("PLATFORM_ADMIN")
                    .requestMatchers("/api/host/**")
                    .hasRole("HOST")
                    .requestMatchers(HttpMethod.GET, "/api/feedback-documents/me")
                    .hasRole("VIEWER")
                    .requestMatchers(RegexRequestMatcher("^/api/sessions/[^/]+/feedback-document$", "GET"))
                    .hasRole("VIEWER")
                    .requestMatchers(HttpMethod.GET, "/api/**")
                    .hasRole("MEMBER")
                    .requestMatchers("/api/**")
                    .hasRole("MEMBER")
                    .anyRequest()
                    .authenticated()
            }.exceptionHandling {
                it.authenticationEntryPoint(HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED))
            }.addFilterBefore(bffSecretFilter, AnonymousAuthenticationFilter::class.java)
            .addFilterBefore(sessionCookieAuthenticationFilter, AnonymousAuthenticationFilter::class.java)
            .addFilterAfter(platformAdminAuthoritiesFilter, SessionCookieAuthenticationFilter::class.java)
            .addFilterAfter(rateLimitFilter, SessionCookieAuthenticationFilter::class.java)
            .addFilterBefore(oAuthForwardedHeaderFilter, OAuth2AuthorizationRequestRedirectFilter::class.java)
            .addFilterBefore(oAuthInviteTokenCaptureFilter, OAuth2AuthorizationRequestRedirectFilter::class.java)
            .addFilterAfter(memberAuthoritiesFilter, AnonymousAuthenticationFilter::class.java)

        val registrations = clientRegistrationRepository.ifAvailable
        if (registrations != null) {
            http.oauth2Login {
                it.authorizationEndpoint { endpoint ->
                    endpoint.authorizationRequestResolver(
                        PrimaryOriginOAuthAuthorizationRequestResolver(registrations, authBaseUrl),
                    )
                }
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
    fun roleHierarchy(): RoleHierarchy =
        RoleHierarchyImpl.fromHierarchy(
            """
            ROLE_PLATFORM_ADMIN > ROLE_MEMBER
            ROLE_HOST > ROLE_MEMBER
            ROLE_MEMBER > ROLE_VIEWER
            """.trimIndent(),
        )

    @Bean
    fun rateLimitFilterRegistration(rateLimitFilter: RateLimitFilter): FilterRegistrationBean<RateLimitFilter> =
        FilterRegistrationBean(rateLimitFilter).apply {
            isEnabled = false
        }
}

private fun methodAndPath(
    method: String,
    pathPattern: Regex,
): RequestMatcher = RequestMatcher { request -> request.method == method && pathPattern.matches(request.requestURI) }
