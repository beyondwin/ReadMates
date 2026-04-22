package com.readmates.auth.api

import com.readmates.auth.application.AuthSessionService
import com.readmates.support.MySqlTestContainer
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.jdbc.Sql
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
        "readmates.auth.session-cookie-secure=false",
    ],
)
@AutoConfigureMockMvc
@Sql(statements = [PasswordAuthControllerTest.CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class PasswordAuthControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val authSessionService: AuthSessionService,
) {
    @Test
    fun `legacy password login endpoint is gone`() {
        val result = mockMvc.post("/api/auth/login") {
            contentType = org.springframework.http.MediaType.APPLICATION_JSON
            content = """{"email":"member@example.com","password":"correct horse battery staple"}"""
        }.andExpect {
            status { isGone() }
        }.andReturn()

        assertEquals("Password login has been removed", result.response.errorMessage)
    }

    @Test
    fun `logout revokes current session and clears cookie`() {
        val issuedSession = authSessionService.issueSession(
            userId = SEED_HOST_USER_ID,
            userAgent = "PasswordAuthControllerTest",
            ipAddress = "127.0.0.1",
        )
        val cookie = Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)

        mockMvc.post("/api/auth/logout") {
            cookie(cookie)
        }.andExpect {
            status { isNoContent() }
            cookie { maxAge(AuthSessionService.COOKIE_NAME, 0) }
        }

        val revokedAt = jdbcTemplate.queryForObject(
            "select revoked_at from auth_sessions where session_token_hash = ?",
            Any::class.java,
            issuedSession.storedTokenHash,
        )
        assertNotNull(revokedAt)
    }

    companion object {
        private const val SEED_HOST_USER_ID = "00000000-0000-0000-0000-000000000101"

        private const val CLEANUP_SQL = """
            delete from auth_sessions
            where user_id = '00000000-0000-0000-0000-000000000101'
              and user_agent = 'PasswordAuthControllerTest';
        """

        @JvmStatic
        @DynamicPropertySource
        fun registerDatasourceProperties(registry: DynamicPropertyRegistry) {
            MySqlTestContainer.registerDatasourceProperties(registry)
        }
    }
}
