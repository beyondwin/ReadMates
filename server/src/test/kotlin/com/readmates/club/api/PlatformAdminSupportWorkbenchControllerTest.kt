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
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminSupportWorkbenchControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()
    private val createdGrantIds = linkedSetOf<String>()

    @AfterEach
    fun cleanup() {
        deleteWhereIn("support_access_grants", "id", createdGrantIds)
        deleteWhereIn("auth_sessions", "session_token_hash", createdSessionTokenHashes)
        createdSessionTokenHashes.clear()
        createdGrantIds.clear()
    }

    @Test
    fun `owner can search masked support subject and manage grant`() {
        val searchBody =
            mockMvc
                .get("/api/admin/support/search?query=admin-support") {
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$[0].maskedEmail") { value("a***@example.com") }
                    jsonPath("$[0].grantEligible") { value(true) }
                }.andReturn()
                .response
                .contentAsString
        assertThat(searchBody).doesNotContain("admin-support@example.com")

        val result =
            mockMvc
                .post("/api/admin/support/grants") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "clubId": "$TEST_CLUB_ID",
                          "granteeSubjectId": "$SUPPORT_USER_ID",
                          "scope": "HOST_SUPPORT_READ",
                          "reason": "Customer escalation ticket #1234",
                          "expiresAt": "${OffsetDateTime.now(ZoneOffset.UTC).plusHours(2)}"
                        }
                        """.trimIndent()
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.granteeUserId") { value(SUPPORT_USER_ID) }
                }.andReturn()
        val grantId = checkNotNull(result.response.jsonPathValue<String>("$.id"))
        createdGrantIds += grantId

        mockMvc
            .get("/api/admin/support/grants?clubId=$TEST_CLUB_ID") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$[0].granteeMaskedEmail") { value("a***@example.com") }
            }

        mockMvc
            .delete("/api/admin/support/grants/$grantId") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isNoContent() }
            }
    }

    @Test
    fun `support search returns empty context`() {
        mockMvc
            .get("/api/admin/support/search?query=admin-support") {
                cookie(sessionCookieForUser(SUPPORT_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$") { isArray() }
                jsonPath("$.length()") { value(0) }
            }
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminSupportWorkbenchControllerTest",
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
        if (values.isEmpty()) return
        val placeholders = values.joinToString(",") { "?" }
        jdbcTemplate.update("delete from $tableName where $columnName in ($placeholders)", *values.toTypedArray())
    }

    private companion object {
        private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
        private const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
        private const val TEST_CLUB_ID = "00000000-0000-0000-0000-000000000001"
    }
}

private inline fun <reified T> MockHttpServletResponse.jsonPathValue(expression: String): T? =
    com.jayway.jsonpath.JsonPath
        .read(contentAsString, expression)
