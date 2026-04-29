package com.readmates.club.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@AutoConfigureMockMvc
class PlatformAdminControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdPlatformAdminUserIds = linkedSetOf<String>()
    private val createdUserIds = linkedSetOf<String>()

    @AfterEach
    fun cleanupCreatedRows() {
        try {
            deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
            deleteWhereIn("auth_sessions", "user_id", createdUserIds)
            deleteWhereIn("platform_admins", "user_id", createdPlatformAdminUserIds)
            deleteWhereIn("users", "id", createdUserIds)
        } finally {
            createdSessionTokenHashes.clear()
            createdPlatformAdminUserIds.clear()
            createdUserIds.clear()
            SecurityContextHolder.clearContext()
        }
    }

    @Test
    fun `host without platform admin cannot access admin API`() {
        mockMvc.get("/api/admin/summary") {
            cookie(sessionCookieForUser("00000000-0000-0000-0000-000000000101"))
        }.andExpect {
            status { isForbidden() }
        }
    }

    @Test
    fun `active owner can access admin summary`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "ACTIVE")

        mockMvc.get("/api/admin/summary") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isOk() }
            jsonPath("$.platformRole") { value("OWNER") }
            jsonPath("$.activeClubCount") { value(2) }
            jsonPath("$.domainActionRequiredCount") { value(0) }
        }
    }

    @Test
    fun `disabled owner cannot access admin API`() {
        val owner = createPlatformAdminUser(role = "OWNER", status = "DISABLED")

        mockMvc.get("/api/admin/summary") {
            cookie(sessionCookieForUser(owner))
        }.andExpect {
            status { isForbidden() }
        }
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
            userAgent = "PlatformAdminControllerTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

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
        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
