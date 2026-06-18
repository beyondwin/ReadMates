package com.readmates.sessionclosing.adapter.out.persistence

import com.readmates.auth.domain.MembershipRole
import com.readmates.session.application.SessionRecordVisibility
import com.readmates.sessionclosing.application.model.FeedbackDocumentClosingState
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
@Sql(statements = [SESSION_CLOSING_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [SESSION_CLOSING_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
class JdbcSessionClosingStatusAdapterTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter = JdbcSessionClosingStatusAdapter(jdbcTemplate)
    private val sessionId = UUID.fromString("11111111-1111-1111-1111-111111111111")

    @Test
    fun `loads counts feedback state notification status and public href for host club session`() {
        seedClosedPublishedSession()

        val snapshot = adapter.loadHostSessionClosingSnapshot(host(), sessionId)

        assertThat(snapshot).isNotNull
        assertThat(snapshot!!.sessionNumber).isEqualTo(77)
        assertThat(snapshot.recordVisibility).isEqualTo(SessionRecordVisibility.PUBLIC)
        assertThat(snapshot.summaryPublished).isTrue()
        assertThat(snapshot.highlightCount).isEqualTo(2)
        assertThat(snapshot.oneLinerCount).isEqualTo(1)
        assertThat(snapshot.feedbackDocumentState).isEqualTo(FeedbackDocumentClosingState.AVAILABLE)
        assertThat(snapshot.latestNotificationEvent?.eventType).isEqualTo("FEEDBACK_DOCUMENT_PUBLISHED")
        assertThat(snapshot.publicVisible).isTrue()
        assertThat(snapshot.publicRecordHref).isEqualTo("/clubs/reading-sai/sessions/$sessionId")
    }

    private fun host() =
        CurrentMember(
            userId = UUID.fromString("00000000-0000-0000-0000-000000000101"),
            membershipId = UUID.fromString("00000000-0000-0000-0000-000000000201"),
            clubId = UUID.fromString("00000000-0000-0000-0000-000000000001"),
            clubSlug = "reading-sai",
            email = "host@example.com",
            displayName = "Host",
            accountName = "Host",
            role = MembershipRole.HOST,
        )

    private fun seedClosedPublishedSession() {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, question_deadline_at, location_label, state, visibility
            )
            values (?, '00000000-0000-0000-0000-000000000001', 77, '77 session', 'Test Book', 'Test Author',
              '2026-06-18', '19:30:00', '21:30:00', '2026-06-18 12:00:00', 'Online', 'PUBLISHED', 'PUBLIC')
            """.trimIndent(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, visibility, is_public, published_at
            )
            values (
              '33333333-3333-3333-3333-333333333333',
              '00000000-0000-0000-0000-000000000001',
              ?,
              'Public summary.',
              'PUBLIC',
              true,
              current_timestamp(6)
            )
            """.trimIndent(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into highlights (id, club_id, session_id, text, sort_order)
            values ('44444444-4444-4444-4444-444444444441', '00000000-0000-0000-0000-000000000001', ?, 'Highlight 1', 1)
            """.trimIndent(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into highlights (id, club_id, session_id, text, sort_order)
            values ('44444444-4444-4444-4444-444444444442', '00000000-0000-0000-0000-000000000001', ?, 'Highlight 2', 2)
            """.trimIndent(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility)
            values (
              '55555555-5555-5555-5555-555555555555',
              '00000000-0000-0000-0000-000000000001',
              ?,
              '00000000-0000-0000-0000-000000000201',
              'One-liner',
              'PUBLIC'
            )
            """.trimIndent(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id, club_id, session_id, version, source_text, file_name, content_type, file_size
            )
            values (
              '66666666-6666-6666-6666-666666666666',
              '00000000-0000-0000-0000-000000000001',
              ?,
              1,
              '<!-- readmates-feedback:v1 -->',
              'session-77.md',
              'text/markdown',
              33
            )
            """.trimIndent(),
            sessionId.toString(),
        )
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json,
              status, kafka_topic, kafka_key, dedupe_key, published_at, created_at, updated_at
            )
            values (
              '22222222-2222-2222-2222-222222222222',
              '00000000-0000-0000-0000-000000000001',
              'FEEDBACK_DOCUMENT_PUBLISHED',
              'SESSION',
              ?,
              '{"sessionId":"11111111-1111-1111-1111-111111111111"}',
              'PUBLISHED',
              'readmates.notification.events.v1',
              ?,
              'feedback-document:11111111-1111-1111-1111-111111111111',
              current_timestamp(6),
              current_timestamp(6),
              current_timestamp(6)
            )
            """.trimIndent(),
            sessionId.toString(),
            sessionId.toString(),
        )
    }
}

private const val SESSION_CLOSING_CLEANUP_SQL = """
delete from notification_event_outbox where aggregate_id = '11111111-1111-1111-1111-111111111111';
delete from session_feedback_documents where session_id = '11111111-1111-1111-1111-111111111111';
delete from one_line_reviews where session_id = '11111111-1111-1111-1111-111111111111';
delete from highlights where session_id = '11111111-1111-1111-1111-111111111111';
delete from public_session_publications where session_id = '11111111-1111-1111-1111-111111111111';
delete from sessions where id = '11111111-1111-1111-1111-111111111111';
"""
