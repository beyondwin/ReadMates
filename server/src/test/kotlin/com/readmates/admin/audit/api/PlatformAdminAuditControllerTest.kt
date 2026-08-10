package com.readmates.admin.audit.api

import com.readmates.auth.application.service.AuthSessionService
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import jakarta.servlet.http.Cookie
import org.assertj.core.api.Assertions.assertThat
import org.hamcrest.Matchers.everyItem
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasItems
import org.hamcrest.Matchers.`is`
import org.hamcrest.Matchers.nullValue
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
        jdbcTemplate.update(
            """
            update admin_notification_replay_previews
            set consumed_at = null, consumed_confirmation_id = null
            where id in (?, ?, ?)
            """.trimIndent(),
            SCOPED_PREVIEW_ID,
            OTHER_SCOPED_PREVIEW_ID,
            GLOBAL_PREVIEW_ID,
        )
        jdbcTemplate.update(
            "delete from admin_notification_replay_confirmations where id in (?, ?, ?)",
            SCOPED_CONFIRMATION_ID,
            OTHER_SCOPED_CONFIRMATION_ID,
            GLOBAL_CONFIRMATION_ID,
        )
        jdbcTemplate.update(
            "delete from platform_audit_events where id in (?, ?, ?, ?, ?)",
            PLATFORM_EVENT_ID,
            SUPPORT_EVENT_ID,
            SCOPED_PLATFORM_EVENT_ID,
            OTHER_SCOPED_PLATFORM_EVENT_ID,
            GLOBAL_PLATFORM_EVENT_ID,
        )
        jdbcTemplate.update("delete from club_audit_events where id = ?", CLUB_EVENT_ID)
        jdbcTemplate.update("delete from ai_generation_audit_log where job_id = ?", AI_JOB_ID)
        jdbcTemplate.update(
            "delete from admin_notification_replay_previews where id in (?, ?, ?, ?, ?)",
            PREVIEW_ID,
            SCOPED_PREVIEW_ID,
            OTHER_SCOPED_PREVIEW_ID,
            GLOBAL_PREVIEW_ID,
            LEGACY_PREVIEW_ID,
        )
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
                    jsonPath(
                        "$.items[?(@.id == 'platform_audit_events:$PLATFORM_EVENT_ID')].sourceTable",
                    ) {
                        value(hasItem("platform_audit_events"))
                    }
                    jsonPath("$.items[*].actionType") {
                        value(
                            hasItems(
                                "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
                                "SUPPORT_ACCESS_GRANT_CREATED",
                                "AI_GENERATION_AUDIT",
                            ),
                        )
                    }
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
                    jsonPath(
                        "$.items[?(@.id == 'platform_audit_events:$SUPPORT_EVENT_ID')].target.label",
                    ) {
                        value(hasItem("사용자 숨김"))
                    }
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

    @Test
    fun `operator reads scoped replay preparation and sole confirmation with bounded metadata`() {
        seedReplayProjectionRows()

        val body =
            mockMvc
                .get("/api/admin/audit/events?range=7d&sourceSlice=S5&clubId=$CLUB_ID&limit=20") {
                    cookie(sessionCookieForUser(OPERATOR_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath("$.items[*].actor.role") { value(everyItem(`is`("OPERATOR"))) }
                    jsonPath("$.items[*].target.clubId") { value(everyItem(`is`(CLUB_ID))) }
                    jsonPath("$.items[*].actionType") {
                        value(
                            hasItems(
                                "ADMIN_NOTIFICATION_REPLAY_CONFIRMED",
                                "ADMIN_NOTIFICATION_REPLAY_PREVIEW_CONSUMED",
                            ),
                        )
                    }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).containsOnlyOnce("\"actionType\":\"ADMIN_NOTIFICATION_REPLAY_CONFIRMED\"")
        assertThat(body).contains("selectionHashPrefix", "replayedCount", "skippedCount", "consumedAt")
        assertThat(body).doesNotContain(
            OTHER_SCOPED_PREVIEW_ID,
            OTHER_SCOPED_PLATFORM_EVENT_ID,
            GLOBAL_PREVIEW_ID,
            GLOBAL_PLATFORM_EVENT_ID,
            LEGACY_PREVIEW_ID,
            "reasonPresent",
            "operator raw reason",
            "member1@example.com",
            "SMTP 550 provider response",
            DELIVERY_ID,
            "previewId",
        )
    }

    @Test
    fun `global replay stays global and consumed v1 preview remains legacy evidence`() {
        seedReplayProjectionRows()

        val body =
            mockMvc
                .get("/api/admin/audit/events?range=7d&sourceSlice=S5&limit=20") {
                    cookie(sessionCookieForUser(OWNER_USER_ID))
                }.andExpect {
                    status { isOk() }
                    jsonPath(
                        "$.items[?(@.id == 'admin_notification_replay_previews:$GLOBAL_PREVIEW_ID')].target.clubId",
                    ) {
                        value(hasItem(nullValue()))
                    }
                    jsonPath(
                        "$.items[?(@.id == 'admin_notification_replay_previews:$LEGACY_PREVIEW_ID')].actionType",
                    ) {
                        value(hasItem("ADMIN_NOTIFICATION_REPLAY_PREVIEW_LEGACY"))
                    }
                }.andReturn()
                .response
                .contentAsString

        assertThat(body).containsOnlyOnce(
            "\"id\":\"platform_audit_events:$GLOBAL_PLATFORM_EVENT_ID\"",
        )
        assertThat(body).doesNotContain("ADMIN_NOTIFICATION_REPLAY_PREVIEW_CONFIRMED")
    }

    private fun seedAuditRows() {
        seedNotificationReplayEvent()
        seedSupportGrantEvent()
        seedClubAuditEvent()
        seedAiAuditEvent()
        seedReplayPreview()
    }

    private fun seedNotificationReplayEvent() {
        jdbcTemplate.update(
            """
            insert into platform_audit_events (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, 'OWNER', ?, 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED',
                    json_object('previewId', ?, 'selectionHash', ?, 'reason', 'provider recovered', 'replayedCount', 2, 'skippedCount', 0),
                    timestampadd(MINUTE, -1, utc_timestamp(6)))
            """.trimIndent(),
            PLATFORM_EVENT_ID,
            OWNER_USER_ID,
            MEMBER_USER_ID,
            PREVIEW_ID,
            "a".repeat(64),
        )
    }

    private fun seedSupportGrantEvent() {
        jdbcTemplate.update(
            """
            insert into platform_audit_events (id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at)
            values (?, ?, 'OWNER', ?, 'SUPPORT_ACCESS_GRANT_CREATED',
                    json_object('grantId', 'grant-1', 'clubId', ?, 'granteeUserId', ?, 'scope', 'METADATA_READ', 'expiresAt', '2026-05-28T00:00:00Z'),
                    timestampadd(MINUTE, -1, utc_timestamp(6)))
            """.trimIndent(),
            SUPPORT_EVENT_ID,
            OWNER_USER_ID,
            MEMBER_USER_ID,
            CLUB_ID,
            MEMBER_USER_ID,
        )
    }

    private fun seedClubAuditEvent() {
        jdbcTemplate.update(
            """
            insert into club_audit_events (id, actor_user_id, actor_platform_role, club_id, event_type, metadata_json, created_at)
            values (?, ?, 'OPERATOR', ?, 'CLUB_STATUS_CHANGED', json_object('reason', 'manual review'),
                    timestampadd(MINUTE, -1, utc_timestamp(6)))
            """.trimIndent(),
            CLUB_EVENT_ID,
            OWNER_USER_ID,
            CLUB_ID,
        )
    }

    private fun seedAiAuditEvent() {
        jdbcTemplate.update(
            """
            insert into ai_generation_audit_log (
              job_id, session_id, club_id, host_user_id, kind, provider, model, status, error_code,
              input_tokens, cached_input_tokens, output_tokens, cost_estimate_usd, latency_ms, created_at
            )
            values (?, ?, ?, ?, 'GENERATE', 'openai', 'gpt-safe', 'FAILED', 'PROVIDER_UNAVAILABLE',
                    10, 0, 3, 0.0100, 1200, timestampadd(MINUTE, -1, utc_timestamp(6)))
            """.trimIndent(),
            AI_JOB_ID,
            SESSION_ID,
            CLUB_ID,
            MEMBER_USER_ID,
        )
    }

    private fun seedReplayPreview() {
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_previews (id, actor_user_id, filter_json, selection_hash, matched_count, expires_at, consumed_at, created_at)
            values (?, ?, json_object('deliveryStatus', 'DEAD'), ?, 2, timestampadd(MINUTE, 10, utc_timestamp(6)), null,
                    timestampadd(MINUTE, -1, utc_timestamp(6)))
            """.trimIndent(),
            PREVIEW_ID,
            OWNER_USER_ID,
            "a".repeat(64),
        )
    }

    private fun seedReplayProjectionRows() {
        seedV2Replay(
            previewId = SCOPED_PREVIEW_ID,
            confirmationId = SCOPED_CONFIRMATION_ID,
            platformEventId = SCOPED_PLATFORM_EVENT_ID,
            clubId = CLUB_ID,
            actorUserId = OPERATOR_USER_ID,
            actorRole = "OPERATOR",
            selectionHash = "b".repeat(64),
        )
        seedV2Replay(
            previewId = OTHER_SCOPED_PREVIEW_ID,
            confirmationId = OTHER_SCOPED_CONFIRMATION_ID,
            platformEventId = OTHER_SCOPED_PLATFORM_EVENT_ID,
            clubId = OTHER_CLUB_ID,
            actorUserId = OPERATOR_USER_ID,
            actorRole = "OPERATOR",
            selectionHash = "c".repeat(64),
        )
        seedV2Replay(
            previewId = GLOBAL_PREVIEW_ID,
            confirmationId = GLOBAL_CONFIRMATION_ID,
            platformEventId = GLOBAL_PLATFORM_EVENT_ID,
            clubId = null,
            actorUserId = OWNER_USER_ID,
            actorRole = "OWNER",
            selectionHash = "d".repeat(64),
        )
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_previews (
              id, actor_user_id, filter_json, selection_hash, matched_count, expires_at,
              consumed_at, created_at, contract_version, actor_platform_role, club_id
            ) values (?, ?, json_object('deliveryStatus', 'DEAD'), ?, 1,
                      timestampadd(MINUTE, 10, utc_timestamp(6)), timestampadd(SECOND, -30, utc_timestamp(6)),
                      timestampadd(MINUTE, -2, utc_timestamp(6)), 1, null, null)
            """.trimIndent(),
            LEGACY_PREVIEW_ID,
            OWNER_USER_ID,
            "e".repeat(64),
        )
    }

    private fun seedV2Replay(
        previewId: String,
        confirmationId: String,
        platformEventId: String,
        clubId: String?,
        actorUserId: String,
        actorRole: String,
        selectionHash: String,
    ) {
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_previews (
              id, actor_user_id, filter_json, selection_hash, matched_count, expires_at,
              consumed_at, created_at, contract_version, actor_platform_role, club_id
            ) values (?, ?, json_object('deliveryStatus', 'DEAD', 'recipient', 'member1@example.com'), ?, 2,
                      timestampadd(MINUTE, 10, utc_timestamp(6)), null,
                      timestampadd(MINUTE, -1, utc_timestamp(6)), 2, ?, ?)
            """.trimIndent(),
            previewId,
            actorUserId,
            selectionHash,
            actorRole,
            clubId,
        )
        seedReplayConfirmedAudit(platformEventId, actorUserId, actorRole, previewId, clubId, selectionHash)
        jdbcTemplate.update(
            """
            insert into admin_notification_replay_confirmations (
              id, preview_id, actor_user_id, actor_platform_role, club_id, selection_hash,
              replayed_count, skipped_count, platform_audit_event_id, confirmed_at
            ) values (?, ?, ?, ?, ?, ?, 1, 1, ?, timestampadd(SECOND, -30, utc_timestamp(6)))
            """.trimIndent(),
            confirmationId,
            previewId,
            actorUserId,
            actorRole,
            clubId,
            selectionHash,
            platformEventId,
        )
        jdbcTemplate.update(
            """
            update admin_notification_replay_previews
            set consumed_at = timestampadd(SECOND, -30, utc_timestamp(6)), consumed_confirmation_id = ?
            where id = ?
            """.trimIndent(),
            confirmationId,
            previewId,
        )
    }

    private fun seedReplayConfirmedAudit(
        platformEventId: String,
        actorUserId: String,
        actorRole: String,
        previewId: String,
        clubId: String?,
        selectionHash: String,
    ) {
        jdbcTemplate.update(
            """
            insert into platform_audit_events (
              id, actor_user_id, actor_platform_role, target_user_id, event_type, metadata_json, created_at
            ) values (?, ?, ?, null, 'ADMIN_NOTIFICATION_REPLAY_CONFIRMED',
                      json_object(
                        'previewId', ?, 'clubId', ?, 'selectionHash', ?,
                        'reason', 'operator raw reason', 'replayedCount', 1, 'skippedCount', 1,
                        'recipient', 'member1@example.com', 'providerResponse', 'SMTP 550 provider response',
                        'deliveryIds', json_array(?)
                      ), timestampadd(SECOND, -30, utc_timestamp(6)))
            """.trimIndent(),
            platformEventId,
            actorUserId,
            actorRole,
            previewId,
            clubId,
            selectionHash,
            DELIVERY_ID,
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
        private const val OPERATOR_USER_ID = "00000000-0000-0000-0000-000000000902"
        private const val SUPPORT_USER_ID = "00000000-0000-0000-0000-000000000903"
        private const val MEMBER_USER_ID = "00000000-0000-0000-0000-000000000102"
        private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private const val OTHER_CLUB_ID = "00000000-0000-0000-0000-000000000002"
        private const val SESSION_ID = "00000000-0000-0000-0000-000000000301"
        private const val PLATFORM_EVENT_ID = "00000000-0000-0000-0000-000000008101"
        private const val SUPPORT_EVENT_ID = "00000000-0000-0000-0000-000000008102"
        private const val CLUB_EVENT_ID = "00000000-0000-0000-0000-000000008201"
        private const val PREVIEW_ID = "00000000-0000-0000-0000-000000008301"
        private const val AI_JOB_ID = "00000000-0000-0000-0000-000000008401"
        private const val SCOPED_PREVIEW_ID = "00000000-0000-0000-0000-000000008311"
        private const val SCOPED_CONFIRMATION_ID = "00000000-0000-0000-0000-000000008312"
        private const val SCOPED_PLATFORM_EVENT_ID = "00000000-0000-0000-0000-000000008313"
        private const val OTHER_SCOPED_PREVIEW_ID = "00000000-0000-0000-0000-000000008321"
        private const val OTHER_SCOPED_CONFIRMATION_ID = "00000000-0000-0000-0000-000000008322"
        private const val OTHER_SCOPED_PLATFORM_EVENT_ID = "00000000-0000-0000-0000-000000008323"
        private const val GLOBAL_PREVIEW_ID = "00000000-0000-0000-0000-000000008331"
        private const val GLOBAL_CONFIRMATION_ID = "00000000-0000-0000-0000-000000008332"
        private const val GLOBAL_PLATFORM_EVENT_ID = "00000000-0000-0000-0000-000000008333"
        private const val LEGACY_PREVIEW_ID = "00000000-0000-0000-0000-000000008341"
        private const val DELIVERY_ID = "00000000-0000-0000-0000-000000008351"
    }
}
