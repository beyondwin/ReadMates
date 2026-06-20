package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.AdminClubClosingRiskItem
import com.readmates.club.application.model.AdminTodayClosingRiskItem
import com.readmates.support.ReadmatesMySqlIntegrationTestSupport
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.jdbc.Sql
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

private const val LEDGER_CLUB_ID = "00000000-0000-0000-0000-0000000cd001"
private const val LEDGER_SESSION_ID = "00000000-0000-0000-0000-0000000cd101"
private const val LEDGER_SECOND_SESSION_ID = "00000000-0000-0000-0000-0000000cd102"
private const val LEDGER_CLEANUP_SQL = """
    delete from admin_closing_risk_ledger where club_id = '$LEDGER_CLUB_ID';
    delete from sessions where club_id = '$LEDGER_CLUB_ID';
    delete from clubs where id = '$LEDGER_CLUB_ID';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [LEDGER_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [LEDGER_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminClosingRiskLedgerAdapterTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcAdminClosingRiskLedgerAdapter(jdbcTemplate) }

    @Test
    fun `creates today ledger rows with age and active state`() {
        seedClubAndSessions()
        val observedAt = OffsetDateTime.of(2026, 6, 21, 0, 0, 0, 0, ZoneOffset.UTC)

        val synced = adapter.syncToday(listOf(todayRisk()), observedAt)

        assertThat(synced).hasSize(1)
        assertThat(synced.single().ledgerState).isEqualTo("ACTIVE")
        assertThat(synced.single().firstDetectedAt).isEqualTo(observedAt)
        assertThat(synced.single().lastSeenAt).isEqualTo(observedAt)
        assertThat(synced.single().ageDays).isEqualTo(0)
        assertThat(synced.single().occurrenceCount).isEqualTo(1)
    }

    @Test
    fun `does not increment occurrence count on repeated active reads`() {
        seedClubAndSessions()
        val first = OffsetDateTime.of(2026, 6, 18, 0, 0, 0, 0, ZoneOffset.UTC)
        val later = OffsetDateTime.of(2026, 6, 21, 0, 0, 0, 0, ZoneOffset.UTC)

        adapter.syncToday(listOf(todayRisk()), first)
        val synced = adapter.syncToday(listOf(todayRisk()), later)

        assertThat(synced.single().firstDetectedAt).isEqualTo(first)
        assertThat(synced.single().lastSeenAt).isEqualTo(later)
        assertThat(synced.single().ageDays).isEqualTo(3)
        assertThat(synced.single().occurrenceCount).isEqualTo(1)
    }

    @Test
    fun `updates state and blocker without resetting first detection`() {
        seedClubAndSessions()
        val first = OffsetDateTime.of(2026, 6, 18, 0, 0, 0, 0, ZoneOffset.UTC)
        val later = OffsetDateTime.of(2026, 6, 21, 0, 0, 0, 0, ZoneOffset.UTC)

        adapter.syncClub(UUID.fromString(LEDGER_CLUB_ID), listOf(clubRisk()), first)
        val synced =
            adapter.syncClub(
                UUID.fromString(LEDGER_CLUB_ID),
                listOf(clubRisk().copy(overallState = "READY", primaryBlocker = "MEMBER_NOTIFICATION_REQUIRED")),
                later,
            )

        val item = synced.activeItems.single()
        assertThat(item.overallState).isEqualTo("READY")
        assertThat(item.primaryBlocker).isEqualTo("MEMBER_NOTIFICATION_REQUIRED")
        assertThat(item.firstDetectedAt).isEqualTo(first)
        assertThat(item.lastSeenAt).isEqualTo(later)
        assertThat(item.occurrenceCount).isEqualTo(1)
    }

    @Test
    fun `today empty snapshot resolves rows and reopens them with incremented occurrence count`() {
        seedClubAndSessions()
        val first = OffsetDateTime.of(2026, 6, 18, 0, 0, 0, 0, ZoneOffset.UTC)
        val resolved = OffsetDateTime.of(2026, 6, 20, 0, 0, 0, 0, ZoneOffset.UTC)
        val reopened = OffsetDateTime.of(2026, 6, 21, 0, 0, 0, 0, ZoneOffset.UTC)

        adapter.syncToday(listOf(todayRisk()), first)
        adapter.syncToday(emptyList(), resolved)
        val resolvedSync = adapter.syncClub(UUID.fromString(LEDGER_CLUB_ID), emptyList(), resolved)
        val reopenedSync = adapter.syncToday(listOf(todayRisk()), reopened)

        assertThat(resolvedSync.activeItems).isEmpty()
        assertThat(resolvedSync.recentlyResolvedItems.single().ledgerState).isEqualTo("RESOLVED")
        assertThat(resolvedSync.recentlyResolvedItems.single().lastSeenAt).isEqualTo(first)
        assertThat(resolvedSync.recentlyResolvedItems.single().resolvedAt).isEqualTo(resolved)
        assertThat(reopenedSync.single().ledgerState).isEqualTo("ACTIVE")
        assertThat(reopenedSync.single().occurrenceCount).isEqualTo(2)
        assertThat(reopenedSync.single().resolvedAt).isNull()
    }

    @Test
    fun `today sync resolves existing active rows when the current today snapshot is empty`() {
        seedClubAndSessions()
        val first = OffsetDateTime.of(2026, 6, 18, 0, 0, 0, 0, ZoneOffset.UTC)
        val resolved = OffsetDateTime.of(2026, 6, 20, 0, 0, 0, 0, ZoneOffset.UTC)
        val reopened = OffsetDateTime.of(2026, 6, 21, 0, 0, 0, 0, ZoneOffset.UTC)

        adapter.syncToday(listOf(todayRisk()), first)
        val emptySync = adapter.syncToday(emptyList(), resolved)
        val reopenedSync = adapter.syncToday(listOf(todayRisk()), reopened)

        assertThat(emptySync).isEmpty()
        assertThat(reopenedSync.single().ledgerState).isEqualTo("ACTIVE")
        assertThat(reopenedSync.single().occurrenceCount).isEqualTo(2)
        assertThat(reopenedSync.single().firstDetectedAt).isEqualTo(first)
    }

    @Test
    fun `today sync does not resolve omitted rows from a non-empty partial snapshot`() {
        seedClubAndSessions()
        val first = OffsetDateTime.of(2026, 6, 18, 0, 0, 0, 0, ZoneOffset.UTC)
        val partial = OffsetDateTime.of(2026, 6, 20, 0, 0, 0, 0, ZoneOffset.UTC)
        val later = OffsetDateTime.of(2026, 6, 21, 0, 0, 0, 0, ZoneOffset.UTC)

        adapter.syncToday(listOf(todayRisk(), secondTodayRisk()), first)
        adapter.syncToday(listOf(secondTodayRisk()), partial)
        val synced = adapter.syncToday(listOf(todayRisk()), later)

        assertThat(synced.single().ledgerState).isEqualTo("ACTIVE")
        assertThat(synced.single().occurrenceCount).isEqualTo(1)
        assertThat(synced.single().firstDetectedAt).isEqualTo(first)
        assertThat(synced.single().resolvedAt).isNull()
    }

    @Test
    fun `club sync does not resolve rows omitted by limited club detail snapshot`() {
        seedClubAndSessions()
        val first = OffsetDateTime.of(2026, 6, 18, 0, 0, 0, 0, ZoneOffset.UTC)
        val partial = OffsetDateTime.of(2026, 6, 20, 0, 0, 0, 0, ZoneOffset.UTC)
        val later = OffsetDateTime.of(2026, 6, 21, 0, 0, 0, 0, ZoneOffset.UTC)
        val clubId = UUID.fromString(LEDGER_CLUB_ID)

        adapter.syncToday(listOf(todayRisk(), secondTodayRisk()), first)
        adapter.syncClub(clubId, listOf(secondClubRisk()), partial)
        val synced = adapter.syncToday(listOf(todayRisk()), later)

        assertThat(synced.single().ledgerState).isEqualTo("ACTIVE")
        assertThat(synced.single().occurrenceCount).isEqualTo(1)
        assertThat(synced.single().firstDetectedAt).isEqualTo(first)
        assertThat(synced.single().resolvedAt).isNull()
    }

    private fun seedClubAndSessions() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (?, 'ledger-club', 'Ledger Club', '', '', 'ACTIVE', 'PRIVATE')
            """.trimIndent(),
            LEDGER_CLUB_ID,
        )
        insertSession(LEDGER_SESSION_ID, 7, "Ledger Book")
        insertSession(LEDGER_SECOND_SESSION_ID, 8, "Second Ledger Book")
    }

    private fun insertSession(
        sessionId: String,
        number: Int,
        bookTitle: String,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, question_deadline_at, location_label, state, visibility
            )
            values (?, ?, ?, ?, ?, 'Author', '2026-06-18',
              '19:30:00', '21:30:00', '2026-06-18 12:00:00', 'Online', 'CLOSED', 'MEMBER')
            """.trimIndent(),
            sessionId,
            LEDGER_CLUB_ID,
            number,
            "Session $number",
            bookTitle,
        )
    }

    private fun todayRisk(): AdminTodayClosingRiskItem =
        AdminTodayClosingRiskItem(
            clubId = UUID.fromString(LEDGER_CLUB_ID),
            clubSlug = "ledger-club",
            clubName = "Ledger Club",
            sessionId = UUID.fromString(LEDGER_SESSION_ID),
            sessionNumber = 7,
            bookTitle = "Ledger Book",
            meetingDate = LocalDate.parse("2026-06-18"),
            overallState = "BLOCKED",
            primaryBlocker = "FEEDBACK_DOCUMENT_INVALID",
            hostClosingHref = "/clubs/ledger-club/app/host/sessions/$LEDGER_SESSION_ID/closing",
        )

    private fun secondTodayRisk(): AdminTodayClosingRiskItem =
        todayRisk().copy(
            sessionId = UUID.fromString(LEDGER_SECOND_SESSION_ID),
            sessionNumber = 8,
            bookTitle = "Second Ledger Book",
            hostClosingHref = "/clubs/ledger-club/app/host/sessions/$LEDGER_SECOND_SESSION_ID/closing",
        )

    private fun clubRisk(): AdminClubClosingRiskItem =
        AdminClubClosingRiskItem(
            sessionId = UUID.fromString(LEDGER_SESSION_ID),
            sessionNumber = 7,
            bookTitle = "Ledger Book",
            meetingDate = LocalDate.parse("2026-06-18"),
            overallState = "BLOCKED",
            primaryBlocker = "FEEDBACK_DOCUMENT_INVALID",
            hostClosingHref = "/clubs/ledger-club/app/host/sessions/$LEDGER_SESSION_ID/closing",
        )

    private fun secondClubRisk(): AdminClubClosingRiskItem =
        clubRisk().copy(
            sessionId = UUID.fromString(LEDGER_SECOND_SESSION_ID),
            sessionNumber = 8,
            bookTitle = "Second Ledger Book",
            hostClosingHref = "/clubs/ledger-club/app/host/sessions/$LEDGER_SECOND_SESSION_ID/closing",
        )
}
