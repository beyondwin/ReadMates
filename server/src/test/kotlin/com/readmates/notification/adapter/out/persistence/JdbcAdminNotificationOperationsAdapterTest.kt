package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.AdminNotificationFilter
import com.readmates.notification.domain.NotificationDeliveryStatus
import com.readmates.shared.paging.PageRequest
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

private const val CLEANUP_ADMIN_NOTIFICATION_OPERATIONS_SQL = """
    delete from notification_manual_dispatches
    where event_id in (
      '00000000-0000-0000-0000-000000007501',
      '00000000-0000-0000-0000-000000007502',
      '00000000-0000-0000-0000-000000007503'
    );
    delete from notification_deliveries
    where event_id in (
      '00000000-0000-0000-0000-000000007501',
      '00000000-0000-0000-0000-000000007502',
      '00000000-0000-0000-0000-000000007503'
    );
    delete from notification_event_outbox
    where id in (
      '00000000-0000-0000-0000-000000007501',
      '00000000-0000-0000-0000-000000007502',
      '00000000-0000-0000-0000-000000007503'
    );
    delete from memberships where id = '00000000-0000-0000-0000-000000008002';
    delete from users where id = '00000000-0000-0000-0000-000000008001';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_ADMIN_NOTIFICATION_OPERATIONS_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_ADMIN_NOTIFICATION_OPERATIONS_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminNotificationOperationsAdapterTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcAdminNotificationOperationsAdapter(jdbcTemplate) }

    @Test
    fun `snapshot and ledgers expose safe admin notification operations`() {
        seedOperationsRows()

        val snapshot = adapter.snapshot()
        val eventPage = adapter.listEvents(AdminNotificationFilter(), PageRequest.cursor(1, null, defaultLimit = 50, maxLimit = 100))
        val deliveryPage =
            adapter.listDeliveries(
                AdminNotificationFilter(deliveryStatus = NotificationDeliveryStatus.DEAD),
                PageRequest.cursor(1, null, defaultLimit = 50, maxLimit = 100),
            )

        assertThat(snapshot.clubHealth.map { it.slug }).contains("reading-sai", "sample-book-club")
        assertThat(eventPage.items).hasSize(1)
        assertThat(eventPage.nextCursor).isNotBlank()
        assertThat(deliveryPage.items).hasSize(1)
        assertThat(deliveryPage.nextCursor).isNotBlank()
        assertThat(deliveryPage.items.single().maskedRecipient).contains("***@")
        assertThat(deliveryPage.items.single().maskedRecipient).doesNotContain("member1@example.com")
        assertThat(snapshot.failureClusters.map { it.safeErrorCode }).allSatisfy { safeCode ->
            assertThat(safeCode).doesNotContain("@")
            assertThat(safeCode.lowercase()).doesNotContain("token")
            assertThat(safeCode.lowercase()).doesNotContain("sql")
            assertThat(safeCode.lowercase()).doesNotContain("smtp")
        }
    }

    private fun seedOperationsRows() {
        jdbcTemplate.update(
            """
            insert into users (id, google_subject_id, email, name, short_name, auth_provider)
            values (?, 'admin-notification-second-club-user', 'second-club-member@example.com', 'Second Club Member', 'Second', 'GOOGLE')
            on duplicate key update email = values(email), name = values(name), short_name = values(short_name)
            """.trimIndent(),
            SECOND_USER_ID.toString(),
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, ?, ?, 'MEMBER', 'ACTIVE', utc_timestamp(6), 'Second')
            on duplicate key update status = values(status), short_name = values(short_name)
            """.trimIndent(),
            SECOND_MEMBERSHIP_ID.toString(),
            SECOND_CLUB_ID.toString(),
            SECOND_USER_ID.toString(),
        )
        insertEvent(FAILED_EVENT_ID, BASELINE_CLUB_ID, "FAILED", "SMTP 550 token=abc member1@example.com SQLSTATE 42S02")
        insertEvent(MANUAL_EVENT_ID, BASELINE_CLUB_ID, "PUBLISHED", null)
        insertEvent(SECOND_CLUB_EVENT_ID, SECOND_CLUB_ID, "FAILED", "mailbox unavailable")
        insertDelivery(DEAD_DELIVERY_ID, FAILED_EVENT_ID, BASELINE_CLUB_ID, BASELINE_MEMBER_ID, "DEAD", "SMTP 550 member1@example.com")
        insertDelivery(SECOND_DELIVERY_ID, SECOND_CLUB_EVENT_ID, SECOND_CLUB_ID, SECOND_MEMBERSHIP_ID, "DEAD", "provider timeout")
        jdbcTemplate.update(
            """
            insert into notification_manual_dispatches (
              id, club_id, event_id, session_id, event_type, requested_by_membership_id,
              requested_channels, audience, target_count, expected_in_app_count, expected_email_count, resend, send_mode
            )
            values (?, ?, ?, ?, 'SESSION_REMINDER_DUE', ?, 'BOTH', 'ALL_ACTIVE_MEMBERS', 2, 2, 1, false, 'NOW')
            """.trimIndent(),
            MANUAL_DISPATCH_ID.toString(),
            BASELINE_CLUB_ID.toString(),
            MANUAL_EVENT_ID.toString(),
            BASELINE_SESSION_ID.toString(),
            BASELINE_HOST_MEMBERSHIP_ID.toString(),
        )
    }

    private fun insertEvent(
        id: UUID,
        clubId: UUID,
        status: String,
        lastError: String?,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status,
              kafka_key, attempt_count, last_error, dedupe_key, created_at, updated_at
            )
            values (?, ?, 'SESSION_REMINDER_DUE', 'SESSION', ?, json_object('sessionId', ?), ?, ?, 1, ?, ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            id.toString(),
            clubId.toString(),
            BASELINE_SESSION_ID.toString(),
            BASELINE_SESSION_ID.toString(),
            status,
            clubId.toString(),
            lastError,
            "admin-notification-operations-$id",
        )
    }

    private fun insertDelivery(
        id: UUID,
        eventId: UUID,
        clubId: UUID,
        membershipId: UUID,
        status: String,
        lastError: String?,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_deliveries (
              id, event_id, club_id, recipient_membership_id, channel, status, dedupe_key,
              attempt_count, last_error, created_at, updated_at
            )
            values (?, ?, ?, ?, 'EMAIL', ?, ?, 2, ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            id.toString(),
            eventId.toString(),
            clubId.toString(),
            membershipId.toString(),
            status,
            "admin-notification-operations-delivery-$id",
            lastError,
        )
    }
}

private val BASELINE_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val SECOND_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")
private val BASELINE_MEMBER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000202")
private val BASELINE_HOST_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
private val BASELINE_SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")
private val SECOND_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000008001")
private val SECOND_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000008002")
private val FAILED_EVENT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007501")
private val MANUAL_EVENT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007502")
private val SECOND_CLUB_EVENT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007503")
private val DEAD_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007601")
private val SECOND_DELIVERY_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007602")
private val MANUAL_DISPATCH_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000007701")
