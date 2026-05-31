package com.readmates.club.api

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminClubOperationsControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()

    @AfterEach
    fun cleanup() {
        if (createdSessionTokenHashes.isNotEmpty()) {
            val placeholders = createdSessionTokenHashes.joinToString(",") { "?" }
            jdbcTemplate.update(
                "delete from auth_sessions where session_token_hash in ($placeholders)",
                *createdSessionTokenHashes.toTypedArray(),
            )
        }
        createdSessionTokenHashes.clear()
    }

    @Test
    fun `owner can read aggregate club operations snapshot`() {
        val body =
            mockMvc
                .get("/api/admin/clubs/$READING_SAI_CLUB_ID/operations") {
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("admin.club_operations_snapshot.v1") }
                    jsonPath("$.club.clubId") { value(READING_SAI_CLUB_ID) }
                    jsonPath("$.readiness.state") { exists() }
                    jsonPath("$.memberActivity.activeCount") { exists() }
                    jsonPath("$.notificationHealth.failureClusters") { exists() }
                    jsonPath("$.safeLinks[0].href") { exists() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).doesNotContain("@example.com")
        assertThat(body.lowercase()).doesNotContain("review body")
        assertThat(body.lowercase()).doesNotContain("note body")
    }

    @Test
    fun `support can read aggregate club operations snapshot`() {
        mockMvc
            .get("/api/admin/clubs/$READING_SAI_CLUB_ID/operations") {
                cookie(sessionCookieForUser(SUPPORT_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$.schema") { value("admin.club_operations_snapshot.v1") }
            }
    }

    @Test
    fun `missing club returns not found`() {
        mockMvc
            .get("/api/admin/clubs/${UUID.randomUUID()}/operations") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isNotFound() }
            }
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminClubOperationsControllerTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private companion object {
        private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
        private const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
        private const val READING_SAI_CLUB_ID = "00000000-0000-0000-0000-000000000001"
    }
}
