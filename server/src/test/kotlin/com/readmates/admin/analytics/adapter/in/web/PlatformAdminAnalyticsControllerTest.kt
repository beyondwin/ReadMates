@file:Suppress("ktlint:standard:package-name")

package com.readmates.admin.analytics.adapter.`in`.web

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
class PlatformAdminAnalyticsControllerTest(
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
    fun `owner reads analytics overview with five kpis and no private data`() {
        val body =
            mockMvc
                .get("/api/admin/analytics/overview?window=30d") {
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.schema") { value("admin.analytics_overview.v1") }
                    jsonPath("$.window") { value("30d") }
                    jsonPath("$.kpis.length()") { value(5) }
                    jsonPath("$.kpis[0].key") { exists() }
                    jsonPath("$.clubBenchmark.availability") { exists() }
                    jsonPath("$.series.length()") { value(5) }
                    jsonPath("$.series[0].key") { exists() }
                    jsonPath("$.series[0].points") { exists() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).doesNotContain("@example.com")
        assertThat(body).doesNotContain("{\"raw")
    }

    @Test
    fun `defaults to 30d when window param is missing or invalid`() {
        mockMvc
            .get("/api/admin/analytics/overview?window=bogus") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$.window") { value("30d") }
            }
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminAnalyticsControllerTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private companion object {
        private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
    }
}
