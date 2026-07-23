package com.readmates.sessionrecord.adapter.out.persistence

import com.readmates.auth.domain.MembershipRole
import com.readmates.auth.domain.MembershipStatus
import com.readmates.sessionrecord.application.model.HostSessionHistoryType
import com.readmates.sessionrecord.application.service.HostSessionHistoryQueryService
import com.readmates.shared.paging.CursorCodec
import com.readmates.shared.paging.PageRequest
import com.readmates.shared.security.CurrentMember
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.util.UUID

@SpringBootTest(
    properties = [
        "spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev",
    ],
)
@Tag("integration")
@Sql(
    statements = [CLEANUP_HISTORY_TEST_FIXTURES],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_HISTORY_TEST_FIXTURES],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
class JdbcHostSessionHistoryAdapterDbTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
    @param:Autowired private val historyService: HostSessionHistoryQueryService,
) : ReadmatesMySqlIntegrationTestSupport() {
    @Test
    fun `paginates equal timestamps deterministically and excludes baseline revisions`() {
        insertFirstClubHistory()

        val firstPage = historyService.history(host(), SESSION_ID, PageRequest(limit = 2, cursor = emptyMap()))

        assertThat(firstPage.items.map { it.type }).containsExactly(
            HostSessionHistoryType.RECORD_REVISION_APPLIED,
            HostSessionHistoryType.BASIC_INFO_UPDATED,
        )
        assertThat(firstPage.items.map { it.id }).doesNotContain(BASELINE_REVISION_ID)
        assertThat(firstPage.nextCursor).isNotNull()

        val secondPage =
            historyService.history(
                host(),
                SESSION_ID,
                PageRequest(limit = 2, cursor = CursorCodec.decode(firstPage.nextCursor).orEmpty()),
            )

        assertThat(secondPage.items.map { it.id }).containsExactly(OLDER_AUDIT_ID)
        assertThat(secondPage.items.map { it.id }).doesNotContainAnyElementsOf(firstPage.items.map { it.id })
        assertThat(secondPage.nextCursor).isNull()
    }

    @Test
    fun `does not expose another club history even when its session id is requested`() {
        insertOutsideClubHistory()

        val page = historyService.history(host(), OUTSIDE_SESSION_ID, PageRequest(limit = 10, cursor = emptyMap()))

        assertThat(page.items).isEmpty()
    }

    @Test
    fun `notification send and skip at equal time map and paginate by database tuple`() {
        insertNotificationHistory()

        val firstPage = historyService.history(host(), SESSION_ID, PageRequest(limit = 1, cursor = emptyMap()))
        val secondPage =
            historyService.history(
                host(),
                SESSION_ID,
                PageRequest(limit = 1, cursor = CursorCodec.decode(firstPage.nextCursor).orEmpty()),
            )

        assertThat(firstPage.items.single().type).isEqualTo(HostSessionHistoryType.NOTIFICATION_SKIPPED)
        assertThat(firstPage.items.single().notificationEventId).isNull()
        assertThat(secondPage.items.single().type).isEqualTo(HostSessionHistoryType.NOTIFICATION_SENT)
        assertThat(secondPage.items.single().notificationEventId).isEqualTo(NOTIFICATION_EVENT_ID)
        assertThat(secondPage.items.single().id).isEqualTo(SEND_DECISION_ID)
        assertThat(secondPage.nextCursor).isNull()
    }

    private fun insertFirstClubHistory() {
        jdbcTemplate.update(
            """
            insert into session_record_revisions (
              id, session_id, club_id, version, source, snapshot_json, snapshot_sha256,
              applied_by_membership_id, applied_at
            ) values
              (?, ?, ?, 1, 'BASELINE', '{}', ?, ?, '2026-07-23 10:00:00.000000'),
              (?, ?, ?, 2, 'MANUAL', '{}', ?, ?, '2026-07-23 10:00:00.000000')
            """.trimIndent(),
            BASELINE_REVISION_ID.toString(),
            SESSION_ID.toString(),
            CLUB_ID.toString(),
            "a".repeat(64),
            HOST_MEMBERSHIP_ID.toString(),
            APPLIED_REVISION_ID.toString(),
            SESSION_ID.toString(),
            CLUB_ID.toString(),
            "b".repeat(64),
            HOST_MEMBERSHIP_ID.toString(),
        )
        jdbcTemplate.update(
            """
            insert into host_session_change_audit (
              id, club_id, session_id, actor_membership_id, action_type,
              changed_fields_json, created_at
            ) values
              (?, ?, ?, ?, 'BASIC_INFO_UPDATED', '["title"]', '2026-07-23 10:00:00.000000'),
              (?, ?, ?, ?, 'BASIC_INFO_UPDATED', '["bookTitle"]', '2026-07-23 09:00:00.000000')
            """.trimIndent(),
            SAME_TIME_AUDIT_ID.toString(),
            CLUB_ID.toString(),
            SESSION_ID.toString(),
            HOST_MEMBERSHIP_ID.toString(),
            OLDER_AUDIT_ID.toString(),
            CLUB_ID.toString(),
            SESSION_ID.toString(),
            HOST_MEMBERSHIP_ID.toString(),
        )
    }

    private fun insertOutsideClubHistory() {
        jdbcTemplate.update(
            """
            insert into users (id, email, name, short_name, auth_provider)
            values (?, 'history.outside@example.test', 'Outside History Host', 'Outside', 'PASSWORD')
            """.trimIndent(),
            OUTSIDE_USER_ID.toString(),
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, joined_at, short_name)
            values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'Outside')
            """.trimIndent(),
            OUTSIDE_MEMBERSHIP_ID.toString(),
            OUTSIDE_CLUB_ID.toString(),
            OUTSIDE_USER_ID.toString(),
        )
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility
            ) values (
              ?, ?, 1, 'Outside history', 'Outside book', 'Outside author', '2026-07-23',
              '19:00:00', '21:00:00', 'Online', '2026-07-22 12:00:00', 'CLOSED', 'HOST_ONLY'
            )
            """.trimIndent(),
            OUTSIDE_SESSION_ID.toString(),
            OUTSIDE_CLUB_ID.toString(),
        )
        jdbcTemplate.update(
            """
            insert into host_session_change_audit (
              id, club_id, session_id, actor_membership_id, action_type,
              changed_fields_json, created_at
            ) values (?, ?, ?, ?, 'BASIC_INFO_UPDATED', '["title"]', '2026-07-23 11:00:00.000000')
            """.trimIndent(),
            OUTSIDE_AUDIT_ID.toString(),
            OUTSIDE_CLUB_ID.toString(),
            OUTSIDE_SESSION_ID.toString(),
            OUTSIDE_MEMBERSHIP_ID.toString(),
        )
    }

    @Suppress("LongMethod")
    private fun insertNotificationHistory() {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json,
              kafka_key, dedupe_key, created_at, updated_at
            ) values (?, ?, 'SESSION_RECORD_UPDATED', 'SESSION', ?, '{}', ?, ?, ?, ?)
            """.trimIndent(),
            NOTIFICATION_EVENT_ID.toString(),
            CLUB_ID.toString(),
            SESSION_ID.toString(),
            "history-event",
            "history-event-dedupe",
            HISTORY_TIMESTAMP,
            HISTORY_TIMESTAMP,
        )
        jdbcTemplate.update(
            """
            insert into host_action_notification_previews (
              id, club_id, session_id, host_membership_id, action_type, event_type,
              request_hash, expected_live_revision, target_count, expected_in_app_count,
              expected_email_count, excluded_count, expires_at, created_at
            ) values
              (?, ?, ?, ?, 'RECORD_APPLY', 'SESSION_RECORD_UPDATED', ?, 9101, 1, 1, 0, 0, ?, ?),
              (?, ?, ?, ?, 'RECORD_APPLY', 'SESSION_RECORD_UPDATED', ?, 9102, 1, 1, 0, 0, ?, ?)
            """.trimIndent(),
            SEND_PREVIEW_ID.toString(),
            CLUB_ID.toString(),
            SESSION_ID.toString(),
            HOST_MEMBERSHIP_ID.toString(),
            "c".repeat(64),
            PREVIEW_EXPIRY,
            HISTORY_TIMESTAMP,
            SKIP_PREVIEW_ID.toString(),
            CLUB_ID.toString(),
            SESSION_ID.toString(),
            HOST_MEMBERSHIP_ID.toString(),
            "d".repeat(64),
            PREVIEW_EXPIRY,
            HISTORY_TIMESTAMP,
        )
        jdbcTemplate.update(
            """
            insert into host_action_notification_decisions (
              id, preview_id, club_id, session_id, host_membership_id, action_type,
              event_type, live_revision, decision, target_count, expected_in_app_count,
              expected_email_count, excluded_count, event_id, created_at
            ) values
              (?, ?, ?, ?, ?, 'RECORD_APPLY', 'SESSION_RECORD_UPDATED', 9101, 'SEND', 1, 1, 0, 0, ?, ?),
              (?, ?, ?, ?, ?, 'RECORD_APPLY', 'SESSION_RECORD_UPDATED', 9102, 'SKIP', 1, 1, 0, 0, null, ?)
            """.trimIndent(),
            SEND_DECISION_ID.toString(),
            SEND_PREVIEW_ID.toString(),
            CLUB_ID.toString(),
            SESSION_ID.toString(),
            HOST_MEMBERSHIP_ID.toString(),
            NOTIFICATION_EVENT_ID.toString(),
            HISTORY_TIMESTAMP,
            SKIP_DECISION_ID.toString(),
            SKIP_PREVIEW_ID.toString(),
            CLUB_ID.toString(),
            SESSION_ID.toString(),
            HOST_MEMBERSHIP_ID.toString(),
            HISTORY_TIMESTAMP,
        )
    }

    private fun host() =
        CurrentMember(
            userId = HOST_USER_ID,
            membershipId = HOST_MEMBERSHIP_ID,
            clubId = CLUB_ID,
            clubSlug = "reading-sai",
            email = "history.host@example.test",
            displayName = "History Host",
            accountName = "History Host",
            role = MembershipRole.HOST,
            membershipStatus = MembershipStatus.ACTIVE,
        )

    private companion object {
        val CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000001")
        val OUTSIDE_CLUB_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000002")
        val HOST_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000101")
        val HOST_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000201")
        val SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000000301")
        val BASELINE_REVISION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098001")
        val APPLIED_REVISION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098002")
        val SAME_TIME_AUDIT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098003")
        val OLDER_AUDIT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098004")
        val OUTSIDE_USER_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098101")
        val OUTSIDE_MEMBERSHIP_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098201")
        val OUTSIDE_SESSION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098301")
        val OUTSIDE_AUDIT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098401")
        val SEND_PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098501")
        val SKIP_PREVIEW_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098502")
        val SEND_DECISION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098601")
        val SKIP_DECISION_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098602")
        val NOTIFICATION_EVENT_ID: UUID = UUID.fromString("00000000-0000-0000-0000-000000098701")
        const val HISTORY_TIMESTAMP = "2026-07-23 10:00:00.000000"
        const val PREVIEW_EXPIRY = "2026-07-23 10:05:00.000000"
    }
}

private const val CLEANUP_HISTORY_TEST_FIXTURES = """
    update host_action_notification_previews
    set consumed_at = null, consumed_decision_id = null
    where id in (
      '00000000-0000-0000-0000-000000098501',
      '00000000-0000-0000-0000-000000098502'
    );
    delete from host_action_notification_decisions where id in (
      '00000000-0000-0000-0000-000000098601',
      '00000000-0000-0000-0000-000000098602'
    );
    delete from host_action_notification_previews where id in (
      '00000000-0000-0000-0000-000000098501',
      '00000000-0000-0000-0000-000000098502'
    );
    delete from notification_event_outbox where id = '00000000-0000-0000-0000-000000098701';
    delete from host_session_change_audit where id in (
      '00000000-0000-0000-0000-000000098003',
      '00000000-0000-0000-0000-000000098004',
      '00000000-0000-0000-0000-000000098401'
    );
    delete from session_record_revisions where id in (
      '00000000-0000-0000-0000-000000098001',
      '00000000-0000-0000-0000-000000098002'
    );
    delete from sessions where id = '00000000-0000-0000-0000-000000098301';
    delete from memberships where id = '00000000-0000-0000-0000-000000098201';
    delete from users where id = '00000000-0000-0000-0000-000000098101';
"""
