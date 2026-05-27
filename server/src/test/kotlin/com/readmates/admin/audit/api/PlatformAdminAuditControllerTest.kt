package com.readmates.admin.audit.api

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
import java.util.UUID

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@AutoConfigureMockMvc
@Tag("integration")
class PlatformAdminAuditControllerTest(
    @param:Autowired private val mockMvc: MockMvc,
    @param:Autowired private val authSessionService: AuthSessionService,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val createdSessionTokenHashes = linkedSetOf<String>()

    @AfterEach
    fun cleanup() {
        jdbcTemplate.update("delete from platform_audit_events where id in (?, ?)", PLATFORM_EVENT_ID, SUPPORT_EVENT_ID)
        jdbcTemplate.update("delete from club_audit_events where id = ?", CLUB_EVENT_ID)
        jdbcTemplate.update("delete from ai_generation_audit_log where job_id = ?", AI_JOB_ID)
        jdbcTemplate.update("delete from admin_notification_replay_previews where id = ?", PREVIEW_ID)
        if (createdSessionTokenHashes.isNotEmpty()) {
            val bindMarks = createdSessionTokenHashes.joinToString(",") { "?" }
            jdbcTemplate.update(
                "delete from auth_sessions where session_token_hash in ($bindMarks)",
                *createdSessionTokenHashes.toTypedArray(),
            )
        }
        createdSessionTokenHashes.clear()
    }

    @Test
    fun `owner reads unified audit ledger without raw metadata leakage`() {
        seedAuditRows()

        val body =
            mockMvc
                .get("/api/admin/audit/events?range=7d&limit=10") {
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    content { contentTypeCompatibleWith(MediaType.APPLICATION_JSON) }
                    jsonPath("$.generatedAt") { exists() }
                    jsonPath("$.items[0].sourceTable") { exists() }
                    jsonPath("$.items[?(@.actionType == 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED')]") { exists() }
                    jsonPath("$.items[?(@.actionType == 'SUPPORT_ACCESS_GRANT_CREATED')]") { exists() }
                    jsonPath("$.items[?(@.actionType == 'AI_GENERATION_AUDIT')]") { exists() }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).contains("selectionHashPrefix")
        assertThat(body).doesNotContain("member1@example.com")
        assertThat(body).doesNotContain("SMTP 550")
        assertThat(body).doesNotContain("transcript body")
        assertThat(body).doesNotContain("\"metadataJson\"")
    }

    @Test
    fun `support can read ledger but target user id is masked`() {
        seedAuditRows()

        val body =
            mockMvc
                .get("/api/admin/audit/events?sourceSlice=S4") {
                    cookie(sessionCookieForUser(SUPPORT_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items[0].target.label") { value("사용자 숨김") }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).doesNotContain(MEMBER_USER_ID)
    }

    @Test
    fun `member cannot read admin audit ledger`() {
        mockMvc
            .get("/api/admin/audit/events") {
                cookie(sessionCookieForUser(MEMBER_USER_ID))
            }.andExpect {
                status { isForbidden() }
            }
    }

    private fun seedAuditRows() {
        jdbcTemplate.update(
            """
            insert into platform_audit_events (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, 'OWNER', ?, 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED',
                    json_object('previewId', ?, 'selectionHash', ?, 'reason', 'provider recovered', 'replayedCount', 2, 'skippedCount', 0),
                    utc_timestamp(6))
            """.trimIndent(),
            PLATFORM_EVENT_ID,
            OWNER_USER_ID,
            MEMBER_USER_ID,
            PREVIEW_ID,
            "a".repeat(64),
        )
        jdbcTemplate.update(
            """
            insert into platform_audit_events (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, 'OWNER', ?, 'SUPPORT_ACCESS_GRANT_CREATED',
                    json_object('grantId', 'grant-1', 'clubId', ?, 'granteeUserId', ?, 'scope', 'METADATA_READ', 'expiresAt', '2026-05-28T00:00:00Z'),
                    utc_timestamp(6))
            """.trimIndent(),
            SUPPORT_EVENT_ID,
            OWNER_USER_ID,
            MEMBER_USER_ID,
            CLUB_ID,
            MEMBER_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into club_audit_events (id, actor_user_id, actor_platform_role, club_id, event_type, metadata_json, created_at)
            values (?, ?, 'OPERATOR', ?, 'CLUB_STATUS_CHANGED', json_object('reason', 'manual review'), utc_timestamp(6))
            """.trimIndent(),
            CLUB_EVENT_ID,
            OWNER_USER_ID,
            CLUB_ID,
        )
        jdbcTemplate.update(
            """
            insert into ai_generation_audit_log (
              job_id, session_id, club_id, host_user_id, kind, provider, model, status, error_code,
              input_tokens, cached_input_tokens, output_tokens, cost_estimate_usd, latency_ms, created_at
            )
            values (?, ?, ?, ?, 'GENERATE', 'openai', 'gpt-safe', 'FAILED', 'PROVIDER_UNAVAILABLE',
                    10, 0, 3, 0.0100, 1200, utc_timestamp(6))
            """.trimIndent(),
            AI_JOB_ID,
            SESSION_ID,
            CLUB_ID,
            MEMBER_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_previews (id, actor_user_id, filter_json, selection_hash, matched_count, expires_at, consumed_at, created_at)
            values (?, ?, json_object('deliveryStatus', 'DEAD'), ?, 2, timestampadd(MINUTE, 10, utc_timestamp(6)), null, utc_timestamp(6))
            """.trimIndent(),
            PREVIEW_ID,
            OWNER_USER_ID,
            "a".repeat(64),
        )
    }

    private fun sessionCookieForUser(userId: String): Cookie {
        val issuedSession =
            authSessionService.issueSession(
                userId = UUID.fromString(userId).toString(),
                userAgent = "PlatformAdminAuditControllerTest",
                ipAddress = "127.0.0.1",
            )
        createdSessionTokenHashes += issuedSession.storedTokenHash
        return Cookie(AuthSessionService.COOKIE_NAME, issuedSession.rawToken)
    }

    companion object {
        private const val OWNER_USER_ID = "00000000-0000-0000-0000-000000000901"
        private const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
        private const val MEMBER_USER_ID = "00000000-0000-0000-0000-000000000102"
        private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private const val SESSION_ID = "00000000-0000-0000-0000-000000000301"
        private const val PLATFORM_EVENT_ID = "00000000-0000-0000-0000-000000008101"
        private const val SUPPORT_EVENT_ID = "00000000-0000-0000-0000-000000008102"
        private const val CLUB_EVENT_ID = "00000000-0000-0000-0000-000000008201"
        private const val PREVIEW_ID = "00000000-0000-0000-0000-000000008301"
        private const val AI_JOB_ID = "00000000-0000-0000-0000-000000008401"
    }
}
