package com.readmates.notification.adapter.out.persistence

import com.readmates.notification.application.model.HostActionTargetCounts
import com.readmates.notification.application.model.HostConfirmedAction
import com.readmates.notification.application.model.NotificationDecision
import com.readmates.notification.application.port.out.HostActionNotificationPreviewRecord
import com.readmates.notification.domain.NotificationEventType
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.time.OffsetDateTime
import java.util.UUID

private const val CLEANUP_HOST_ACTION_GATE_SQL = """
    update host_action_notification_previews
    set consumed_at = null, consumed_decision_id = null
    where id = '00000000-0000-0000-0000-000000009101';
    delete from host_action_notification_decisions
    where preview_id = '00000000-0000-0000-0000-000000009101';
    delete from host_action_notification_previews
    where id = '00000000-0000-0000-0000-000000009101';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_HOST_ACTION_GATE_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_HOST_ACTION_GATE_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcHostActionNotificationAdapterTest(
    @param:Autowired private val adapter: JdbcHostActionNotificationAdapter,
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `complete stores skip decision and consumes preview atomically`() {
        val preview =
            HostActionNotificationPreviewRecord(
                id = PREVIEW_ID,
                clubId = CLUB_ID,
                sessionId = SESSION_ID,
                hostMembershipId = HOST_MEMBERSHIP_ID,
                action = HostConfirmedAction.SESSION_RECORD_APPLY,
                eventType = NotificationEventType.SESSION_RECORD_UPDATED,
                requestHash = "a".repeat(64),
                expectedDraftRevision = 2,
                expectedLiveRevision = 1,
                counts = HostActionTargetCounts(2, 2, 1, 1),
                expiresAt = OffsetDateTime.parse("2099-07-23T08:05:00Z"),
            )
        adapter.insertPreview(preview)

        val stored =
            adapter.completeDecision(
                preview = adapter.lockPreview(PREVIEW_ID, CLUB_ID, HOST_MEMBERSHIP_ID)!!,
                decision = NotificationDecision.SKIP,
                liveRevision = 2,
                eventId = null,
                now = OffsetDateTime.parse("2026-07-23T08:00:00Z"),
            )

        assertThat(stored.decision).isEqualTo(NotificationDecision.SKIP)
        assertThat(stored.eventId).isNull()
        assertThat(adapter.findDecision(PREVIEW_ID)).isEqualTo(stored)
        val consumed =
            jdbcTemplate.queryForMap(
                "select consumed_at, consumed_decision_id from host_action_notification_previews where id = ?",
                PREVIEW_ID.toString(),
            )
        assertThat(consumed["consumed_at"]).isNotNull()
        assertThat(consumed["consumed_decision_id"]).isEqualTo(stored.id.toString())
    }
}

private val PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000009101")
private val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
private val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")
private val HOST_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
