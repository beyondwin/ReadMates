package com.readmates.club.api

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
class SupportAccessGrantControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdPlatformAdminUserIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdGrantIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            // Delete grants first (no FK to platform_audit_events), then audit events by actor
            deleteWhereIn("support_access_grants", "id", createdGrantIds)
            deleteWhereIn("platform_audit_events", "actor_user_id", createdPlatformAdminUserIds)
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("platform_admins", "user_id", createdPlatformAdminUserIds)
            deleteWhereIn("users", "id", createdUserIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdPlatformAdminUserIds.clear()
            createdUserIds.clear()
            createdGrantIds.clear()
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `platform admin can create support access grant`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        val result = mockMvc.post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "Customer escalation ticket #1234",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
            """.trimIndent()
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { exists() }
            jsonPath("$.clubId") { value(TEST_CLUB_ID) }
            jsonPath("$.grantedByUserId") { value(owner) }
            jsonPath("$.granteeUserId") { value(grantee) }
            jsonPath("$.scope") { value("HOST_SUPPORT_READ") }
            jsonPath("$.reason") { value("Customer escalation ticket #1234") }
            jsonPath("$.expiresAt") { exists() }
            jsonPath("$.revokedAt") { doesNotExist() }
            jsonPath("$.createdAt") { exists() }
        }.andReturn()
        createdGrantIds += checkNotNull(result.response.jsonPathValue<String>("$.id"))
    }

    @Test
    fun `reason is required to create a support access grant`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        mockMvc.post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
            """.trimIndent()
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isBadRequest() }
        }
    }

    @Test
    fun `platform admin can list active grants by club`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        val result = mockMvc.post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "List test",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
            """.trimIndent()
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
        }.andReturn()
        createdGrantIds += checkNotNull(result.response.jsonPathValue<String>("$.id"))

        mockMvc.get("/api/admin/support-access-grants?clubId=$TEST_CLUB_ID") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
            jsonPath("$[0].clubId") { value(TEST_CLUB_ID) }
        }
    }

    @Test
    fun `platform admin can list active grants by grantee`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        val result = mockMvc.post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "Grantee list test",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
            """.trimIndent()
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
        }.andReturn()
        createdGrantIds += checkNotNull(result.response.jsonPathValue<String>("$.id"))

        mockMvc.get("/api/admin/support-access-grants?granteeUserId=$grantee") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
            jsonPath("$") { isArray() }
            jsonPath("$[0].granteeUserId") { value(grantee) }
        }
    }

    @Test
    fun `platform admin can revoke a support access grant`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        val createResult = mockMvc.post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "Revoke test",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
            """.trimIndent()
            cookie(sessionCookieForUser(owner))
        }.andReturn()
        val grantId = checkNotNull(createResult.response.jsonPathValue<String>("$.id"))
        createdGrantIds += grantId

        mockMvc.delete("/api/admin/support-access-grants/$grantId") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isNoContent() }
        }
    }

    @Test
    fun `revoking a nonexistent grant returns not found`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")

        mockMvc.delete("/api/admin/support-access-grants/${UUID.randomUUID()}") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `revoked grant no longer appears in active list`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        val createResult = mockMvc.post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "Active list after revoke test",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
            """.trimIndent()
            cookie(sessionCookieForUser(owner))
        }.andReturn()
        val grantId = checkNotNull(createResult.response.jsonPathValue<String>("$.id"))
        createdGrantIds += grantId

        mockMvc.delete("/api/admin/support-access-grants/$grantId") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isNoContent() }
        }

        mockMvc.get("/api/admin/support-access-grants?clubId=$TEST_CLUB_ID") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
            jsonPath("$[?(@.id == '$grantId')]") { doesNotExist() }
        }
    }

    @Test
    fun `unauthenticated request returns unauthorized`() {
        mockMvc.get("/api/admin/support-access-grants?clubId=$TEST_CLUB_ID")
            .andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    fun `non-platform-admin user cannot access support access grant endpoints`() {
        mockMvc.get("/api/admin/support-access-grants?clubId=$TEST_CLUB_ID") {
            cookie(sessionCookieForUser("00000000-0000-0000-0000-000000000101"))
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `active grant for grantee user is stored as active in the database`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        val createResult = mockMvc.post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "Elevation test",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
            """.trimIndent()
            cookie(sessionCookieForUser(owner))
        }.andReturn()
        val grantId = checkNotNull(createResult.response.jsonPathValue<String>("$.id"))
        createdGrantIds += grantId

        // Verify the grant is active in DB — MemberAuthoritiesFilter uses this for elevation
        val count = jdbcTemplate.queryForObject(
            """
            select count(*) from support_access_grants
            where id = ? and grantee_user_id = ? and club_id = ?
              and revoked_at is null and expires_at > utc_timestamp(6)
            """.trimIndent(),
            Long::class.java,
            grantId,
            grantee,
            TEST_CLUB_ID,
        ) ?: 0L
        assert(count == 1L) { "Expected active grant, found $count" }

        // Verify the list endpoint returns this grant for the grantee
        mockMvc.get("/api/admin/support-access-grants?granteeUserId=$grantee") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(grantId) }
            jsonPath("$[0].scope") { value("HOST_SUPPORT_READ") }
        }
    }

    @Test
    fun `create audit event is written when grant is created`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        val result = mockMvc.post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "Audit test",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
            """.trimIndent()
            cookie(sessionCookieForUser(owner))
        }.andReturn()
        val grantId = checkNotNull(result.response.jsonPathValue<String>("$.id"))
        createdGrantIds += grantId

        val count = jdbcTemplate.queryForObject(
            "select count(*) from platform_audit_events where actor_user_id = ? and event_type = 'SUPPORT_ACCESS_GRANT_CREATED'",
            Long::class.java,
            owner,
        ) ?: 0L
        assert(count >= 1L) { "Expected audit event for SUPPORT_ACCESS_GRANT_CREATED, found none" }
    }

    @Test
    fun `revoke audit event is written when grant is revoked`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val grantee = createPlatformAdminUser(role = "SUPPORT", status = "ACTIVE")

        val createResult = mockMvc.post("/api/admin/support-access-grants") {
            contentType = MediaType.APPLICATION_JSON
            content = """
                {
                  "clubId": "$TEST_CLUB_ID",
                  "granteeUserId": "$grantee",
                  "scope": "HOST_SUPPORT_READ",
                  "reason": "Revoke audit test",
                  "expiresAt": "2099-01-01T12:00:00Z"
                }
            """.trimIndent()
            cookie(sessionCookieForUser(owner))
        }.andReturn()
        val grantId = checkNotNull(createResult.response.jsonPathValue<String>("$.id"))
        createdGrantIds += grantId

        mockMvc.delete("/api/admin/support-access-grants/$grantId") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isNoContent() }
        }

        val count = jdbcTemplate.queryForObject(
            "select count(*) from platform_audit_events where actor_user_id = ? and event_type = 'SUPPORT_ACCESS_GRANT_REVOKED'",
            Long::class.java,
            owner,
        ) ?: 0L
        assert(count >= 1L) { "Expected audit event for SUPPORT_ACCESS_GRANT_REVOKED, found none" }
    }

    private fun createPlatformAdminUser(role: String, status: String): String {
        val userId = UUID.randomUUID().toString()
        val email = "platform.${UUID.randomUUID()}@example.com"
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, 'Platform Admin', 'Admin', 'GOOGLE')
            """.trimIndent(),
            userId,
            email,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into platform_admins (user_id, role, status)
            values (?, ?, ?)
            """.trimIndent(),
            userId,
            role,
            status,
        )
        createdPlatformAdminUserIds += userId
        return userId
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession = authSessionService.issueSession(
            userId = UUID.fromString(userId).toString(),
            userAgent = "SupportAccessGrantControllerTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun deleteWhereIn(tableName: String, columnName: String, values: Set<String>) {
        if (values.isEmpty()) return
        val placeholders = values.joinToString(",") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }

    companion object {
        private const val TEST_CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private const val TEST_CLUB_SLUG = "reading-sai"

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}

private inline fun <reified T> org.springframework.mock.web.MockHttpServletResponse.jsonPathValue(expression: String): T? =
    com.jayway.jsonpath.JsonPath.read(contentAsString, expression)
