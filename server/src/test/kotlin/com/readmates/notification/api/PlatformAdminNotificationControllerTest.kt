package com.readmates.notification.api

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
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.result.MockMvcResultHandlers.print
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminNotificationControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()

    @AfterEach
    fun cleanup() {
        jdbcTemplate.update("delete from platform_audit_events where actor_user_id = ?", OWNER_USER_ID)
        jdbcTemplate.update("delete from admin_notification_replay_previews where actor_user_id in (?, ?)", OWNER_USER_ID, SUPPORT_USER_ID)
        jdbcTemplate.update("delete from notification_deliveries where event_id = ?", EVENT_ID)
        jdbcTemplate.update("delete from notification_event_outbox where id = ?", EVENT_ID)
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
    fun `owner can inspect snapshot and replay failed delivery without raw recipient exposure`() {
        seedFailedDelivery()

        mockMvc
            .get("/api/admin/notifications/snapshot") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$.generatedAt") { exists() }
                jsonPath("$.clubHealth[0].slug") { exists() }
            }

        mockMvc
            .get("/api/admin/notifications/deliveries?status=DEAD") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$.items[0].maskedRecipient") { value("m***@example.com") }
                jsonPath("$.items[0].safeErrorCode") { value("mailbox_unavailable") }
            }.andReturn()
            .response
            .contentAsString
            .also { body ->
                assertThat(body).doesNotContain("member1@example.com")
                assertThat(body.lowercase()).doesNotContain("smtp")
            }

        val previewResult =
            mockMvc
                .post("/api/admin/notifications/replay-preview") {
                    contentType = MediaType.APPLICATION_JSON
                    content = "{}"
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andDo {
                    print()
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.previewId") { exists() }
                    jsonPath("$.selectionHash") { exists() }
                    jsonPath("$.matchedCount") { value(1) }
                }.andReturn()
        val previewId = previewResult.response.jsonPathValue<String>("$.previewId")
        val selectionHash = previewResult.response.jsonPathValue<String>("$.selectionHash")

        mockMvc
            .post("/api/admin/notifications/replay-confirm") {
                contentType = MediaType.APPLICATION_JSON
                content =
                    """
                    {
                      "previewId": "$previewId",
                      "selectionHash": "$selectionHash",
                      "reason": "Retry failed delivery after provider recovery"
                    }
                    """.trimIndent()
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$.replayedCount") { value(1) }
                jsonPath("$.skippedCount") { value(0) }
            }

        assertThat(deliveryStatus()).isEqualTo("PENDING")
        assertThat(
            jdbcTemplate.queryForObject(
                "select count(*) from platform_audit_events where actor_user_id = ? and event_type = 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED'",
                Long::class.java,
                OWNER_USER_ID,
            ),
        ).isEqualTo(1)
    }

    @Test
    fun `support can read snapshot but cannot replay`() {
        seedFailedDelivery()

        mockMvc
            .get("/api/admin/notifications/snapshot") {
                cookie(sessionCookieForUser(SUPPORT_USER_ID))
            }.andExpect {
                status { isOk() }
            }

        mockMvc
            .post("/api/admin/notifications/replay-preview") {
                contentType = MediaType.APPLICATION_JSON
                content = "{}"
                cookie(sessionCookieForUser(SUPPORT_USER_ID))
            }.andExpect {
                status { isForbidden() }
            }
    }

    private fun seedFailedDelivery() {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status,
              kafka_key, attempt_count, last_error, dedupe_key, created_at, updated_at
            )
            values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('sessionId', ?), 'FAILED', ?, 1,
                    'SMTP 550 token=abc member1@example.com SQLSTATE 42S02', ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            EVENT_ID,
            CLUB_ID,
            SESSION_ID,
            SESSION_ID,
            CLUB_ID,
            "admin-notification-controller-$EVENT_ID",
        )
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key,
              attempt_count, last_error, created_at, updated_at
            )
            values (?, ?, ?, ?, 'EMAIL', 'DEAD', ?, 2, 'SMTP 550 member1@example.com', utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            DELIVERY_ID,
            EVENT_ID,
            CLUB_ID,
            MEMBER_ID,
            "admin-notification-controller-delivery-$DELIVERY_ID",
        )
    }

    private fun deliveryStatus(): String =
        jdbcTemplate.queryForObject(
            "select status from notification_deliveries where id = ?",
            String::class.java,
            DELIVERY_ID,
        ) ?: ""

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminNotificationControllerTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    companion object {
        private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
        private const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
        private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private const val MEMBER_ID = "00000000-0000-0000-0000-000000000202"
        private const val SESSION_ID = "00000000-0000-0000-0000-000000000301"
        private const val EVENT_ID = "00000000-0000-0000-0000-000000007801"
        private const val DELIVERY_ID = "00000000-0000-0000-0000-000000007901"
    }
}

private inline fun <reified T> org.springframework.mock.web.MockHttpServletResponse.jsonPathValue(expression: String): T =
    com.jayway.jsonpath.JsonPath
        .read(contentAsString, expression)
