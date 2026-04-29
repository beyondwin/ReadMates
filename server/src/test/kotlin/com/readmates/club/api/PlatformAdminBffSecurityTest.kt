package com.readmates.club.api

import com.jayway.jsonpath.JsonPath
import com.readmates.auth.application.AuthSessionService
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
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
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
        "readmates.bff-secret=test-bff-secret",
        "readmates.allowed-origins=http://localhost:3000",
    ],
)
@AutoConfigureMockMvc
class PlatformAdminBffSecurityTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdPlatformAdminUserIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()
    private val createdClubDomainIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("club_domains", "id", createdClubDomainIds)
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("platform_admins", "user_id", createdPlatformAdminUserIds)
            deleteWhereIn("users", "id", createdUserIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdPlatformAdminUserIds.clear()
            createdUserIds.clear()
            createdClubDomainIds.clear()
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `admin domain bff request without secret is rejected`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val hostname = "missing-secret-${UUID.randomUUID()}.example.test"

        mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
            cookie(sessionCookieForUser(owner))
            header("Origin", "http://localhost:3000")
        }.andExpect {
            status { isUnauthorized() }
        }

        assertEquals(0, countDomainRows(hostname))
    }

    @Test
    fun `admin domain bff request without allowed origin is rejected`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")
        val hostname = "missing-origin-${UUID.randomUUID()}.example.test"

        mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
            cookie(sessionCookieForUser(owner))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
        }.andExpect {
            status { isForbidden() }
        }

        assertEquals(0, countDomainRows(hostname))
    }

    @Test
    fun `admin domain bff request reaches controller without spring csrf token`() {
        val operator = createPlatformAdminUser(role = "OPERATOR", status = "ACTIVE")
        val hostname = "bff-${UUID.randomUUID()}.example.test"

        val result = mockMvc.post("/api/admin/clubs/$READING_SAI_CLUB_ID/domains") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"hostname":"$hostname","kind":"SUBDOMAIN"}"""
            cookie(sessionCookieForUser(operator))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
            header("Origin", "http://localhost:3000")
        }.andExpect {
            status { isOk() }
            jsonPath("$.hostname") { value(hostname) }
            jsonPath("$.status") { value("ACTION_REQUIRED") }
        }.andReturn()
        createdClubDomainIds += JsonPath.read<String>(result.response.contentAsString, "$.id")

        assertEquals(1, countDomainRows(hostname))
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
            userAgent = "PlatformAdminBffSecurityTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private fun countDomainRows(hostname: String): Int =
        jdbcTemplate.queryForObject(
            "select count(*) from club_domains where hostname = ?",
            Int::class.java,
            hostname,
        ) ?: 0

    private fun deleteWhereIn(tableName: String, columnName: String, values: Set<String>) {
        if (values.isEmpty()) {
            return
        }
        val placeholders = values.joinToString(",") { "?" }
        jdbcTemplate.update(
            "delete from $tableName where $columnName in ($placeholders)",
            *values.toTypedArray(),
        )
    }

    companion object {
        private const val READING_SAI_CLUB_ID = "00000000-0000-0000-0000-000000000001"

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
