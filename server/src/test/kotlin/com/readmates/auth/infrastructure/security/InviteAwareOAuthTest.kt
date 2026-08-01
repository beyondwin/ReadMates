package com.readmates.auth.infrastructure.security

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.FilterChain
import jakarta.servlet.ServletRequest
import jakarta.servlet.ServletResponse
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.test.context.jdbc.Sql
import java.time.Instant
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.app-base-url=https://app.readmates.example",
        "readmates.auth.auth-base-url=https://auth.readmates.example",
        "readmates.auth.session-cookie-domain=.readmates.example",
    ],
)
@Sql(statements = [InviteAwareOAuthTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [InviteAwareOAuthTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class InviteAwareOAuthTest(
    @param:Autowired private val oauthReturnState: OAuthReturnState,
    @param:Autowired private val captureFilter: OAuthInviteTokenCaptureFilter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `authorization capture signs trusted relative return target`() {
        val request = MockHttpServletRequest("GET", "/oauth2/authorization/google")
        request.setParameter("returnTo", "/clubs/reading-sai/app?tab=current")
        val response = MockHttpServletResponse()

        captureFilter.doFilter(request, response, RecordingFilterChain())

        val signedState = request.getSession(false)!!.getAttribute(OAuthReturnState.SESSION_ATTRIBUTE)
        assertNotNull(signedState)
        assertEquals(
            "/clubs/reading-sai/app?tab=current",
            oauthReturnState.validatedReturnTarget(signedState.toString(), fallback = "/app"),
        )
    }

    @Test
    fun `authorization capture stores guest join only when it matches the signed scoped app target`() {
        val matching = MockHttpServletRequest("GET", "/oauth2/authorization/google")
        matching.setParameter("returnTo", "/clubs/reading-sai/app/archive")
        matching.setParameter("joinClub", "reading-sai")

        captureFilter.doFilter(matching, MockHttpServletResponse(), RecordingFilterChain())

        assertEquals(
            "reading-sai",
            matching.getSession(false)!!.getAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE),
        )

        val mismatched = MockHttpServletRequest("GET", "/oauth2/authorization/google")
        mismatched.setParameter("returnTo", "/clubs/sample-book-club/app")
        mismatched.setParameter("joinClub", "reading-sai")

        captureFilter.doFilter(mismatched, MockHttpServletResponse(), RecordingFilterChain())

        assertNull(mismatched.getSession(false)?.getAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE))

        listOf(
            "/clubs/READING-SAI/app",
            "/clubs/reading-sai/app/../about",
        ).forEach { unsafeReturnTo ->
            val nonCanonical = MockHttpServletRequest("GET", "/oauth2/authorization/google")
            nonCanonical.setParameter("returnTo", unsafeReturnTo)
            nonCanonical.setParameter("joinClub", "reading-sai")

            captureFilter.doFilter(nonCanonical, MockHttpServletResponse(), RecordingFilterChain())

            assertNull(nonCanonical.getSession(false)?.getAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE))
        }
    }

    @Test
    fun `invite capture suppresses and clears any guest join intent`() {
        listOf("oauthInviteCaptureToken000000000000000000000000", "invalid").forEach { inviteToken ->
            val request = MockHttpServletRequest("GET", "/oauth2/authorization/google")
            request.getSession(true)!!.setAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE, "stale-club")
            request.setParameter("returnTo", "/clubs/reading-sai/app")
            request.setParameter("joinClub", "reading-sai")
            request.setParameter("inviteToken", inviteToken)

            captureFilter.doFilter(request, MockHttpServletResponse(), RecordingFilterChain())

            assertNull(request.getSession(false)?.getAttribute(OAuthGuestJoinSession.CLUB_SLUG_ATTRIBUTE))
        }
    }

    @Test
    fun `return target validation rejects protocol-relative and untrusted absolute urls`() {
        assertNull(oauthReturnState.signReturnTarget("//evil.example/app"))
        assertNull(oauthReturnState.signReturnTarget("https://evil.example/app"))
    }

    @Test
    fun `return target validation allows primary app host pages preview and active club domains`() {
        createActiveClubDomain("oauth-return-club.readmates.example")
        createActiveClubDomain("external-oauth-return.example.test")
        createDisabledClubDomain("disabled-oauth-return.example.test")

        assertNotNull(oauthReturnState.signReturnTarget("https://app.readmates.example/app"))
        assertNotNull(oauthReturnState.signReturnTarget("https://readmates.pages.dev/app"))
        assertNotNull(oauthReturnState.signReturnTarget("https://oauth-return-club.readmates.example/app"))
        assertNull(oauthReturnState.signReturnTarget("https://auth.readmates.example/app"))
        assertNull(oauthReturnState.signReturnTarget("https://external-oauth-return.example.test/app"))
        assertNull(oauthReturnState.signReturnTarget("https://disabled-oauth-return.example.test/app"))
    }

    @Test
    fun `expired or tampered signed return state falls back to app`() {
        val expiredState =
            oauthReturnState.signReturnTarget(
                returnTo = "/clubs/reading-sai/app",
                expiresAt = Instant.now().minusSeconds(1),
            )
        val validState = oauthReturnState.signReturnTarget("/clubs/reading-sai/app")
        val tamperedState = validState!!.dropLast(1) + if (validState.last() == 'a') "b" else "a"

        assertEquals("/app", oauthReturnState.validatedReturnTarget(expiredState, fallback = "/app"))
        assertEquals("/app", oauthReturnState.validatedReturnTarget(tamperedState, fallback = "/app"))
        assertEquals("/app", oauthReturnState.validatedReturnTarget("not-a-state", fallback = "/app"))
    }

    private fun createActiveClubDomain(hostname: String) {
        createClubDomain(hostname = hostname, status = "ACTIVE")
    }

    private fun createDisabledClubDomain(hostname: String) {
        createClubDomain(hostname = hostname, status = "DISABLED")
    }

    private fun createClubDomain(
        hostname: String,
        status: String,
    ) {
        jdbcTemplate.update(
            """
            insert into club_domains (id, club_id, hostname, kind, status, is_primary)
            select ?, clubs.id, ?, 'CUSTOM_DOMAIN', ?, false
            from clubs
            where clubs.slug = 'reading-sai'
            """.trimIndent(),
            UUID.randomUUID().toString(),
            hostname,
            status,
        )
    }

    private class RecordingFilterChain : FilterChain {
        var invoked = false

        override fun doFilter(
            request: ServletRequest,
            response: ServletResponse,
        ) {
            invoked = true
        }
    }

    companion object {
        const val CLEANUP_SQL = """
            delete from club_domains
            where hostname in (
              'oauth-return-club.example.test',
              'oauth-return-club.readmates.example',
              'external-oauth-return.example.test',
              'disabled-oauth-return.example.test'
            );
        """
    }
}
