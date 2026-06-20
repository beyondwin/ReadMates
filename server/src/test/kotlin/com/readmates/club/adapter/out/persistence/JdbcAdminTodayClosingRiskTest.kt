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

private const val TODAY_RISK_CLUB_ID = "00000000-0000-0000-0000-0000000cb001"
private const val TODAY_RISK_LIMIT_CLUB_ID = "00000000-0000-0000-0000-0000000cb002"
private const val TODAY_RISK_BLOCKED_SESSION_ID = "00000000-0000-0000-0000-0000000cb101"
private const val TODAY_RISK_IN_PROGRESS_SESSION_ID = "00000000-0000-0000-0000-0000000cb102"
private const val TODAY_RISK_READY_SESSION_ID = "00000000-0000-0000-0000-0000000cb103"
private const val TODAY_RISK_PUBLISHED_SESSION_ID = "00000000-0000-0000-0000-0000000cb104"

private const val TODAY_RISK_CLEANUP_SQL = """
    delete from admin_closing_risk_ledger where club_id in ('$TODAY_RISK_CLUB_ID', '$TODAY_RISK_LIMIT_CLUB_ID');
    delete from notification_event_outbox where club_id in ('$TODAY_RISK_CLUB_ID', '$TODAY_RISK_LIMIT_CLUB_ID');
    delete from session_feedback_documents where club_id in ('$TODAY_RISK_CLUB_ID', '$TODAY_RISK_LIMIT_CLUB_ID');
    delete from one_line_reviews where club_id in ('$TODAY_RISK_CLUB_ID', '$TODAY_RISK_LIMIT_CLUB_ID');
    delete from highlights where club_id in ('$TODAY_RISK_CLUB_ID', '$TODAY_RISK_LIMIT_CLUB_ID');
    delete from public_session_publications where club_id in ('$TODAY_RISK_CLUB_ID', '$TODAY_RISK_LIMIT_CLUB_ID');
    delete from sessions where club_id in ('$TODAY_RISK_CLUB_ID', '$TODAY_RISK_LIMIT_CLUB_ID');
    delete from clubs where id in ('$TODAY_RISK_CLUB_ID', '$TODAY_RISK_LIMIT_CLUB_ID');
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [TODAY_RISK_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [TODAY_RISK_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminTodayClosingRiskTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcAdminClubOperationsAdapter(jdbcTemplate, Clock.systemUTC()) }

    @Test
    fun `projects admin today closing risks in operational urgency order`() {
        seedClub(TODAY_RISK_CLUB_ID, "admin-today-risk", "Admin Today Risk")
        seedBlockedSession()
        seedInProgressSession()
        seedReadySession()
        seedPublishedSession()

        val snapshot = adapter.loadTodayClosingRisks(limit = 25)

        assertThat(snapshot.schema).isEqualTo("admin.today_closing_risks.v1")
        assertThat(snapshot.generatedAt).isNotNull
        assertThat(snapshot.items.map { it.sessionId })
            .containsSubsequence(
                UUID.fromString(TODAY_RISK_BLOCKED_SESSION_ID),
                UUID.fromString(TODAY_RISK_IN_PROGRESS_SESSION_ID),
                UUID.fromString(TODAY_RISK_READY_SESSION_ID),
            )
        assertThat(snapshot.items.map { it.sessionId })
            .doesNotContain(UUID.fromString(TODAY_RISK_PUBLISHED_SESSION_ID))

        val blocked = snapshot.items.single { it.sessionId == UUID.fromString(TODAY_RISK_BLOCKED_SESSION_ID) }
        assertThat(blocked.clubId).isEqualTo(UUID.fromString(TODAY_RISK_CLUB_ID))
        assertThat(blocked.clubSlug).isEqualTo("admin-today-risk")
        assertThat(blocked.clubName).isEqualTo("Admin Today Risk")
        assertThat(blocked.sessionNumber).isEqualTo(10)
        assertThat(blocked.bookTitle).isEqualTo("Blocked Book")
        assertThat(blocked.meetingDate).isEqualTo(LocalDate.parse("2026-06-10"))
        assertThat(blocked.overallState).isEqualTo("BLOCKED")
        assertThat(blocked.primaryBlocker).isEqualTo("FEEDBACK_DOCUMENT_INVALID")
        assertThat(blocked.hostClosingHref)
            .isEqualTo("/clubs/admin-today-risk/app/host/sessions/$TODAY_RISK_BLOCKED_SESSION_ID/closing")
        assertThat(snapshot.items.toString()).doesNotContain("RAW_TODAY_PRIVATE_FEEDBACK_SENTINEL")
    }

    @Test
    fun `enforces the global today closing risk item limit`() {
        seedClub(TODAY_RISK_LIMIT_CLUB_ID, "admin-today-risk-limit", "Admin Today Risk Limit")
        repeat(30) { index ->
            val suffix = 200 + index
            val sessionId = "00000000-0000-0000-0000-0000000cb$suffix"
            insertSession(
                TodayRiskSessionSeed(
                    clubId = TODAY_RISK_LIMIT_CLUB_ID,
                    sessionId = sessionId,
                    number = 100 + index,
                    bookTitle = "Limit Book $index",
                    sessionDate = "2026-12-${(index % 28) + 1}",
                    state = "CLOSED",
                    visibility = "MEMBER",
                ),
            )
        }

        val snapshot = adapter.loadTodayClosingRisks(limit = 25)

        val limitedItems = snapshot.items.filter { it.clubId == UUID.fromString(TODAY_RISK_LIMIT_CLUB_ID) }
        assertThat(limitedItems).hasSize(25)
    }

    private fun seedBlockedSession() {
        insertSession(
            TodayRiskSessionSeed(
                TODAY_RISK_CLUB_ID,
                TODAY_RISK_BLOCKED_SESSION_ID,
                10,
                "Blocked Book",
                "2026-06-10",
                "CLOSED",
                "MEMBER",
            ),
        )
        insertPublication(
            "00000000-0000-0000-0000-0000000cb201",
            TODAY_RISK_CLUB_ID,
            TODAY_RISK_BLOCKED_SESSION_ID,
            false,
            "MEMBER",
        )
        insertFeedbackDocument(
            "00000000-0000-0000-0000-0000000cb301",
            TODAY_RISK_CLUB_ID,
            TODAY_RISK_BLOCKED_SESSION_ID,
            "RAW_TODAY_PRIVATE_FEEDBACK_SENTINEL without the required template marker",
        )
    }

    private fun seedInProgressSession() {
        insertSession(
            TodayRiskSessionSeed(
                TODAY_RISK_CLUB_ID,
                TODAY_RISK_IN_PROGRESS_SESSION_ID,
                11,
                "Missing Records Book",
                "2026-06-11",
                "CLOSED",
                "MEMBER",
            ),
        )
    }

    private fun seedReadySession() {
        insertSession(
            TodayRiskSessionSeed(
                TODAY_RISK_CLUB_ID,
                TODAY_RISK_READY_SESSION_ID,
                12,
                "Ready Book",
                "2026-06-12",
                "CLOSED",
                "MEMBER",
            ),
        )
        insertPublication(
            "00000000-0000-0000-0000-0000000cb202",
            TODAY_RISK_CLUB_ID,
            TODAY_RISK_READY_SESSION_ID,
            false,
            "MEMBER",
        )
        insertFeedbackDocument(
            "00000000-0000-0000-0000-0000000cb302",
            TODAY_RISK_CLUB_ID,
            TODAY_RISK_READY_SESSION_ID,
            "<!-- readmates-feedback:v1 -->\n# Ready feedback",
        )
    }

    private fun seedPublishedSession() {
        insertSession(
            TodayRiskSessionSeed(
                TODAY_RISK_CLUB_ID,
                TODAY_RISK_PUBLISHED_SESSION_ID,
                13,
                "Published Book",
                "2026-06-13",
                "PUBLISHED",
                "PUBLIC",
            ),
        )
        insertPublication(
            "00000000-0000-0000-0000-0000000cb203",
            TODAY_RISK_CLUB_ID,
            TODAY_RISK_PUBLISHED_SESSION_ID,
            true,
            "PUBLIC",
        )
        insertFeedbackDocument(
            "00000000-0000-0000-0000-0000000cb303",
            TODAY_RISK_CLUB_ID,
            TODAY_RISK_PUBLISHED_SESSION_ID,
            "<!-- readmates-feedback:v1 -->\n# Published feedback",
        )
        insertNotificationEvent(
            "00000000-0000-0000-0000-0000000cb401",
            TODAY_RISK_CLUB_ID,
            TODAY_RISK_PUBLISHED_SESSION_ID,
        )
    }

    private fun seedClub(
        clubId: String,
        slug: String,
        name: String,
    ) {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (?, ?, ?, '', '', 'ACTIVE', 'PRIVATE')
            """.trimIndent(),
            clubId,
            slug,
            name,
        )
    }

    private fun insertSession(seed: TodayRiskSessionSeed) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, question_deadline_at, location_label, state, visibility
            )
            values (?, ?, ?, ?, ?, 'Author', ?, '19:30:00', '21:30:00', ?,
              'Online', ?, ?)
            """.trimIndent(),
            seed.sessionId,
            seed.clubId,
            seed.number,
            "${seed.number} session",
            seed.bookTitle,
            seed.sessionDate,
            "${seed.sessionDate} 12:00:00",
            seed.state,
            seed.visibility,
        )
    }

    private fun insertPublication(
        id: String,
        clubId: String,
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
            clubId,
            sessionId,
            visibility,
            isPublic,
            isPublic,
        )
    }

    private fun insertFeedbackDocument(
        id: String,
        clubId: String,
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
            clubId,
            sessionId,
            sourceText,
            sourceText.length,
        )
    }

    private fun insertNotificationEvent(
        id: String,
        clubId: String,
        sessionId: String,
    ) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json,
              status, kafka_topic, kafka_key, dedupe_key, published_at, created_at, updated_at
            )
            values (
              ?,
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
            id,
            clubId,
            sessionId,
            sessionId,
            sessionId,
            "today-closing-risk-notification-$sessionId",
        )
    }
}

private data class TodayRiskSessionSeed(
    val clubId: String,
    val sessionId: String,
    val number: Int,
    val bookTitle: String,
    val sessionDate: String,
    val state: String,
    val visibility: String,
)
