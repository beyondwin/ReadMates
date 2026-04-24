package com.readmates.auth.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.auth.infrastructure.security.MemberAuthoritiesFilter
import com.readmates.auth.infrastructure.security.SessionCookieAuthenticationFilter
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockFilterChain
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
class AuthMeControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val sessionCookieAuthenticationFilter: SessionCookieAuthenticationFilter,
    @param:Autowired private val memberAuthoritiesFilter: MemberAuthoritiesFilter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdMembershipIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("memberships", "id", createdMembershipIds)
            deleteWhereIn("memberships", "user_id", createdUserIds)
            deleteWhereIn("users", "id", createdUserIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdMembershipIds.clear()
            createdUserIds.clear()
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `returns anonymous payload when no session exists`() {
        mockMvc.get("/api/auth/me")
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(false) }
                jsonPath("$.userId") { value(null) }
                jsonPath("$.membershipId") { value(null) }
                jsonPath("$.clubId") { value(null) }
                jsonPath("$.email") { value(null) }
                jsonPath("$.displayName") { value(null) }
                jsonPath("$.shortName") { value(null) }
                jsonPath("$.role") { value(null) }
                jsonPath("$.membershipStatus") { value(null) }
                jsonPath("$.approvalState") { value("ANONYMOUS") }
            }
    }

    @Test
    fun `returns seeded member payload when authenticated email has active membership`() {
        mockMvc.get("/api/auth/me") {
            with(user("member5@example.com"))
        }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.userId") { value("00000000-0000-0000-0000-000000000106") }
                jsonPath("$.membershipId") { value("00000000-0000-0000-0000-000000000206") }
                jsonPath("$.clubId") { value("00000000-0000-0000-0000-000000000001") }
                jsonPath("$.email") { value("member5@example.com") }
                jsonPath("$.role") { value("MEMBER") }
                jsonPath("$.displayName") { value("이멤버5") }
                jsonPath("$.shortName") { value("멤버5") }
                jsonPath("$.membershipStatus") { value("ACTIVE") }
                jsonPath("$.approvalState") { value("ACTIVE") }
            }
    }

    @Test
    fun `auth me returns viewer status without member write role`() {
        val viewerEmail = uniqueViewerEmail()
        val viewerCookie = loginAsGoogleViewerUser(viewerEmail)

        mockMvc.get("/api/auth/me") {
            cookie(viewerCookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.authenticated") { value(true) }
            jsonPath("$.email") { value(viewerEmail) }
            jsonPath("$.membershipStatus") { value("VIEWER") }
            jsonPath("$.approvalState") { value("VIEWER") }
            jsonPath("$.role") { value("MEMBER") }
        }
    }

    @Test
    fun `session cookie authentication gives viewer users viewer role only`() {
        val viewerCookie = loginAsGoogleViewerUser(uniqueViewerEmail())

        SecurityContextHolder.clearContext()
        try {
            val request = MockHttpServletRequest("GET", "/api/auth/me")
            request.setCookies(viewerCookie)
            val response = MockHttpServletResponse()

            sessionCookieAuthenticationFilter.doFilter(request, response, MockFilterChain())

            val authentication = SecurityContextHolder.getContext().authentication
                ?: error("Expected viewer member session to authenticate")
            val authorities = authentication.authorities
                .map { it.authority }
                .toSet()
            assertEquals(setOf("ROLE_VIEWER"), authorities)
            assertFalse("ROLE_MEMBER" in authorities)
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `session cookie authentication gives suspended users member role`() {
        val suspendedCookie = loginAsLifecycleUser(uniqueLifecycleEmail("suspended.cookie"), "SUSPENDED")

        SecurityContextHolder.clearContext()
        try {
            val request = MockHttpServletRequest("GET", "/api/auth/me")
            request.setCookies(suspendedCookie)
            val response = MockHttpServletResponse()

            sessionCookieAuthenticationFilter.doFilter(request, response, MockFilterChain())

            val authentication = SecurityContextHolder.getContext().authentication
                ?: error("Expected suspended member session to authenticate")
            val authorities = authentication.authorities
                .map { it.authority }
                .toSet()
            assertEquals(setOf("ROLE_MEMBER"), authorities)
            assertFalse("ROLE_VIEWER" in authorities)
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `auth me returns blocked session-cookie members without member host or viewer roles`() {
        listOf("LEFT", "INACTIVE").forEach { status ->
            val email = uniqueLifecycleEmail("blocked.${status.lowercase()}")
            val cookie = loginAsLifecycleUser(email, status)

            mockMvc.get("/api/auth/me") {
                cookie(cookie)
            }.andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.email") { value(email) }
                jsonPath("$.membershipStatus") { value(status) }
                jsonPath("$.approvalState") { value("INACTIVE") }
            }

            SecurityContextHolder.clearContext()
            try {
                val request = MockHttpServletRequest("GET", "/api/auth/me")
                request.setCookies(cookie)
                val response = MockHttpServletResponse()

                sessionCookieAuthenticationFilter.doFilter(request, response, MockFilterChain())

                val authentication = SecurityContextHolder.getContext().authentication
                    ?: error("Expected $status member session to authenticate for auth state")
                val authorities = authentication.authorities
                    .map { it.authority }
                    .toSet()
                assertEquals(emptySet<String>(), authorities)
                assertFalse("ROLE_MEMBER" in authorities)
                assertFalse("ROLE_HOST" in authorities)
                assertFalse("ROLE_VIEWER" in authorities)
            } finally {
                SecurityContextHolder.clearContext()
            }
        }
    }

    @Test
    fun `member authority refresh strips stale member roles from viewer users`() {
        val viewerEmail = uniqueViewerEmail()
        loginAsGoogleViewerUser(viewerEmail)

        SecurityContextHolder.clearContext()
        try {
            SecurityContextHolder.getContext().authentication = UsernamePasswordAuthenticationToken(
                viewerEmail,
                null,
                listOf(
                    SimpleGrantedAuthority("ROLE_HOST"),
                    SimpleGrantedAuthority("ROLE_MEMBER"),
                    SimpleGrantedAuthority("ROLE_VIEWER"),
                    SimpleGrantedAuthority("ROLE_OTHER"),
                ),
            )
            val request = MockHttpServletRequest("GET", "/api/auth/me")
            val response = MockHttpServletResponse()

            memberAuthoritiesFilter.doFilter(request, response, MockFilterChain())

            val authentication = SecurityContextHolder.getContext().authentication
                ?: error("Expected viewer member authority refresh to authenticate")
            val authorities = authentication.authorities
                .map { it.authority }
                .toSet()
            assertEquals(setOf("ROLE_VIEWER", "ROLE_OTHER"), authorities)
            assertFalse("ROLE_HOST" in authorities)
            assertFalse("ROLE_MEMBER" in authorities)
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `member authority refresh maps suspended users to member role`() {
        val suspendedEmail = uniqueLifecycleEmail("suspended.authority")
        loginAsLifecycleUser(suspendedEmail, "SUSPENDED")

        SecurityContextHolder.clearContext()
        try {
            SecurityContextHolder.getContext().authentication = UsernamePasswordAuthenticationToken(
                suspendedEmail,
                null,
                listOf(
                    SimpleGrantedAuthority("ROLE_HOST"),
                    SimpleGrantedAuthority("ROLE_MEMBER"),
                    SimpleGrantedAuthority("ROLE_VIEWER"),
                    SimpleGrantedAuthority("ROLE_OTHER"),
                ),
            )
            val request = MockHttpServletRequest("GET", "/api/auth/me")
            val response = MockHttpServletResponse()

            memberAuthoritiesFilter.doFilter(request, response, MockFilterChain())

            val authentication = SecurityContextHolder.getContext().authentication
                ?: error("Expected suspended member authority refresh to authenticate")
            val authorities = authentication.authorities
                .map { it.authority }
                .toSet()
            assertEquals(setOf("ROLE_MEMBER", "ROLE_OTHER"), authorities)
            assertFalse("ROLE_HOST" in authorities)
            assertFalse("ROLE_VIEWER" in authorities)
        } finally {
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `auth me returns active approval state for active member`() {
        val activeCookie = loginAndReturnSessionCookie("host@example.com", "correct horse battery staple")

        mockMvc.get("/api/auth/me") {
            cookie(activeCookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.authenticated") { value(true) }
            jsonPath("$.membershipStatus") { value("ACTIVE") }
            jsonPath("$.approvalState") { value("ACTIVE") }
        }
    }

    @Test
    fun `auth me returns updated short name after profile mutation`() {
        val email = uniqueLifecycleEmail("profile.authme")
        val cookie = loginAsLifecycleUser(email, "ACTIVE")

        mockMvc.patch("/api/me/profile") {
            cookie(cookie)
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
            with(csrf())
            contentType = MediaType.APPLICATION_JSON
            content = """{"shortName":"UpdatedMe"}"""
        }.andExpect {
            status { isOk() }
        }

        mockMvc.get("/api/auth/me") {
            cookie(cookie)
        }.andExpect {
            status { isOk() }
            jsonPath("$.authenticated") { value(true) }
            jsonPath("$.email") { value(email) }
            jsonPath("$.shortName") { value("UpdatedMe") }
        }
    }

    private fun loginAsGoogleViewerUser(email: String): Cookie {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, ?, ?, 'Viewer Member', 'Viewer', 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-viewer-auth-me-$userId",
            email,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            select ?, clubs.id, ?, 'MEMBER', 'VIEWER', null
            from clubs
            where clubs.slug = 'reading-sai'
            """.trimIndent(),
            membershipId,
            userId,
        )
        createdMembershipIds += membershipId

        return sessionCookieForUser(userId)
    }

    private fun loginAsLifecycleUser(email: String, status: String): Cookie {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, 'Lifecycle Member', 'Lifecycle', 'PASSWORD')
            """.trimIndent(),
            userId,
            email,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            select ?, clubs.id, ?, 'MEMBER', ?, utc_timestamp(6)
            from clubs
            where clubs.slug = 'reading-sai'
            """.trimIndent(),
            membershipId,
            userId,
            status,
        )
        createdMembershipIds += membershipId

        return sessionCookieForUser(userId)
    }

    private fun loginAndReturnSessionCookie(email: String, password: String): Cookie {
        val userId = jdbcTemplate.queryForObject(
            "select id from users where email = ?",
            String::class.java,
            email,
        ) ?: error("Expected seeded user for $email")

        return sessionCookieForUser(userId)
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession = authSessionService.issueSession(
            userId = UUID.fromString(userId).toString(),
            userAgent = "AuthMeControllerTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun uniqueViewerEmail(): String = "viewer.${UUID.randomUUID()}@example.com"

    private fun uniqueLifecycleEmail(prefix: String): String = "$prefix.${UUID.randomUUID()}@example.com"

    private fun deleteWhereIn(tableName: String, columnName: String, values: Set<String>) {
        if (values.isEmpty()) {
            return
        }

        val placeholders = values.joinToString(", ") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }

    companion object {
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
