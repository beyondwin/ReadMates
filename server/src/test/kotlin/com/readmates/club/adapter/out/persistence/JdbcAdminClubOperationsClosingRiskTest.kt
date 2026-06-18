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
import java.time.LocalDate
import java.util.UUID

private const val CLOSING_RISK_CLUB_ID = "00000000-0000-0000-0000-0000000ce001"
private const val CLOSING_RISK_USER_ID = "00000000-0000-0000-0000-0000000ce002"
private const val CLOSING_RISK_MEMBERSHIP_ID = "00000000-0000-0000-0000-0000000ce003"
private const val BLOCKED_SESSION_ID = "00000000-0000-0000-0000-0000000ce101"
private const val IN_PROGRESS_SESSION_ID = "00000000-0000-0000-0000-0000000ce102"
private const val READY_SESSION_ID = "00000000-0000-0000-0000-0000000ce103"
private const val PUBLISHED_SESSION_ID = "00000000-0000-0000-0000-0000000ce104"

private const val CLOSING_RISK_CLEANUP_SQL = """
    delete from notification_event_outbox where club_id = '$CLOSING_RISK_CLUB_ID';
    delete from session_feedback_documents where club_id = '$CLOSING_RISK_CLUB_ID';
    delete from one_line_reviews where club_id = '$CLOSING_RISK_CLUB_ID';
    delete from highlights where club_id = '$CLOSING_RISK_CLUB_ID';
    delete from public_session_publications where club_id = '$CLOSING_RISK_CLUB_ID';
    delete from sessions where club_id = '$CLOSING_RISK_CLUB_ID';
    delete from memberships where id = '$CLOSING_RISK_MEMBERSHIP_ID';
    delete from users where id = '$CLOSING_RISK_USER_ID';
    delete from clubs where id = '$CLOSING_RISK_CLUB_ID';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLOSING_RISK_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLOSING_RISK_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminClubOperationsClosingRiskTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcAdminClubOperationsAdapter(jdbcTemplate, Clock.systemUTC()) }

    @Test
    fun `projects admin safe closing risks for blocked incomplete and ready sessions`() {
        seedClubWithHost()
        seedBlockedSession()
        seedInProgressSession()
        seedReadySession()
        seedPublishedSession()

        val snapshot = adapter.loadSnapshot(UUID.fromString(CLOSING_RISK_CLUB_ID))

        assertThat(snapshot).isNotNull
        assertThat(snapshot!!.schema).isEqualTo("admin.club_operations_snapshot.v1")
        assertThat(snapshot.closingRisks.incompleteCount).isEqualTo(3)
        assertThat(snapshot.closingRisks.blockedCount).isEqualTo(1)
        assertThat(snapshot.closingRisks.readyCount).isEqualTo(1)
        assertThat(snapshot.closingRisks.items).hasSize(3)

        val blocked = snapshot.closingRisks.items.single { it.sessionId == UUID.fromString(BLOCKED_SESSION_ID) }
        assertThat(blocked.sessionNumber).isEqualTo(10)
        assertThat(blocked.bookTitle).isEqualTo("Blocked Book")
        assertThat(blocked.meetingDate).isEqualTo(LocalDate.parse("2026-06-10"))
        assertThat(blocked.overallState).isEqualTo("BLOCKED")
        assertThat(blocked.primaryBlocker).isEqualTo("FEEDBACK_DOCUMENT_INVALID")
        assertThat(blocked.hostClosingHref)
            .isEqualTo("/clubs/admin-closing-risk/app/host/sessions/$BLOCKED_SESSION_ID/closing")

        val inProgress = snapshot.closingRisks.items.single { it.sessionId == UUID.fromString(IN_PROGRESS_SESSION_ID) }
        assertThat(inProgress.overallState).isEqualTo("IN_PROGRESS")
        assertThat(inProgress.primaryBlocker).isEqualTo("RECORD_PACKAGE_REQUIRED")

        val ready = snapshot.closingRisks.items.single { it.sessionId == UUID.fromString(READY_SESSION_ID) }
        assertThat(ready.overallState).isEqualTo("READY")
        assertThat(ready.primaryBlocker).isEqualTo("MEMBER_NOTIFICATION_REQUIRED")

        assertThat(snapshot.closingRisks.items.map { it.sessionId })
            .doesNotContain(UUID.fromString(PUBLISHED_SESSION_ID))
        assertThat(snapshot.closingRisks.toString()).doesNotContain("RAW_PRIVATE_FEEDBACK_SENTINEL")
    }

    private fun seedClubWithHost() {
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about, status, public_visibility) " +
                "values (?, 'admin-closing-risk', 'Admin Closing Risk', '', '', 'ACTIVE', 'PRIVATE')",
            CLOSING_RISK_CLUB_ID,
        )
        jdbcTemplate.update(
            "insert into users (id, google_subject_id, email, name, short_name, auth_provider) " +
                "values (?, 'admin-closing-risk-user', 'admin-closing-risk@example.com', 'Admin Closing', 'AC', 'GOOGLE')",
            CLOSING_RISK_USER_ID,
        )
        jdbcTemplate.update(
            "insert into memberships (id, club_id, user_id, role, status, joined_at, short_name) " +
                "values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'AC')",
            CLOSING_RISK_MEMBERSHIP_ID,
            CLOSING_RISK_CLUB_ID,
            CLOSING_RISK_USER_ID,
        )
    }

    private fun seedBlockedSession() {
        insertSession(BLOCKED_SESSION_ID, 10, "Blocked Book", "2026-06-10", "CLOSED", "MEMBER")
        insertPublication("00000000-0000-0000-0000-0000000ce201", BLOCKED_SESSION_ID, false, "MEMBER")
        insertFeedbackDocument(
            "00000000-0000-0000-0000-0000000ce301",
            BLOCKED_SESSION_ID,
            "RAW_PRIVATE_FEEDBACK_SENTINEL without the required template marker",
        )
    }

    private fun seedInProgressSession() {
        insertSession(IN_PROGRESS_SESSION_ID, 11, "Missing Records Book", "2026-06-11", "CLOSED", "MEMBER")
    }

    private fun seedReadySession() {
        insertSession(READY_SESSION_ID, 12, "Ready Book", "2026-06-12", "CLOSED", "MEMBER")
        insertPublication("00000000-0000-0000-0000-0000000ce202", READY_SESSION_ID, false, "MEMBER")
        insertFeedbackDocument(
            "00000000-0000-0000-0000-0000000ce302",
            READY_SESSION_ID,
            "<!-- readmates-feedback:v1 -->\n# Ready feedback",
        )
    }

    private fun seedPublishedSession() {
        insertSession(PUBLISHED_SESSION_ID, 13, "Published Book", "2026-06-13", "PUBLISHED", "PUBLIC")
        insertPublication("00000000-0000-0000-0000-0000000ce203", PUBLISHED_SESSION_ID, true, "PUBLIC")
        insertFeedbackDocument(
            "00000000-0000-0000-0000-0000000ce303",
            PUBLISHED_SESSION_ID,
            "<!-- readmates-feedback:v1 -->\n# Published feedback",
        )
        insertNotificationEvent(PUBLISHED_SESSION_ID)
    }

    private fun insertSession(
        id: String,
        number: Int,
        bookTitle: String,
        sessionDate: String,
        state: String,
        visibility: String,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, question_deadline_at, location_label, state, visibility
            )
            values (?, ?, ?, ?, ?, 'Author', ?, '19:30:00', '21:30:00', ?,
              'Online', ?, ?)
            """.trimIndent(),
            id,
            CLOSING_RISK_CLUB_ID,
            number,
            "$number session",
            bookTitle,
            sessionDate,
            "$sessionDate 12:00:00",
            state,
            visibility,
        )
    }

    private fun insertPublication(
        id: String,
        sessionId: String,
        isPublic: Boolean,
        visibility: String,
    ) {
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, visibility, is_public, published_at
            )
            values (?, ?, ?, 'Safe public summary.', ?, ?, if(?, current_timestamp(6), null))
            """.trimIndent(),
            id,
            CLOSING_RISK_CLUB_ID,
            sessionId,
            visibility,
            isPublic,
            isPublic,
        )
    }

    private fun insertFeedbackDocument(
        id: String,
        sessionId: String,
        sourceText: String,
    ) {
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id, club_id, session_id, version, source_text, file_name, content_type, file_size
            )
            values (?, ?, ?, 1, ?, 'feedback.md', 'text/markdown', ?)
            """.trimIndent(),
            id,
            CLOSING_RISK_CLUB_ID,
            sessionId,
            sourceText,
            sourceText.length,
        )
    }

    private fun insertNotificationEvent(sessionId: String) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json,
              status, kafka_topic, kafka_key, dedupe_key, published_at, created_at, updated_at
            )
            values (
              '00000000-0000-0000-0000-0000000ce401',
              ?,
              'FEEDBACK_DOCUMENT_PUBLISHED',
              'SESSION',
              ?,
              json_object('sessionId', ?),
              'PUBLISHED',
              'readmates.notification.events.v1',
              ?,
              ?,
              current_timestamp(6),
              current_timestamp(6),
              current_timestamp(6)
            )
            """.trimIndent(),
            CLOSING_RISK_CLUB_ID,
            sessionId,
            sessionId,
            sessionId,
            "closing-risk-notification-$sessionId",
        )
    }
}
