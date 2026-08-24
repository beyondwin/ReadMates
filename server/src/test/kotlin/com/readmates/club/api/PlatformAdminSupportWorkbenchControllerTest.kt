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
import org.springframework.mock.web.MockHttpServletResponse
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.transaction.annotation.Transactional
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Tag("integration")
@Transactional
class PlatformAdminSupportWorkbenchControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `owner uses no-store body search and canonical create revoke`() {
        mockMvc
            .get("/api/admin/support/search?query=admin-support") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect { status { isMethodNotAllowed() } }

        val searchBody =
            mockMvc
                .post("/api/admin/support/search") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"query":"admin-support","clubId":"$TEST_CLUB_ID"}"""
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    header { string("Cache-Control", "no-store") }
                    jsonPath("$[0].maskedEmail") { value("a***@example.com") }
                    jsonPath("$[0].grantEligible") { value(true) }
                }.andReturn()
                .response
                .contentAsString
        assertThat(searchBody).doesNotContain("admin-support@example.com")

        val expiry = OffsetDateTime.now(ZoneOffset.UTC).plusHours(2)
        val preview =
            mockMvc
                .post("/api/admin/support/grants/preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "clubId": "$TEST_CLUB_ID",
                          "granteeSubjectId": "$SUPPORT_USER_ID",
                          "scope": "HOST_SUPPORT_READ",
                          "reasonCategory": "MEMBER_ASSISTANCE",
                          "note": "Customer escalation ticket #1234",
                          "expiresAt": "$expiry"
                        }
                        """.trimIndent()
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.reasonCategory") { value("MEMBER_ASSISTANCE") }
                    jsonPath("$.notePresent") { value(true) }
                }.andReturn()
        val previewId = checkNotNull(preview.response.jsonPathValue<String>("$.previewId"))

        val result =
            mockMvc
                .post("/api/admin/support/grants/confirm") {
                    contentType = MediaType.APPLICATION_JSON
                    content =
                        """
                        {
                          "previewId": "$previewId",
                          "idempotencyKey": "support-web-key-0001",
                          "clubId": "$TEST_CLUB_ID",
                          "granteeSubjectId": "$SUPPORT_USER_ID",
                          "scope": "HOST_SUPPORT_READ",
                          "reasonCategory": "MEMBER_ASSISTANCE",
                          "note": "Customer escalation ticket #1234",
                          "expiresAt": "$expiry",
                          "confirmed": true
                        }
                        """.trimIndent()
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.notePresent") { value(true) }
                    jsonPath("$.outcome") { value("SUCCEEDED") }
                }.andReturn()
        val grantId = checkNotNull(result.response.jsonPathValue<String>("$.grantId"))

        mockMvc
            .get("/api/admin/support/grants?clubId=$TEST_CLUB_ID") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[0].granteeMaskedEmail") { value("a***@example.com") }
                jsonPath("$.items[0].granteeUserId") { doesNotExist() }
                jsonPath("$.items[0].reason") { doesNotExist() }
            }

        val revokePreview =
            mockMvc
                .post("/api/admin/support/grants/$grantId/revoke/preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"reasonCategory":"SECURITY_REVIEW","note":null}"""
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect { status { isOk() } }
                .andReturn()
                .response
                .jsonPathValue<String>("$.previewId")
        mockMvc
            .post("/api/admin/support/grants/$grantId/revoke/confirm") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "previewId": "$revokePreview",
                      "idempotencyKey": "support-web-key-0002",
                      "clubId": "$TEST_CLUB_ID",
                      "scope": "HOST_SUPPORT_READ",
                      "expiresAt": "$expiry",
                      "reasonCategory": "SECURITY_REVIEW",
                      "note": null,
                      "confirmed": true
                    }
                    """.trimIndent()
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$.afterStatus") { value("REVOKED") }
            }
    }

    @Test
    fun `operator cannot search sensitive support subjects`() {
        mockMvc
            .post("/api/admin/support/search") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"query":"admin-support","clubId":null}"""
                cookie(sessionCookieForUser(OPERATOR_USER_ID))
            }.andExpect {
                status { isForbidden() }
            }
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminSupportWorkbenchControllerTest",
                ipAddress = "127.0.0.1",
            )
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    private companion object {
        private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
        private const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
        private const val OPERATOR_USER_ID = "00000000-0000-0000-0000-000000000902"
        private const val TEST_CLUB_ID = "00000000-0000-0000-0000-000000000001"
    }
}

private inline fun <reified T> MockHttpServletResponse.jsonPathValue(expression: String): T? =
    com.jayway.jsonpath.JsonPath
        .read(contentAsString, expression)
