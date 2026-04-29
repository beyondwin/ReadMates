package com.readmates.auth.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.auth.application.InvitationTokenService
import com.readmates.auth.infrastructure.security.OAuthReturnState
import com.readmates.auth.infrastructure.security.ReadmatesOAuthSuccessHandler
import com.readmates.auth.infrastructure.security.OAuthInviteTokenSession
import com.readmates.auth.infrastructure.security.readmatesAppOrigin
import com.readmates.support.MySqlTestContainer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpHeaders
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.mock.web.MockHttpSession
import org.springframework.security.authentication.TestingAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.oauth2.core.oidc.OidcIdToken
import org.springframework.security.oauth2.core.oidc.StandardClaimNames
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import java.time.Instant

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.app-base-url=https://readmates.pages.dev",
        "readmates.auth.auth-base-url=https://auth.readmates.example",
        "readmates.auth.return-state-secret=oauth-return-state-test-secret",
        "readmates.auth.session-cookie-domain=.readmates.example",
        "spring.security.oauth2.client.registration.google.client-id=test-client",
        "spring.security.oauth2.client.registration.google.client-secret=test-secret",
        "spring.security.oauth2.client.registration.google.scope=openid,email,profile",
    ],
)
@Sql(statements = [GoogleOAuthLoginSessionTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [GoogleOAuthLoginSessionTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class GoogleOAuthLoginSessionTest(
    @param:Autowired private val successHandler: ReadmatesOAuthSuccessHandler,
    @param:Autowired private val oauthReturnState: OAuthReturnState,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val invitationTokenService: InvitationTokenService,
) {
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
        val authentication = TestingAuthenticationToken(
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
        assertTrue(servletSession.isInvalid)
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
        val authentication = TestingAuthenticationToken(
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
        assertTrue(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)
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
        val authentication = TestingAuthenticationToken(
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
        assertTrue(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)
    }

    @Test
    fun `successful google login issues readmates session cookie for platform admin without membership`() {
        val userId = createPlatformAdminUser(
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
        val authentication = TestingAuthenticationToken(
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
        assertTrue(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)

        val issuedSessionCount = jdbcTemplate.queryForObject(
            "select count(*) from auth_sessions where user_id = ?",
            Int::class.java,
            userId,
        )
        assertEquals(1, issuedSessionCount)
        val membershipCount = jdbcTemplate.queryForObject(
            "select count(*) from memberships where user_id = ?",
            Int::class.java,
            userId,
        )
        assertEquals(0, membershipCount)
    }

    @Test
    fun `expected google account link failure redirects to login error and clears auth state`() {
        createGoogleMember(
            googleSubjectId = "google-oauth-conflict-subject",
            email = "oauth.owner@example.com",
            displayName = "OAuth Owner",
        )
        val servletSession = securitySession()
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication = TestingAuthenticationToken(
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
        val setCookie = response.getHeader(HttpHeaders.SET_COOKIE)
        assertNotNull(setCookie)
        assertTrue(setCookie!!.startsWith("${AuthSessionService.COOKIE_NAME}=;"))
        assertTrue(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)
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
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication = TestingAuthenticationToken(
            googleOidcUser(
                googleSubjectId = "google-oauth-left-member",
                email = "oauth.left@example.com",
                name = "OAuth Left Member",
            ),
            "credentials",
        )
        SecurityContextHolder.getContext().authentication = authentication

        successHandler.onAuthenticationSuccess(request, response, authentication)

        assertEquals("https://readmates.pages.dev/login?error=membership-left", response.redirectedUrl)
        val setCookie = response.getHeader(HttpHeaders.SET_COOKIE)
        assertNotNull(setCookie)
        assertTrue(setCookie!!.startsWith("${AuthSessionService.COOKIE_NAME}=;"))
        assertTrue(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)
    }

    @Test
    fun `successful google invite login accepts invitation and issues readmates session`() {
        val token = createInvitation(
            token = "oauthInviteAcceptToken00000000000000000000000000",
            email = "oauth.invited@example.com",
            name = "OAuth Invited",
        )
        createOpenSession()
        val servletSession = securitySession()
        servletSession.setAttribute(OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE, token)
        servletSession.setAttribute(
            OAuthReturnState.SESSION_ATTRIBUTE,
            oauthReturnState.signReturnTarget("/clubs/reading-sai/invite/$token"),
        )
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.addHeader(HttpHeaders.USER_AGENT, "MockMvc")
        request.remoteAddr = "127.0.0.1"
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication = TestingAuthenticationToken(
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
        assertTrue(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)

        val invitation = jdbcTemplate.queryForMap(
            "select status, accepted_user_id from invitations where invited_email = ?",
            "oauth.invited@example.com",
        )
        assertEquals("ACCEPTED", invitation["status"])
        assertNotNull(invitation["accepted_user_id"])

        val memberState = jdbcTemplate.queryForMap(
            """
            select users.google_subject_id,
                   users.auth_provider,
                   users.last_login_at,
                   memberships.status
            from users
            join memberships on memberships.user_id = users.id
            where users.email = ?
            """.trimIndent(),
            "oauth.invited@example.com",
        )
        assertEquals("google-oauth-invited", memberState["google_subject_id"])
        assertEquals("GOOGLE", memberState["auth_provider"])
        assertEquals("ACTIVE", memberState["status"])
        assertNotNull(memberState["last_login_at"])

        val participantCount = jdbcTemplate.queryForObject(
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
    }

    @Test
    fun `google invite login rejects mismatched return club without accepting invitation`() {
        val token = createInvitation(
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
        val authentication = TestingAuthenticationToken(
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
        val setCookie = response.getHeader(HttpHeaders.SET_COOKIE)
        assertNotNull(setCookie)
        assertTrue(setCookie!!.startsWith("${AuthSessionService.COOKIE_NAME}=;"))
        assertTrue(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)

        val invitation = jdbcTemplate.queryForMap(
            "select status, accepted_user_id from invitations where invited_email = ?",
            "oauth.invite.wrong.club@example.com",
        )
        assertEquals("PENDING", invitation["status"])
        assertNull(invitation["accepted_user_id"])
        val userCount = jdbcTemplate.queryForObject(
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
        val token = createInvitation(
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
        val authentication = TestingAuthenticationToken(
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
        assertTrue(servletSession.isInvalid)
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
        val signedState = oauthReturnState.signReturnTarget(
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
        val token = createInvitation(
            token = "oauthInviteMismatchToken000000000000000000000000",
            email = "oauth.invite.owner@example.com",
            name = "OAuth Invite Owner",
        )
        val servletSession = securitySession()
        servletSession.setAttribute(OAuthInviteTokenSession.INVITE_TOKEN_SESSION_ATTRIBUTE, token)
        val request = MockHttpServletRequest("GET", "/login/oauth2/code/google")
        request.setSession(servletSession)
        val response = MockHttpServletResponse()
        val authentication = TestingAuthenticationToken(
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
        val setCookie = response.getHeader(HttpHeaders.SET_COOKIE)
        assertNotNull(setCookie)
        assertTrue(setCookie!!.startsWith("${AuthSessionService.COOKIE_NAME}=;"))
        assertTrue(servletSession.isInvalid)
        assertNull(SecurityContextHolder.getContext().authentication)

        val status = jdbcTemplate.queryForObject(
            "select status from invitations where invited_email = ?",
            String::class.java,
            "oauth.invite.owner@example.com",
        )
        assertEquals("PENDING", status)
        val acceptedUserCount = jdbcTemplate.queryForObject(
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
                'oauth.invite.other@example.com'
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
                   'google-oauth-invite-mismatch'
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
                'oauth.invite.other@example.com'
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
                   'google-oauth-invite-mismatch'
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
                'oauth.invite.other@example.com'
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
                   'google-oauth-invite-mismatch'
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
              'oauth.invite.other@example.com'
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
                 'google-oauth-invite-mismatch'
               );
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
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
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            select
              uuid(),
              clubs.id,
              users.id,
              'MEMBER',
              ?,
              utc_timestamp(6),
              users.short_name
            from clubs
            join users on users.email = ?
            where clubs.slug = 'reading-sai'
            """.trimIndent(),
            status,
            email,
        )
    }

    private fun createPlatformAdminUser(
        googleSubjectId: String,
        email: String,
        displayName: String,
    ): String {
        val userId = java.util.UUID.randomUUID().toString()
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

    private fun createInvitation(token: String, email: String, name: String): String {
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

private fun securitySession(): MockHttpSession {
    val session = MockHttpSession()
    session.setAttribute(
        HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
        SecurityContextHolder.createEmptyContext(),
    )
    return session
}

private fun googleOidcUser(googleSubjectId: String, email: String, name: String): DefaultOidcUser {
    val claims = mapOf(
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
