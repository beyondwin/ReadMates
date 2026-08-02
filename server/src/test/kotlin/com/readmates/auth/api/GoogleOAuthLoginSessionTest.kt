package com.readmates.auth.api

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.auth.application.service.InvitationTokenService
import com.readmates.auth.domain.BookClubAvatarKey
import com.readmates.auth.infrastructure.security.OAuthFlowContextRepository
import com.readmates.auth.infrastructure.security.OAuthGuestJoinSession
import com.readmates.auth.infrastructure.security.OAuthInviteTokenSession
import com.readmates.auth.infrastructure.security.OAuthJoinIntentStore
import com.readmates.auth.infrastructure.security.OAuthReturnState
import com.readmates.auth.infrastructure.security.ReadmatesOAuthSuccessHandler
import com.readmates.auth.infrastructure.security.readmatesAppOrigin
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.HttpHeaders
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.authentication.BadCredentialsException
import org.springframework.security.authentication.TestingAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.core.oidc.StandardClaimNames
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.web.util.UriComponentsBuilder
import org.springframework.web.util.UriUtils
import java.nio.charset.StandardCharsets
import java.time.Instant

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.app-base-url=https://readmates.pages.dev",
        "readmates.auth.auth-base-url=https://auth.readmates.example",
        "readmates.auth.session-cookie-domain=.readmates.example",
        "spring.security.oauth2.client.registration.google.client-id=test-client",
        "spring.security.oauth2.client.registration.google.client-secret=test-secret",
        "spring.security.oauth2.client.registration.google.scope=openid,email,profile",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [GoogleOAuthLoginSessionTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [GoogleOAuthLoginSessionTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class GoogleOAuthLoginSessionTest(
    @param:Autowired private val successHandler: ReadmatesOAuthSuccessHandler,
    @param:Autowired private val oauthReturnState: OAuthReturnState,
    @param:Autowired private val flowRepository: OAuthFlowContextRepository,
    @param:Autowired private val joinIntentStore: OAuthJoinIntentStore,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val invitationTokenService: InvitationTokenService,
) : ReadmatesMySqlIntegrationTestSupport() {
    @AfterEach
    fun clearSecurityContext() {
        SecurityContextHolder.clearContext()
    }

    @Test
    fun `successful google login issues readmates session cookie and redirects to app`() {
        createGoogleMember(
            googleSubjectId = "google-oauth-session-existing",
            email = "oauth.session@example.com",
            displayName = "OAuth Session",
        )
        val servletSession = securitySession()
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.addHeader(HttpHeaders.USER_AGENT, "MockMvc")
        request.remoteAddr = "127.0.0.1"
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    googleSubjectId = "google-oauth-session-existing",
                    email = "oauth.session@example.com",
                    name = "OAuth Session",
                ),
                "credentials",
            )
        SecurityContextHolder.getContext().authentication = authentication

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://readmates.pages.dev/app", response.redirectedUrl)
        val setCookie = response.getHeader(HttpHeaders.SET_COOKIE)
        assertNotNull(setCookie)
        assertTrue(setCookie!!.startsWith("${AuthSessionService.COOKIE_NAME}="))
        assertTrue(setCookie.contains("Domain=.readmates.example"))
        assertFalse(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)
    }

    @Test
    fun `successful google login redirects to signed return target`() {
        createGoogleMember(
            googleSubjectId = "google-oauth-session-return-target",
            email = "oauth.session.return@example.com",
            displayName = "OAuth Return Target",
        )
        val servletSession = securitySession()
        servletSession.setAttribute(
            OAuthReturnState.SESSION_ATTRIBUTE,
            oauthReturnState.signReturnTarget("/clubs/reading-sai/app/sessions/current"),
        )
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.addHeader(HttpHeaders.USER_AGENT, "MockMvc")
        request.remoteAddr = "127.0.0.1"
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    googleSubjectId = "google-oauth-session-return-target",
                    email = "oauth.session.return@example.com",
                    name = "OAuth Return Target",
                ),
                "credentials",
            )
        SecurityContextHolder.getContext().authentication = authentication

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://readmates.pages.dev/clubs/reading-sai/app/sessions/current", response.redirectedUrl)
        val setCookie = response.getHeader(HttpHeaders.SET_COOKIE)
        assertNotNull(setCookie)
        assertTrue(setCookie!!.startsWith("${AuthSessionService.COOKIE_NAME}="))
        assertFalse(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)
    }

    @Test
    fun `explicit signed target creates viewer only in that public club`() {
        val servletSession = securitySession()
        servletSession.setAttribute(
            OAuthReturnState.SESSION_ATTRIBUTE,
            oauthReturnState.signReturnTarget("/clubs/sample-book-club/app/archive?tab=all#session-1"),
        )
        servletSession.setAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE, "sample-book-club")
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser("google-oauth-guest-join-target", "oauth.guest.join.target@example.com", "Guest Target"),
                "credentials",
            )

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals(
            "https://readmates.pages.dev/clubs/sample-book-club/app/archive?tab=all#session-1",
            response.redirectedUrl,
        )
        assertEquals(
            listOf("sample-book-club:VIEWER"),
            membershipStates("oauth.guest.join.target@example.com"),
        )
        val names =
            jdbcTemplate.queryForMap(
                """
                select users.id as user_id, users.name as account_name, memberships.short_name as membership_name
                from users
                join memberships on memberships.user_id = users.id
                join clubs on clubs.id = memberships.club_id
                where users.email = ? and clubs.slug = ?
                """.trimIndent(),
                "oauth.guest.join.target@example.com",
                "sample-book-club",
            )
        assertEquals("Guest Target", names["account_name"])
        assertTrue(names["membership_name"] != names["account_name"])
        assertTrue(names["membership_name"].toString().startsWith("둘러보기-"))
        assertTrue(!names["membership_name"].toString().contains(names["user_id"].toString().take(8)))
        assertFalse(servletSession.isInvalid)
    }

    @Test
    fun `generic google login creates an authenticated account without unintended membership`() {
        val servletSession = securitySession()
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    "google-oauth-guest-join-generic",
                    "oauth.guest.join.generic@example.com",
                    "Guest Generic",
                ),
                "credentials",
            )

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://readmates.pages.dev/app", response.redirectedUrl)
        assertTrue(response.getHeader(HttpHeaders.SET_COOKIE)!!.startsWith("${AuthSessionService.COOKIE_NAME}="))
        assertEquals(emptyList<String>(), membershipStates("oauth.guest.join.generic@example.com"))
        assertFalse(servletSession.isInvalid)
    }

    @Test
    fun `mismatched guest join session cannot enroll a different signed return club`() {
        val servletSession = securitySession()
        servletSession.setAttribute(
            OAuthReturnState.SESSION_ATTRIBUTE,
            oauthReturnState.signReturnTarget("/clubs/reading-sai/app"),
        )
        servletSession.setAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE, "sample-book-club")
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    "google-oauth-guest-join-mismatch",
                    "oauth.guest.join.mismatch@example.com",
                    "Guest Mismatch",
                ),
                "credentials",
            )

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://readmates.pages.dev/clubs/reading-sai/app", response.redirectedUrl)
        assertEquals(emptyList<String>(), membershipStates("oauth.guest.join.mismatch@example.com"))
        assertFalse(servletSession.isInvalid)
    }

    @Test
    fun `noncanonical signed scoped paths cannot enroll their resolved club`() {
        listOf(
            Triple(
                "/clubs/other/../sample-book-club/app",
                "google-oauth-guest-join-dot-path",
                "oauth.guest.join.dot.path@example.com",
            ),
            Triple(
                "/clubs/sample%2Dbook%2Dclub/app",
                "google-oauth-guest-join-encoded-path",
                "oauth.guest.join.encoded.path@example.com",
            ),
        ).forEach { (returnTo, googleSubjectId, email) ->
            val servletSession = securitySession()
            servletSession.setAttribute(
                OAuthReturnState.SESSION_ATTRIBUTE,
                oauthReturnState.signReturnTarget(returnTo),
            )
            servletSession.setAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE, "sample-book-club")
            val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
            request.setSession(servletSession)
            val response = MockHttpServletResponse()
            val authentication =
                TestingAuthenticationToken(
                    googleOidcUser(googleSubjectId, email, "Noncanonical Guest Join"),
                    "credentials",
                )

            successHandler.onAuthenticationSuccess(request, response, authentication)

            assertEquals(emptyList<String>(), membershipStates(email))
            assertFalse(servletSession.isInvalid)
        }
    }

    @Test
    fun `successful google login falls back to app for invalid return state`() {
        createGoogleMember(
            googleSubjectId = "google-oauth-invalid-return-state",
            email = "oauth.invalid.return@example.com",
            displayName = "OAuth Invalid Return",
        )
        val servletSession = securitySession()
        servletSession.setAttribute(OAuthReturnState.SESSION_ATTRIBUTE, "not-a-valid-state")
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.addHeader(HttpHeaders.USER_AGENT, "MockMvc")
        request.remoteAddr = "127.0.0.1"
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    googleSubjectId = "google-oauth-invalid-return-state",
                    email = "oauth.invalid.return@example.com",
                    name = "OAuth Invalid Return",
                ),
                "credentials",
            )
        SecurityContextHolder.getContext().authentication = authentication

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://readmates.pages.dev/app", response.redirectedUrl)
        val setCookie = response.getHeader(HttpHeaders.SET_COOKIE)
        assertNotNull(setCookie)
        assertTrue(setCookie!!.startsWith("${AuthSessionService.COOKIE_NAME}="))
        assertFalse(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)
    }

    @Test
    fun `successful google login issues readmates session cookie for platform admin without membership`() {
        val userId =
            createPlatformAdminUser(
                googleSubjectId = "google-oauth-platform-admin",
                email = "oauth.platform.admin@example.com",
                displayName = "OAuth Platform Admin",
            )
        val servletSession = securitySession()
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.addHeader(HttpHeaders.USER_AGENT, "MockMvc")
        request.remoteAddr = "127.0.0.1"
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    googleSubjectId = "google-oauth-platform-admin",
                    email = "oauth.platform.admin@example.com",
                    name = "OAuth Platform Admin",
                ),
                "credentials",
            )
        SecurityContextHolder.getContext().authentication = authentication

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://readmates.pages.dev/app", response.redirectedUrl)
        val setCookie = response.getHeader(HttpHeaders.SET_COOKIE)
        assertNotNull(setCookie)
        assertTrue(setCookie!!.startsWith("${AuthSessionService.COOKIE_NAME}="))
        assertFalse(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)

        val issuedSessionCount =
            jdbcTemplate.queryForObject(
                "select count(*) from auth_sessions where user_id = ?",
                Int::class.java,
                userId,
            )
        assertEquals(1, issuedSessionCount)
        val membershipCount =
            jdbcTemplate.queryForObject(
                "select count(*) from memberships where user_id = ?",
                Int::class.java,
                userId,
            )
        assertEquals(0, membershipCount)
    }

    @Test
    fun `unexpected principal failure cleans exactly once and preserves another pending oauth state`() {
        val session = securitySession()
        saveJoinFlow(session, "state-alpha", "reading-sai")
        saveJoinFlow(session, "state-beta", "sample-book-club")
        val callback = countingCallback(session, "state-beta")
        assertNotNull(flowRepository.removeAuthorizationRequest(callback, MockHttpServletResponse()))
        val authentication = TestingAuthenticationToken("not-an-oidc-user", "credentials")
        SecurityContextHolder.getContext().authentication = authentication
        val response = MockHttpServletResponse()

        assertThrows<ClassCastException> {
            successHandler.onAuthenticationSuccess(callback, response, authentication)
        }

        assertEquals(1, callback.sessionIdChangeCount)
        assertNull(SecurityContextHolder.getContext().authentication)
        assertNull(session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY))
        assertNull(OAuthFlowContextRepository.consumedContext(callback))
        assertNotNull(loadFlow(session, "state-alpha"))
        assertNull(removeFlow(session, "state-beta"))
        assertNull(response.getHeader(HttpHeaders.SET_COOKIE))
    }

    @Test
    fun `unexpected success body failure rethrows after one cleanup without issuing a cookie`() {
        createGoogleMember(
            googleSubjectId = "google-oauth-unexpected-body",
            email = "oauth.unexpected.body@example.com",
            displayName = "OAuth Unexpected Body",
        )
        val session = securitySession()
        saveJoinFlow(session, "state-alpha", "reading-sai")
        saveJoinFlow(session, "state-beta", "sample-book-club")
        val callback = countingCallback(session, "state-beta")
        assertNotNull(flowRepository.removeAuthorizationRequest(callback, MockHttpServletResponse()))
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    "google-oauth-unexpected-body",
                    "oauth.unexpected.body@example.com",
                    "OAuth Unexpected Body",
                ),
                "credentials",
            )
        SecurityContextHolder.getContext().authentication = authentication
        val response = RejectingSetCookieResponse()

        assertThrows<IllegalStateException> {
            successHandler.onAuthenticationSuccess(callback, response, authentication)
        }

        assertEquals(1, callback.sessionIdChangeCount)
        assertNull(SecurityContextHolder.getContext().authentication)
        assertNull(session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY))
        assertNull(OAuthFlowContextRepository.consumedContext(callback))
        assertNotNull(loadFlow(session, "state-alpha"))
        assertNull(removeFlow(session, "state-beta"))
        assertNull(response.getHeader(HttpHeaders.SET_COOKIE))
    }

    @Test
    fun `expected google account link failure preserves a valid existing app session`() {
        createGoogleMember(
            googleSubjectId = "google-oauth-conflict-subject",
            email = "oauth.owner@example.com",
            displayName = "OAuth Owner",
        )
        val existing = issueSeededHostSession()
        try {
            val servletSession = securitySession()
            val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
            request.setSession(servletSession)
            request.setCookies(existing.cookie)
            val response = MockHttpServletResponse()
            val authentication =
                TestingAuthenticationToken(
                    googleOidcUser(
                        googleSubjectId = "google-oauth-conflict-subject",
                        email = "oauth.other@example.com",
                        name = "OAuth Other",
                    ),
                    "credentials",
                )
            SecurityContextHolder.getContext().authentication = authentication

            successHandler.onAuthenticationSuccess(request, response, authentication)

            assertEquals("https://readmates.pages.dev/login?error=google", response.redirectedUrl)
            assertNull(response.getHeader(HttpHeaders.SET_COOKIE))
            assertFalse(servletSession.isInvalid)
            assertNull(SecurityContextHolder.getContext().authentication)
            assertSeededHostSessionRemainsAuthenticated(existing.cookie)
        } finally {
            authSessionService.revokeSession(existing.rawToken)
        }
    }

    @Test
    fun `left google member redirects to membership left login error and clears auth state`() {
        createGoogleMember(
            googleSubjectId = "google-oauth-left-member",
            email = "oauth.left@example.com",
            displayName = "OAuth Left Member",
            status = "LEFT",
        )
        val servletSession = securitySession()
        servletSession.setAttribute(
            OAuthReturnState.SESSION_ATTRIBUTE,
            oauthReturnState.signReturnTarget("/clubs/reading-sai/app/sessions/current"),
        )
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    googleSubjectId = "google-oauth-left-member",
                    email = "oauth.left@example.com",
                    name = "OAuth Left Member",
                ),
                "credentials",
            )
        SecurityContextHolder.getContext().authentication = authentication

        successHandler.onAuthenticationSuccess(request, response, authentication)

        val redirect = UriComponentsBuilder.fromUriString(response.redirectedUrl!!).build()
        assertEquals("membership-left", redirect.queryParams.getFirst("error"))
        assertEquals("/clubs/reading-sai/app/sessions/current", redirect.queryParams.getFirst("returnTo"))
        assertNull(response.getHeader(HttpHeaders.SET_COOKIE))
        assertFalse(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)
    }

    @Test
    fun `google authentication failure preserves safe return context without exposing exception`() {
        val safeReturnTarget = "/clubs/reading-sai/app?from=login#note"
        val servletSession = securitySession()
        servletSession.setAttribute(
            OAuthReturnState.SESSION_ATTRIBUTE,
            oauthReturnState.signReturnTarget(safeReturnTarget),
        )
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.setSession(servletSession)
        val response = MockHttpServletResponse()

        successHandler.onAuthenticationFailure(
            request,
            response,
            BadCredentialsException("provider detail must remain private"),
        )

        val redirect = UriComponentsBuilder.fromUriString(response.redirectedUrl!!).build()
        assertEquals(setOf("error", "returnTo"), redirect.queryParams.keys)
        assertNull(redirect.fragment)
        assertEquals("google", redirect.queryParams.getFirst("error"))
        assertEquals(
            listOf(safeReturnTarget),
            redirect.queryParams["returnTo"]?.map { UriUtils.decode(it, StandardCharsets.UTF_8) },
        )
        assertTrue(response.redirectedUrl!!.contains("provider detail").not())
        assertFalse(servletSession.isInvalid)
    }

    @Test
    fun `google authentication failure omits invalid and invite return context`() {
        listOf(
            requireNotNull(oauthReturnState.signReturnTarget("/clubs/reading-sai/invite/example")),
            "not-a-valid-state",
        ).forEach { signedReturnState ->
            val servletSession = securitySession()
            servletSession.setAttribute(OAuthReturnState.SESSION_ATTRIBUTE, signedReturnState)
            val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
            request.setSession(servletSession)
            val response = MockHttpServletResponse()

            successHandler.onAuthenticationFailure(
                request,
                response,
                BadCredentialsException("provider detail must remain private"),
            )

            val redirect = UriComponentsBuilder.fromUriString(response.redirectedUrl!!).build()
            assertEquals("google", redirect.queryParams.getFirst("error"))
            assertNull(redirect.queryParams.getFirst("returnTo"))
            assertTrue(response.redirectedUrl!!.contains("provider detail").not())
            assertFalse(servletSession.isInvalid)
        }
    }

    @Test
    fun `provider cancel for another club preserves a valid existing app session`() {
        val existing = issueSeededHostSession()
        try {
            val session = securitySession()
            saveJoinFlow(session, "state-target", "sample-book-club")
            val callback = consumeFlow(session, "state-target").apply { setCookies(existing.cookie) }
            val response = MockHttpServletResponse()

            successHandler.onAuthenticationFailure(
                callback,
                response,
                BadCredentialsException("provider cancel"),
            )

            assertNull(response.getHeader(HttpHeaders.SET_COOKIE))
            assertNotNull(authSessionService.findValidSession(existing.rawToken))
            assertSeededHostSessionRemainsAuthenticated(existing.cookie)
        } finally {
            authSessionService.revokeSession(existing.rawToken)
        }
    }

    @Test
    fun `anonymous provider failure stays anonymous while stale cookie is explicitly expired`() {
        val anonymousSession = securitySession()
        val anonymousRequest =
            MockHttpServletRequest("GET", "/login/oauth2/code/google").apply {
                setSession(anonymousSession)
            }
        val anonymousResponse = MockHttpServletResponse()

        successHandler.onAuthenticationFailure(
            anonymousRequest,
            anonymousResponse,
            BadCredentialsException("provider cancel"),
        )

        assertNull(anonymousResponse.getHeader(HttpHeaders.SET_COOKIE))
        assertAuthMeAnonymous()

        val staleCookie = Cookie(AuthSessionService.COOKIE_NAME, "stale-test-token")
        val staleSession = securitySession()
        val staleRequest =
            MockHttpServletRequest("GET", "/login/oauth2/code/google").apply {
                setSession(staleSession)
                setCookies(staleCookie)
            }
        val staleResponse = MockHttpServletResponse()

        successHandler.onAuthenticationFailure(
            staleRequest,
            staleResponse,
            BadCredentialsException("provider cancel"),
        )

        assertTrue(
            staleResponse
                .getHeader(HttpHeaders.SET_COOKIE)
                ?.startsWith("${AuthSessionService.COOKIE_NAME}=;") == true,
        )
        assertAuthMeAnonymous(staleCookie)
    }

    @Test
    fun `oauth success then another tab failure preserves the newly issued app session`() {
        val session = securitySession()
        saveJoinFlow(session, "state-alpha", "reading-sai")
        saveJoinFlow(session, "state-beta", "sample-book-club")
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    "google-oauth-success-then-failure",
                    "oauth.success.then.failure@example.com",
                    "OAuth Success Then Failure",
                ),
                "credentials",
            )

        val betaCallback = consumeFlow(session, "state-beta")
        val betaResponse = MockHttpServletResponse()
        successHandler.onAuthenticationSuccess(betaCallback, betaResponse, authentication)
        val issuedRawToken = readmatesCookieValue(betaResponse)
        val issuedCookie = Cookie(AuthSessionService.COOKIE_NAME, issuedRawToken)
        assertNotNull(authSessionService.findValidSession(issuedRawToken))

        val alphaCallback = consumeFlow(session, "state-alpha").apply { setCookies(issuedCookie) }
        val alphaResponse = MockHttpServletResponse()
        successHandler.onAuthenticationFailure(
            alphaCallback,
            alphaResponse,
            BadCredentialsException("provider cancel"),
        )

        assertNull(alphaResponse.getHeader(HttpHeaders.SET_COOKIE))
        assertNotNull(authSessionService.findValidSession(issuedRawToken))
        mockMvc
            .get("/api/auth/me") {
                cookie(issuedCookie)
                param("clubSlug", "sample-book-club")
            }.andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.membershipStatus") { value("VIEWER") }
            }
    }

    @Test
    fun `reverse order oauth successes preserve the remaining state and join each exact club`() {
        val session = securitySession()
        saveJoinFlow(session, "state-alpha", "reading-sai")
        saveJoinFlow(session, "state-beta", "sample-book-club")
        val originalSessionId = session.id
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    "google-oauth-multitab-success",
                    "oauth.multitab.success@example.com",
                    "OAuth Multi Tab Success",
                ),
                "credentials",
            )

        val betaCallback = consumeFlow(session, "state-beta")
        val betaResponse = MockHttpServletResponse()
        successHandler.onAuthenticationSuccess(betaCallback, betaResponse, authentication)

        assertEquals("https://readmates.pages.dev/clubs/sample-book-club/app", betaResponse.redirectedUrl)
        assertFalse(session.isInvalid)
        assertNotEquals(originalSessionId, session.id)
        assertNull(session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY))
        assertNull(OAuthFlowContextRepository.consumedContext(betaCallback))
        assertNotNull(loadFlow(session, "state-alpha"))
        assertNull(removeFlow(session, "state-beta"))

        val alphaCallback = consumeFlow(session, "state-alpha")
        val alphaResponse = MockHttpServletResponse()
        successHandler.onAuthenticationSuccess(alphaCallback, alphaResponse, authentication)

        assertEquals("https://readmates.pages.dev/clubs/reading-sai/app", alphaResponse.redirectedUrl)
        assertNull(OAuthFlowContextRepository.consumedContext(alphaCallback))
        assertNull(loadFlow(session, "state-alpha"))
        assertEquals(
            listOf("reading-sai:VIEWER", "sample-book-club:VIEWER"),
            membershipStates("oauth.multitab.success@example.com"),
        )
    }

    @Test
    fun `oauth failure preserves another pending state for exact later success`() {
        val session = securitySession()
        saveJoinFlow(session, "state-alpha", "reading-sai")
        saveJoinFlow(session, "state-beta", "sample-book-club")
        val originalSessionId = session.id

        val betaCallback = consumeFlow(session, "state-beta")
        val betaResponse = MockHttpServletResponse()
        successHandler.onAuthenticationFailure(
            betaCallback,
            betaResponse,
            BadCredentialsException("provider failure"),
        )

        assertEquals(
            "/clubs/sample-book-club/app",
            UriComponentsBuilder
                .fromUriString(betaResponse.redirectedUrl!!)
                .build()
                .queryParams
                .getFirst("returnTo"),
        )
        assertFalse(session.isInvalid)
        assertNotEquals(originalSessionId, session.id)
        assertNull(OAuthFlowContextRepository.consumedContext(betaCallback))
        assertNotNull(loadFlow(session, "state-alpha"))
        assertNull(removeFlow(session, "state-beta"))

        val alphaCallback = consumeFlow(session, "state-alpha")
        val alphaResponse = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    "google-oauth-multitab-failure",
                    "oauth.multitab.failure@example.com",
                    "OAuth Multi Tab Failure",
                ),
                "credentials",
            )
        successHandler.onAuthenticationSuccess(alphaCallback, alphaResponse, authentication)

        assertEquals("https://readmates.pages.dev/clubs/reading-sai/app", alphaResponse.redirectedUrl)
        assertEquals(
            listOf("reading-sai:VIEWER"),
            membershipStates("oauth.multitab.failure@example.com"),
        )
        assertNull(OAuthFlowContextRepository.consumedContext(alphaCallback))
        assertNull(loadFlow(session, "state-alpha"))
    }

    @Test
    fun `successful google invite login accepts invitation and issues readmates session`() {
        val token =
            createInvitation(
                token = "oauthInviteAcceptToken00000000000000000000000000",
                email = "oauth.invited@example.com",
                name = "OAuth Invited",
            )
        createOpenSession()
        val servletSession = securitySession()
        servletSession.setAttribute(OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE, token)
        servletSession.setAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE, "sample-book-club")
        servletSession.setAttribute(
            OAuthReturnState.SESSION_ATTRIBUTE,
            oauthReturnState.signReturnTarget("/clubs/reading-sai/invite/$token"),
        )
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.addHeader(HttpHeaders.USER_AGENT, "MockMvc")
        request.remoteAddr = "127.0.0.1"
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    googleSubjectId = "google-oauth-invited",
                    email = "oauth.invited@example.com",
                    name = "OAuth Invited",
                ),
                "credentials",
            )
        SecurityContextHolder.getContext().authentication = authentication

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://readmates.pages.dev/clubs/reading-sai/invite/$token", response.redirectedUrl)
        val setCookie = response.getHeader(HttpHeaders.SET_COOKIE)
        assertNotNull(setCookie)
        assertTrue(setCookie!!.startsWith("${AuthSessionService.COOKIE_NAME}="))
        assertFalse(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)

        val invitation =
            jdbcTemplate.queryForMap(
                "select status, accepted_user_id from invitations where invited_email = ?",
                "oauth.invited@example.com",
            )
        assertEquals("ACCEPTED", invitation["status"])
        assertNotNull(invitation["accepted_user_id"])

        val memberState =
            jdbcTemplate.queryForMap(
                """
                select users.google_subject_id,
                       users.auth_provider,
                       users.last_login_at,
                       memberships.status,
                       memberships.avatar_key
                from users
                join memberships on memberships.user_id = users.id
                where users.email = ?
                """.trimIndent(),
                "oauth.invited@example.com",
            )
        assertEquals("google-oauth-invited", memberState["google_subject_id"])
        assertEquals("GOOGLE", memberState["auth_provider"])
        assertEquals("ACTIVE", memberState["status"])
        assertNotNull(BookClubAvatarKey.fromWireValue(memberState["avatar_key"] as? String))
        assertNotNull(memberState["last_login_at"])

        val participantCount =
            jdbcTemplate.queryForObject(
                """
                select count(*)
                from session_participants
                join sessions on sessions.id = session_participants.session_id
                join memberships on memberships.id = session_participants.membership_id
                join users on users.id = memberships.user_id
                where users.email = ?
                  and sessions.state = 'OPEN'
                """.trimIndent(),
                Int::class.java,
                "oauth.invited@example.com",
            )
        assertEquals(1, participantCount)
        assertEquals(listOf("reading-sai:ACTIVE"), membershipStates("oauth.invited@example.com"))
    }

    @Test
    fun `google invite login rejects mismatched return club without accepting invitation`() {
        val token =
            createInvitation(
                token = "oauthInviteWrongClubToken00000000000000000000000",
                email = "oauth.invite.wrong.club@example.com",
                name = "OAuth Wrong Club",
            )
        val servletSession = securitySession()
        servletSession.setAttribute(OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE, token)
        servletSession.setAttribute(
            OAuthReturnState.SESSION_ATTRIBUTE,
            oauthReturnState.signReturnTarget("/clubs/sample-book-club/invite/$token"),
        )
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    googleSubjectId = "google-oauth-invite-wrong-club",
                    email = "oauth.invite.wrong.club@example.com",
                    name = "OAuth Wrong Club",
                ),
                "credentials",
            )
        SecurityContextHolder.getContext().authentication = authentication

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://readmates.pages.dev/login?error=google", response.redirectedUrl)
        assertNull(response.getHeader(HttpHeaders.SET_COOKIE))
        assertFalse(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)

        val invitation =
            jdbcTemplate.queryForMap(
                "select status, accepted_user_id from invitations where invited_email = ?",
                "oauth.invite.wrong.club@example.com",
            )
        assertEquals("PENDING", invitation["status"])
        assertNull(invitation["accepted_user_id"])
        val userCount =
            jdbcTemplate.queryForObject(
                "select count(*) from users where email = ?",
                Int::class.java,
                "oauth.invite.wrong.club@example.com",
            )
        assertEquals(0, userCount)
    }

    @Test
    fun `google invite login preserves trusted custom domain invite return target`() {
        jdbcTemplate.update(
            """
            insert into club_domains (id, club_id, hostname, kind, status, is_primary)
            values (
              '00000000-0000-0000-0000-000000007302',
              '00000000-0000-0000-0000-000000000001',
              'reading.readmates.example',
              'CUSTOM_DOMAIN',
              'ACTIVE',
              true
            )
            """.trimIndent(),
        )
        val token =
            createInvitation(
                token = "oauthInviteDomainToken0000000000000000000000000",
                email = "oauth.invite.domain@example.com",
                name = "OAuth Domain",
            )
        val servletSession = securitySession()
        servletSession.setAttribute(OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE, token)
        servletSession.setAttribute(
            OAuthReturnState.SESSION_ATTRIBUTE,
            oauthReturnState.signReturnTarget("https://reading.readmates.example/invite/$token"),
        )
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.addHeader(HttpHeaders.USER_AGENT, "MockMvc")
        request.remoteAddr = "127.0.0.1"
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    googleSubjectId = "google-oauth-invite-domain",
                    email = "oauth.invite.domain@example.com",
                    name = "OAuth Domain",
                ),
                "credentials",
            )
        SecurityContextHolder.getContext().authentication = authentication

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://reading.readmates.example/invite/$token", response.redirectedUrl)
        val setCookie = response.getHeader(HttpHeaders.SET_COOKIE)
        assertNotNull(setCookie)
        assertTrue(setCookie!!.startsWith("${AuthSessionService.COOKIE_NAME}="))
        assertFalse(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)
    }

    @Test
    fun `trusted custom domain scoped invite return target must match host club`() {
        jdbcTemplate.update(
            """
            insert into club_domains (id, club_id, hostname, kind, status, is_primary)
            values (
              '00000000-0000-0000-0000-000000007303',
              '00000000-0000-0000-0000-000000000001',
              'reading.readmates.example',
              'CUSTOM_DOMAIN',
              'ACTIVE',
              true
            )
            """.trimIndent(),
        )
        val token = "oauthInviteCrossHostToken000000000000000000000"
        val signedState =
            oauthReturnState.signReturnTarget(
                "https://reading.readmates.example/clubs/sample-book-club/invite/$token",
            )

        assertEquals("sample-book-club", oauthReturnState.inviteClubSlugFromReturnState(signedState, token))
        assertNull(
            oauthReturnState.inviteReturnTargetFromState(
                signedState = signedState,
                clubSlug = "sample-book-club",
                inviteToken = token,
            ),
        )
    }

    @Test
    fun `google invite login rejects mismatched invitation email without accepting invitation`() {
        val token =
            createInvitation(
                token = "oauthInviteMismatchToken000000000000000000000000",
                email = "oauth.invite.owner@example.com",
                name = "OAuth Invite Owner",
            )
        val servletSession = securitySession()
        servletSession.setAttribute(OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE, token)
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication =
            TestingAuthenticationToken(
                googleOidcUser(
                    googleSubjectId = "google-oauth-invite-mismatch",
                    email = "oauth.invite.other@example.com",
                    name = "OAuth Invite Other",
                ),
                "credentials",
            )
        SecurityContextHolder.getContext().authentication = authentication

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://readmates.pages.dev/login?error=google", response.redirectedUrl)
        assertNull(response.getHeader(HttpHeaders.SET_COOKIE))
        assertFalse(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)

        val status =
            jdbcTemplate.queryForObject(
                "select status from invitations where invited_email = ?",
                String::class.java,
                "oauth.invite.owner@example.com",
            )
        assertEquals("PENDING", status)
        val acceptedUserCount =
            jdbcTemplate.queryForObject(
                "select count(*) from users where email = ?",
                Int::class.java,
                "oauth.invite.owner@example.com",
            )
        assertEquals(0, acceptedUserCount)
    }

    @Test
    fun `app base url must be an http origin before redirects use it`() {
        assertEquals("https://readmates.pages.dev", readmatesAppOrigin("https://readmates.pages.dev/"))
        assertEquals("http://localhost:3000", readmatesAppOrigin(" "))

        assertThrows<IllegalArgumentException> {
            readmatesAppOrigin("https://readmates.pages.dev/app")
        }
        assertThrows<IllegalArgumentException> {
            readmatesAppOrigin("https://readmates.pages.dev?next=/app")
        }
        assertThrows<IllegalArgumentException> {
            readmatesAppOrigin("javascript:alert(1)")
        }
    }

    companion object {
        const val CLEANUP_SQL = """
            delete from auth_sessions
            where user_id in (
              select id
              from users
              where email in (
                'oauth.session@example.com',
                'oauth.session.return@example.com',
                'oauth.invalid.return@example.com',
                'oauth.owner@example.com',
                'oauth.other@example.com',
                'oauth.left@example.com',
                'oauth.platform.admin@example.com',
                'oauth.invited@example.com',
                'oauth.invite.wrong.club@example.com',
                'oauth.invite.domain@example.com',
                'oauth.invite.owner@example.com',
                'oauth.invite.other@example.com',
                'oauth.guest.join.target@example.com',
                'oauth.guest.join.generic@example.com',
                'oauth.guest.join.mismatch@example.com',
                'oauth.guest.join.dot.path@example.com',
                'oauth.guest.join.encoded.path@example.com',
                'oauth.multitab.success@example.com',
                'oauth.multitab.failure@example.com',
                'oauth.unexpected.body@example.com',
                'oauth.success.then.failure@example.com'
              )
                 or google_subject_id in (
                   'google-oauth-session-existing',
                   'google-oauth-session-return-target',
                   'google-oauth-invalid-return-state',
                   'google-oauth-platform-admin',
                   'google-oauth-conflict-subject',
                   'google-oauth-left-member',
                   'google-oauth-invited',
                   'google-oauth-invite-wrong-club',
                   'google-oauth-invite-domain',
                   'google-oauth-invite-mismatch',
                   'google-oauth-multitab-success',
                   'google-oauth-multitab-failure',
                   'google-oauth-unexpected-body',
                   'google-oauth-success-then-failure'
                 )
            );

            delete from platform_admins
            where user_id in (
              select id
              from users
              where email in (
                'oauth.platform.admin@example.com'
              )
                 or google_subject_id in (
                   'google-oauth-platform-admin'
                 )
            );

            delete from session_participants
            where membership_id in (
              select memberships.id
              from memberships
              join users on users.id = memberships.user_id
              where users.email in (
                'oauth.session@example.com',
                'oauth.session.return@example.com',
                'oauth.invalid.return@example.com',
                'oauth.owner@example.com',
                'oauth.other@example.com',
                'oauth.left@example.com',
                'oauth.platform.admin@example.com',
                'oauth.invited@example.com',
                'oauth.invite.wrong.club@example.com',
                'oauth.invite.domain@example.com',
                'oauth.invite.owner@example.com',
                'oauth.invite.other@example.com',
                'oauth.guest.join.target@example.com',
                'oauth.guest.join.generic@example.com',
                'oauth.guest.join.mismatch@example.com',
                'oauth.guest.join.dot.path@example.com',
                'oauth.guest.join.encoded.path@example.com',
                'oauth.multitab.success@example.com',
                'oauth.multitab.failure@example.com',
                'oauth.unexpected.body@example.com',
                'oauth.success.then.failure@example.com'
              )
                 or users.google_subject_id in (
                   'google-oauth-session-existing',
                   'google-oauth-session-return-target',
                   'google-oauth-invalid-return-state',
                   'google-oauth-platform-admin',
                   'google-oauth-conflict-subject',
                   'google-oauth-left-member',
                   'google-oauth-invited',
                   'google-oauth-invite-wrong-club',
                   'google-oauth-invite-domain',
                   'google-oauth-invite-mismatch',
                   'google-oauth-multitab-success',
                   'google-oauth-multitab-failure',
                   'google-oauth-unexpected-body',
                   'google-oauth-success-then-failure'
                 )
            );

            delete from club_domains
            where hostname = 'reading.readmates.example';

            delete from invitations
            where invited_email in (
              'oauth.invited@example.com',
              'oauth.invite.wrong.club@example.com',
              'oauth.invite.domain@example.com',
              'oauth.invite.owner@example.com'
            );

            delete from sessions
            where title = 'OAuth Invite Test Session';

            delete from memberships
            where user_id in (
              select id
              from users
              where email in (
                'oauth.session@example.com',
                'oauth.session.return@example.com',
                'oauth.invalid.return@example.com',
                'oauth.owner@example.com',
                'oauth.other@example.com',
                'oauth.left@example.com',
                'oauth.platform.admin@example.com',
                'oauth.invited@example.com',
                'oauth.invite.wrong.club@example.com',
                'oauth.invite.domain@example.com',
                'oauth.invite.owner@example.com',
                'oauth.invite.other@example.com',
                'oauth.guest.join.target@example.com',
                'oauth.guest.join.generic@example.com',
                'oauth.guest.join.mismatch@example.com',
                'oauth.guest.join.dot.path@example.com',
                'oauth.guest.join.encoded.path@example.com',
                'oauth.multitab.success@example.com',
                'oauth.multitab.failure@example.com',
                'oauth.unexpected.body@example.com',
                'oauth.success.then.failure@example.com'
              )
                 or google_subject_id in (
                   'google-oauth-session-existing',
                   'google-oauth-session-return-target',
                   'google-oauth-invalid-return-state',
                   'google-oauth-platform-admin',
                   'google-oauth-conflict-subject',
                   'google-oauth-left-member',
                   'google-oauth-invited',
                   'google-oauth-invite-wrong-club',
                   'google-oauth-invite-domain',
                   'google-oauth-invite-mismatch',
                   'google-oauth-multitab-success',
                   'google-oauth-multitab-failure',
                   'google-oauth-unexpected-body',
                   'google-oauth-success-then-failure'
                 )
            );

            delete from users
            where email in (
              'oauth.session@example.com',
              'oauth.session.return@example.com',
              'oauth.invalid.return@example.com',
              'oauth.owner@example.com',
              'oauth.other@example.com',
              'oauth.left@example.com',
              'oauth.platform.admin@example.com',
              'oauth.invited@example.com',
              'oauth.invite.wrong.club@example.com',
              'oauth.invite.domain@example.com',
              'oauth.invite.owner@example.com',
              'oauth.invite.other@example.com',
              'oauth.guest.join.target@example.com',
              'oauth.guest.join.generic@example.com',
              'oauth.guest.join.mismatch@example.com',
              'oauth.guest.join.dot.path@example.com',
              'oauth.guest.join.encoded.path@example.com',
              'oauth.multitab.success@example.com',
              'oauth.multitab.failure@example.com',
              'oauth.unexpected.body@example.com',
              'oauth.success.then.failure@example.com'
            )
               or google_subject_id in (
                 'google-oauth-session-existing',
                 'google-oauth-session-return-target',
                 'google-oauth-invalid-return-state',
                 'google-oauth-platform-admin',
                 'google-oauth-conflict-subject',
                 'google-oauth-left-member',
                 'google-oauth-invited',
                 'google-oauth-invite-wrong-club',
                 'google-oauth-invite-domain',
                 'google-oauth-invite-mismatch',
                 'google-oauth-multitab-success',
                 'google-oauth-multitab-failure',
                 'google-oauth-unexpected-body',
                 'google-oauth-success-then-failure'
               );
        """
    }

    private fun createGoogleMember(
        googleSubjectId: String,
        email: String,
        displayName: String,
        status: String = "ACTIVE",
    ) {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (uuid(), ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            googleSubjectId,
            email,
            displayName,
            displayName,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            select
              uuid(),
              clubs.id,
              users.id,
              'MEMBER',
              ?,
              utc_timestamp(6),
              users.short_name,
              'mushroom-green-book'
            from clubs
            join users on users.email = ?
            where clubs.slug = 'reading-sai'
            """.trimIndent(),
            status,
            email,
        )
    }

    private fun membershipStates(email: String): List<String> =
        jdbcTemplate
            .queryForList(
                """
                select concat(clubs.slug, ':', memberships.status)
                from memberships
                join clubs on clubs.id = memberships.club_id
                join users on users.id = memberships.user_id
                where users.email = ?
                order by clubs.slug
                """.trimIndent(),
                String::class.java,
                email,
            ).filterNotNull()

    private fun issueSeededHostSession(): ExistingAppSession {
        val issued =
            authSessionService.issueSession(
                userId = "00000000-0000-0000-0000-000000000101",
                userAgent = "GoogleOAuthLoginSessionTest",
                ipAddress = "127.0.0.1",
            )
        return ExistingAppSession(
            rawToken = issued.rawToken,
            cookie = Cookie(AuthSessionService.COOKIE_NAME, issued.rawToken),
        )
    }

    private fun assertSeededHostSessionRemainsAuthenticated(cookie: Cookie) {
        mockMvc
            .get("/api/auth/me") {
                cookie(cookie)
                param("clubSlug", "reading-sai")
            }.andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.userId") { value("00000000-0000-0000-0000-000000000101") }
                jsonPath("$.role") { value("HOST") }
            }
    }

    private fun assertAuthMeAnonymous(sessionCookie: Cookie? = null) {
        mockMvc
            .get("/api/auth/me") {
                sessionCookie?.let { cookie(it) }
            }.andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(false) }
            }
    }

    private fun readmatesCookieValue(response: MockHttpServletResponse): String {
        val prefix = "${AuthSessionService.COOKIE_NAME}="
        return response
            .getHeaders(HttpHeaders.SET_COOKIE)
            .first { it.startsWith(prefix) }
            .substringAfter(prefix)
            .substringBefore(';')
    }

    private fun saveJoinFlow(
        session: MockHttpSession,
        state: String,
        clubSlug: String,
    ) {
        val returnTo = "/clubs/$clubSlug/app"
        val intentRequest = MockHttpServletRequest("POST", "/api/auth/oauth/join-intent").apply { setSession(session) }
        val intent = joinIntentStore.issue(intentRequest, clubSlug, returnTo, Instant.now())
        val authorizationRequest =
            MockHttpServletRequest("GET", "/oauth2/authorization/google").apply {
                setSession(session)
                setParameter("returnTo", returnTo)
                setParameter("joinClub", clubSlug)
                setParameter("joinIntent", intent.token)
            }
        flowRepository.saveAuthorizationRequest(
            oauthAuthorization(state),
            authorizationRequest,
            MockHttpServletResponse(),
        )
    }

    private fun loadFlow(
        session: MockHttpSession,
        state: String,
    ): OAuth2AuthorizationRequest? = flowRepository.loadAuthorizationRequest(oauthCallback(session, state))

    private fun removeFlow(
        session: MockHttpSession,
        state: String,
    ): OAuth2AuthorizationRequest? =
        flowRepository.removeAuthorizationRequest(
            oauthCallback(session, state),
            MockHttpServletResponse(),
        )

    private fun consumeFlow(
        session: MockHttpSession,
        state: String,
    ): MockHttpServletRequest =
        oauthCallback(session, state).also {
            assertNotNull(flowRepository.removeAuthorizationRequest(it, MockHttpServletResponse()))
        }

    private fun countingCallback(
        session: MockHttpSession,
        state: String,
    ): CountingMockHttpServletRequest =
        CountingMockHttpServletRequest("GET", "/login/oauth2/code/google").apply {
            setSession(session)
            setParameter("state", state)
        }

    private fun createPlatformAdminUser(
        googleSubjectId: String,
        email: String,
        displayName: String,
    ): String {
        val userId =
            java.util.UUID
                .randomUUID()
                .toString()
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, ?, ?, null, 'GOOGLE')
            """.trimIndent(),
            userId,
            googleSubjectId,
            email,
            displayName,
            displayName,
        )
        jdbcTemplate.update(
            """
            insert into platform_admins (user_id, role, status)
            values (?, 'OWNER', 'ACTIVE')
            """.trimIndent(),
            userId,
        )
        return userId
    }

    private fun createInvitation(
        token: String,
        email: String,
        name: String,
    ): String {
        jdbcTemplate.update(
            """
            insert into invitations (
              id,
              club_id,
              invited_by_membership_id,
              invited_email,
              invited_name,
              role,
              token_hash,
              status,
              expires_at
            )
            select
              uuid(),
              clubs.id,
              memberships.id,
              ?,
              ?,
              'MEMBER',
              ?,
              'PENDING',
              date_add(utc_timestamp(6), interval 30 day)
            from clubs
            join memberships on memberships.club_id = clubs.id
            join users on users.id = memberships.user_id
            where clubs.slug = 'reading-sai'
              and users.email = 'host@example.com'
              and memberships.role = 'HOST'
            limit 1
            """.trimIndent(),
            email,
            name,
            invitationTokenService.hashToken(token),
        )
        return token
    }

    private fun createOpenSession() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id,
              club_id,
              number,
              title,
              book_title,
              book_author,
              session_date,
              start_time,
              end_time,
              location_label,
              question_deadline_at,
              state
            )
            select
              uuid(),
              clubs.id,
              998,
              'OAuth Invite Test Session',
              'OAuth Invite Test Book',
              'OAuth Invite Test Author',
              date(date_add(utc_timestamp(6), interval 9 hour)),
              '19:30:00',
              '21:30:00',
              '온라인',
              date_add(utc_timestamp(6), interval 1 day),
              'OPEN'
            from clubs
            where clubs.slug = 'reading-sai'
            """.trimIndent(),
        )
    }
}

private data class ExistingAppSession(
    val rawToken: String,
    val cookie: Cookie,
)

private class CountingMockHttpServletRequest(
    method: String,
    requestUri: String,
) : MockHttpServletRequest(method, requestUri) {
    var sessionIdChangeCount: Int = 0
        private set

    override fun changeSessionId(): String {
        sessionIdChangeCount += 1
        return super.changeSessionId()
    }
}

private class RejectingSetCookieResponse : MockHttpServletResponse() {
    override fun addHeader(
        name: String?,
        value: String?,
    ) {
        if (name.equals(HttpHeaders.SET_COOKIE, ignoreCase = true)) {
            throw IllegalStateException("simulated response failure")
        }
        super.addHeader(name, value)
    }
}

private fun securitySession(): MockHttpSession {
    val session = MockHttpSession()
    session.setAttribute(
        HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
        SecurityContextHolder.createEmptyContext(),
    )
    return session
}

private fun oauthCallback(
    session: MockHttpSession,
    state: String,
): MockHttpServletRequest =
    MockHttpServletRequest("GET", "/login/oauth2/code/google").apply {
        setSession(session)
        setParameter("state", state)
    }

private fun oauthAuthorization(state: String): OAuth2AuthorizationRequest =
    OAuth2AuthorizationRequest
        .authorizationCode()
        .authorizationUri("https://accounts.example.test/oauth")
        .clientId("client")
        .redirectUri("https://auth.readmates.example/login/oauth2/code/google")
        .scopes(setOf("openid"))
        .state(state)
        .authorizationRequestUri("https://accounts.example.test/oauth?state=$state")
        .attributes(mapOf("registration_id" to "google"))
        .build()

private fun googleOidcUser(
    googleSubjectId: String,
    email: String,
    name: String,
): DefaultOidcUser {
    val claims =
        mapOf(
            StandardClaimNames.SUB to googleSubjectId,
            StandardClaimNames.EMAIL to email,
            StandardClaimNames.EMAIL_VERIFIED to true,
            StandardClaimNames.NAME to name,
            StandardClaimNames.PICTURE to "https://example.com/avatar.png",
        )
    val now = Instant.now()
    val idToken = OidcIdToken("test-id-token", now, now.plusSeconds(60), claims)

    return DefaultOidcUser(
        listOf(SimpleGrantedAuthority("OIDC_USER")),
        idToken,
        StandardClaimNames.EMAIL,
    )
}
