package com.readmates.auth.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@AutoConfigureMockMvc
class MemberLifecycleAuthTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
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
        }
    }

    @Test
    fun `suspended and left members resolve auth me with blocked states`() {
        val suspendedCookie = sessionCookieForLifecycleMember("suspended.auth", "SUSPENDED")
        val leftCookie = sessionCookieForLifecycleMember("left.auth", "LEFT")

        mockMvc.get("/api/auth/me") { cookie(suspendedCookie) }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.membershipStatus") { value("SUSPENDED") }
                jsonPath("$.approvalState") { value("SUSPENDED") }
            }

        mockMvc.get("/api/auth/me") { cookie(leftCookie) }
            .andExpect {
                status { isOk() }
                jsonPath("$.authenticated") { value(true) }
                jsonPath("$.membershipStatus") { value("LEFT") }
                jsonPath("$.approvalState") { value("INACTIVE") }
            }
    }

    private fun sessionCookieForLifecycleMember(prefix: String, status: String): Cookie {
        val userId = UUID.randomUUID().toString()
        val membershipId = UUID.randomUUID().toString()
        val email = "$prefix.${UUID.randomUUID()}@example.com"
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, ?, ?, ?, 'PASSWORD')
            """.trimIndent(),
            userId,
            email,
            prefix,
            prefix,
        )
        createdUserIds += userId
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at)
            values (?, '00000000-0000-0000-0000-000000000001', ?, 'MEMBER', ?, utc_timestamp(6))
            """.trimIndent(),
            membershipId,
            userId,
            status,
        )
        createdMembershipIds += membershipId

        val issuedSession = authSessionService.issueSession(
            userId = userId,
            userAgent = "MemberLifecycleAuthTest",
            ipAddress = "127.0.0.1",
        )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

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
