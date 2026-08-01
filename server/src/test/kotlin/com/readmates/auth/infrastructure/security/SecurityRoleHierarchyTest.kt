package com.readmates.auth.infrastructure.security

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@AutoConfigureMockMvc
@Tag("integration")
class SecurityRoleHierarchyTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
) : ReadmatesMySqlIntegrationTestSupport() {
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
    fun `viewer can access archive sessions`() {
        val cookie = viewerSessionCookie("hierarchy.viewer.archive")

        mockMvc
            .get("/api/archive/sessions") {
                cookie(cookie)
            }.andExpect {
                status { isOk() }
            }
    }

    @Test
    fun `member inherits viewer access to archive sessions`() {
        val memberCookie = memberSessionCookieForSeedUser("member5@example.com")

        mockMvc
            .get("/api/archive/sessions") {
                cookie(memberCookie)
            }.andExpect {
                status { isOk() }
            }
    }

    @Test
    fun `host can access host sessions`() {
        val hostCookie = memberSessionCookieForSeedUser("host@example.com")

        mockMvc
            .get("/api/host/sessions") {
                cookie(hostCookie)
            }.andExpect {
                status { isOk() }
            }
    }

    @Test
    fun `viewer cannot access host sessions`() {
        val cookie = viewerSessionCookie("hierarchy.viewer.host")

        mockMvc
            .get("/api/host/sessions") {
                cookie(cookie)
            }.andExpect {
                status { isForbidden() }
            }
    }

    @Test
    fun `anonymous guest browse is allowed but mutation and member endpoints remain protected`() {
        mockMvc.get("/api/public/clubs/reading-sai/browse").andExpect {
            status { isOk() }
        }
        mockMvc
            .post("/api/public/clubs/reading-sai/browse") {
                with(csrf())
            }.andExpect {
                status { isUnauthorized() }
            }
        mockMvc.get("/api/sessions/current").andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `anonymous access is not granted to unregistered public api paths`() {
        mockMvc.get("/api/public/not-a-registered-endpoint").andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `invalid guest browse slug is rejected before controller access`() {
        listOf("Reading-sai", "a".repeat(41)).forEach { invalidSlug ->
            val response =
                mockMvc
                    .get("/api/public/clubs/$invalidSlug/browse")
                    .andExpect {
                        status { isBadRequest() }
                        header { string("Cache-Control", "no-store") }
                        jsonPath("$.code") { value("INVALID_REQUEST") }
                    }.andReturn()
                    .response

            val varyTokens =
                response
                    .getHeaders("Vary")
                    .flatMap { it.split(',') }
                    .map { it.trim().lowercase() }
            assertFalse(response.contentAsString.contains(invalidSlug))
            assertFalse("cookie" in varyTokens)
            assertFalse("authorization" in varyTokens)
        }
    }

    private fun viewerSessionCookie(emailPrefix: String): Cookie {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val email = "$emailPrefix.${UUID.randomUUID()}@example.com"

        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, profile_image_url, auth_provider)
            values (?, ?, ?, 'Hierarchy Viewer', 'Viewer', null, 'GOOGLE')
            """.trimIndent(),
            userId,
            "google-hierarchy-viewer-$userId",
            email,
        )
        createdUserIds += userId

        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name, avatar_key)
            values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', 'VIEWER', null, 'Viewer', 'reading-lamp')
            """.trimIndent(),
            membershipId,
            userId,
        )
        createdMembershipIds += membershipId

        val issuedSession =
            authSessionService.issueSession(
                userId = userId,
                userAgent = "SecurityRoleHierarchyTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun memberSessionCookieForSeedUser(email: String): Cookie {
        val userId =
            jdbcTemplate.queryForObject(
                "select id from users where email = ?",
                String::class.java,
                email,
            ) ?: error("Expected seeded user for $email")
        val issuedSession =
            authSessionService.issueSession(
                userId = userId,
                userAgent = "SecurityRoleHierarchyTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun deleteWhereIn(
        tableName: String,
        columnName: String,
        values: Set<String>,
    ) {
        if (values.isEmpty()) {
            return
        }

        val placeholders = values.joinToString(", ") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }
}
