package com.readmates.club.adapter.out.persistence

import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

private const val CLUB_ID = "00000000-0000-0000-0000-0000000fc001"
private const val USER_ID = "00000000-0000-0000-0000-0000000fc002"
private const val MEMBERSHIP_ID = "00000000-0000-0000-0000-0000000fc003"
private const val RECENT_EVENT_ID = "00000000-0000-0000-0000-0000000fc101"
private const val OLD_EVENT_ID = "00000000-0000-0000-0000-0000000fc102"
private const val RECENT_DEAD_DELIVERY_ID = "00000000-0000-0000-0000-0000000fc201"
private const val RECENT_FAILED_DELIVERY_ID = "00000000-0000-0000-0000-0000000fc202"
private const val OLD_DEAD_DELIVERY_ID = "00000000-0000-0000-0000-0000000fc203"
private const val SENT_DELIVERY_ID = "00000000-0000-0000-0000-0000000fc204"

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
class JdbcPlatformAdminClubFailureCountsTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcPlatformAdminClubAdapter(jdbcTemplate) }

    @Test
    fun `counts only recent failed notification deliveries and failed ai generations`() {
        seedClubWithMember()
        seedNotificationDeliveries()
        seedAiAuditRows()

        val club = adapter.loadClub(UUID.fromString(CLUB_ID))

        assertThat(club).isNotNull
        // Recent DEAD + recent FAILED = 2; old DEAD and SENT excluded.
        assertThat(club!!.notificationFailureCount).isEqualTo(2)
        // 1 recent FAILED ai row; old FAILED and recent SUCCESS excluded.
        assertThat(club.aiFailureCount).isEqualTo(1)
    }

    @Test
    fun `reports zero failures for a clean club`() {
        seedClubWithMember()

        val club = adapter.loadClub(UUID.fromString(CLUB_ID))

        assertThat(club!!.notificationFailureCount).isEqualTo(0)
        assertThat(club.aiFailureCount).isEqualTo(0)
    }

    @Test
    fun `listClubs returns the same failure counts as loadClub`() {
        // Guards the residual risk that listClubs and loadClub share CLUB_BASE_SQL
        // but only loadClub is covered: a future split of the SQL paths must not
        // silently drop the failure-count aggregation from the list endpoint.
        seedClubWithMember()
        seedNotificationDeliveries()
        seedAiAuditRows()

        val listed = adapter.listClubs(limit = 500).firstOrNull { it.clubId == UUID.fromString(CLUB_ID) }

        assertThat(listed).isNotNull
        assertThat(listed!!.notificationFailureCount).isEqualTo(2)
        assertThat(listed.aiFailureCount).isEqualTo(1)
    }

    private fun seedClubWithMember() {
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about, status, public_visibility) " +
                "values (?, 'failure-count-club', 'Failure Count Club', '', '', 'ACTIVE', 'PRIVATE')",
            CLUB_ID,
        )
        jdbcTemplate.update(
            "insert into users (id, google_subject_id, email, name, short_name, auth_provider) " +
                "values (?, 'failure-count-user', 'failure-count@example.com', 'Failure Count', 'FC', 'GOOGLE')",
            USER_ID,
        )
        jdbcTemplate.update(
            "insert into memberships (id, club_id, user_id, role, status, joined_at, short_name) " +
                "values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), 'FC')",
            MEMBERSHIP_ID,
            CLUB_ID,
            USER_ID,
        )
    }

    private fun seedNotificationDeliveries() {
        insertOutbox(RECENT_EVENT_ID)
        insertOutbox(OLD_EVENT_ID)
        insertDelivery(RECENT_DEAD_DELIVERY_ID, RECENT_EVENT_ID, "DEAD", daysAgo = 1)
        insertDelivery(RECENT_FAILED_DELIVERY_ID, RECENT_EVENT_ID, "FAILED", daysAgo = 3)
        insertDelivery(OLD_DEAD_DELIVERY_ID, OLD_EVENT_ID, "DEAD", daysAgo = 10)
        insertDelivery(SENT_DELIVERY_ID, RECENT_EVENT_ID, "SENT", daysAgo = 1)
    }

    private fun seedAiAuditRows() {
        insertAiAudit("aigen-recent-failed", "FAILED", daysAgo = 2)
        insertAiAudit("aigen-old-failed", "FAILED", daysAgo = 9)
        insertAiAudit("aigen-recent-ok", "SUCCESS", daysAgo = 1)
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
            "failure-count-outbox-$id",
        )
    }

    private fun insertDelivery(
        id: String,
        eventId: String,
        status: String,
        daysAgo: Long,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key,
              attempt_count, last_error, created_at, updated_at
            )
            values (?, ?, ?, ?, 'EMAIL', ?, ?, 1, null,
              utc_timestamp(6) - interval ? day, utc_timestamp(6) - interval ? day)
            """.trimIndent(),
            id,
            eventId,
            CLUB_ID,
            MEMBERSHIP_ID,
            status,
            "failure-count-delivery-$id",
            daysAgo,
            daysAgo,
        )
    }

    private fun insertAiAudit(
        jobSuffix: String,
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
