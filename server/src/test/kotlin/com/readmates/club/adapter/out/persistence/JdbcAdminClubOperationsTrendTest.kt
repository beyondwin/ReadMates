package com.readmates.club.adapter.out.persistence

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.time.Clock
import java.util.UUID

private const val CLUB_ID = "00000000-0000-0000-0000-0000000fd001"
private const val USER_ID = "00000000-0000-0000-0000-0000000fd002"
private const val MEMBERSHIP_ID = "00000000-0000-0000-0000-0000000fd003"
private const val EVENT_ID = "00000000-0000-0000-0000-0000000fd101"

private const val CLEANUP_SQL = """
    delete from ai_generation_audit_log where club_id = '$CLUB_ID';
    delete from notification_deliveries where club_id = '$CLUB_ID';
    delete from notification_event_outbox where club_id = '$CLUB_ID';
    delete from memberships where id = '$MEMBERSHIP_ID';
    delete from users where id = '$USER_ID';
    delete from clubs where id = '$CLUB_ID';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminClubOperationsTrendTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcAdminClubOperationsAdapter(jdbcTemplate, Clock.systemUTC()) }

    @Test
    fun `windows recent and prior failure counts for notifications and ai`() {
        seedClubWithMember()
        insertOutbox(EVENT_ID)
        insertDelivery("d-recent-dead", "DEAD", daysAgo = 1)
        insertDelivery("d-recent-failed", "FAILED", daysAgo = 3)
        insertDelivery("d-prior-failed", "FAILED", daysAgo = 10)
        insertDelivery("d-ancient-dead", "DEAD", daysAgo = 20)
        insertDelivery("d-sent", "SENT", daysAgo = 1)
        insertAiAudit("FAILED", daysAgo = 2)
        insertAiAudit("FAILED", daysAgo = 9)
        insertAiAudit("FAILED", daysAgo = 20)
        insertAiAudit("SUCCESS", daysAgo = 1)

        val snapshot = adapter.loadSnapshot(UUID.fromString(CLUB_ID))

        assertThat(snapshot).isNotNull
        assertThat(snapshot!!.notificationHealth.recentFailed7d).isEqualTo(2)
        assertThat(snapshot.notificationHealth.priorFailed7d).isEqualTo(1)
        assertThat(snapshot.aiUsage.failedRecentJobs).isEqualTo(1)
        assertThat(snapshot.aiUsage.priorFailedJobs7d).isEqualTo(1)
    }

    @Test
    fun `failure clusters only include the recent 7 day window`() {
        seedClubWithMember()
        insertOutbox(EVENT_ID)
        insertDelivery("d-recent", "FAILED", daysAgo = 2)
        insertDelivery("d-old", "FAILED", daysAgo = 12)

        val snapshot = adapter.loadSnapshot(UUID.fromString(CLUB_ID))

        val total = snapshot!!.notificationHealth.failureClusters.sumOf { it.count }
        assertThat(total).isEqualTo(1)
    }

    @Test
    fun `clean club reports zero trend counts`() {
        seedClubWithMember()

        val snapshot = adapter.loadSnapshot(UUID.fromString(CLUB_ID))

        assertThat(snapshot!!.notificationHealth.recentFailed7d).isEqualTo(0)
        assertThat(snapshot.notificationHealth.priorFailed7d).isEqualTo(0)
        assertThat(snapshot.aiUsage.priorFailedJobs7d).isEqualTo(0)
    }

    private fun seedClubWithMember() {
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about, status, public_visibility) " +
                "values (?, 'ops-trend-club', 'Ops Trend Club', '', '', 'ACTIVE', 'PRIVATE')",
            CLUB_ID,
        )
        jdbcTemplate.update(
            "insert into users (id, google_subject_id, email, name, short_name, auth_provider) " +
                "values (?, 'ops-trend-user', 'ops-trend@example.com', 'Ops Trend', 'OT', 'GOOGLE')",
            USER_ID,
        )
        jdbcTemplate.update(
            "insert into memberships (id, club_id, user_id, role, status, joined_at, short_name) " +
                "values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'OT')",
            MEMBERSHIP_ID,
            CLUB_ID,
            USER_ID,
        )
    }

    private fun insertOutbox(id: String) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status,
              kafka_key, attempt_count, last_error, dedupe_key, created_at, updated_at
            )
            values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('sessionId', ?), 'PUBLISHED',
              ?, 1, null, ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            id,
            CLUB_ID,
            CLUB_ID,
            CLUB_ID,
            CLUB_ID,
            "ops-trend-outbox-$id",
        )
    }

    private fun insertDelivery(
        id: String,
        status: String,
        daysAgo: Long,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key,
              attempt_count, last_error, created_at, updated_at
            )
            values (?, ?, ?, ?, 'EMAIL', ?, ?, 1, 'smtp timeout',
              utc_timestamp(6) - interval ? day, utc_timestamp(6) - interval ? day)
            """.trimIndent(),
            id,
            EVENT_ID,
            CLUB_ID,
            MEMBERSHIP_ID,
            status,
            "ops-trend-delivery-$id",
            daysAgo,
            daysAgo,
        )
    }

    private fun insertAiAudit(
        status: String,
        daysAgo: Long,
    ) {
        jdbcTemplate.update(
            """
            insert into ai_generation_audit_log (
              job_id, session_id, club_id, host_user_id, kind, provider, model, status,
              input_tokens, cached_input_tokens, output_tokens, cost_estimate_usd, latency_ms, created_at
            )
            values (?, ?, ?, ?, 'SESSION_RECORD', 'ANTHROPIC', 'claude-x', ?,
              0, 0, 0, 0, 0, utc_timestamp(6) - interval ? day)
            """.trimIndent(),
            UUID.randomUUID().toString(),
            CLUB_ID,
            CLUB_ID,
            USER_ID,
            status,
            daysAgo,
        )
    }
}
