package com.readmates.club.api

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Tag("integration")
class SupportAccessGrantControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `legacy one click create and revoke require the canonical confirmation flow without effects`() {
        val before = mutationCounts()
        val cookie = sessionCookieForOwner()

        mockMvc
            .post("/api/admin/support-access-grants") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "clubId": "$TEST_CLUB_ID",
                      "granteeUserId": "$SUPPORT_USER_ID",
                      "scope": "HOST_SUPPORT_READ",
                      "reason": "legacy request",
                      "expiresAt": "2026-08-25T12:00:00Z"
                    }
                    """.trimIndent()
                cookie(cookie)
            }.andExpect {
                status { isGone() }
                jsonPath("$.code") { value("SAFE_CONFIRM_REQUIRED") }
            }

        mockMvc
            .delete("/api/admin/support-access-grants/${UUID.randomUUID()}") {
                cookie(cookie)
            }.andExpect {
                status { isGone() }
                jsonPath("$.code") { value("SAFE_CONFIRM_REQUIRED") }
            }

        assertThat(mutationCounts()).isEqualTo(before)
    }

    @Test
    fun `legacy read remains compatible without exposing a write path`() {
        mockMvc
            .get("/api/admin/support-access-grants?clubId=$TEST_CLUB_ID") {
                cookie(sessionCookieForOwner())
            }.andExpect { status { isOk() } }
    }

    private fun mutationCounts(): Map<String, Long> =
        listOf(
            "support_access_grants",
            "platform_admin_support_command_previews",
            "platform_admin_support_command_receipts",
            "platform_audit_events",
            "platform_admin_command_idempotency",
        ).associateWith { table ->
            checkNotNull(jdbcTemplate.queryForObject("select count(*) from $table", Long::class.java))
        }

    private fun sessionCookieForOwner(): Cookie {
        val session =
            authSessionService.issueSession(
                userId = OWNER_USER_ID,
                userAgent = "SupportAccessGrantControllerTest",
                ipAddress = "127.0.0.1",
            )
        return Cookie(AuthSessionService.COOKIE_NAME, session.rawToken)
    }

    private companion object {
        private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
        private const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
        private const val TEST_CLUB_ID = "00000000-0000-0000-0000-000000000001"
    }
}
