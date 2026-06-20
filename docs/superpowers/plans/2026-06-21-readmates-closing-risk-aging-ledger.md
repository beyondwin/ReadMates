# ReadMates Closing Risk Aging Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable aging and resolution tracking to platform-admin closing risks without giving platform admins session-content mutation power.

**Architecture:** Keep the current computed closing-risk projection as the detection source, then merge it with a new `admin_closing_risk_ledger` table from `AdminClubOperationsService`. The ledger is updated from admin read paths through a new outbound port/adapter; frontend contracts render additive tracking fields and fall back to safe untracked copy when fields are absent.

**Tech Stack:** Kotlin/Spring Boot, JdbcTemplate, MySQL/Flyway, React 19, React Router 7, TanStack Query 5, Vite 8, Vitest, Playwright.

## Global Constraints

- Follow `docs/agents/server.md` for server API, auth, persistence, and migration work.
- Follow `docs/agents/front.md` for frontend route, state, API client, and tests.
- Follow `docs/agents/design.md` for UI, layout, copy, and visual polish.
- Follow `docs/agents/docs.md` for CHANGELOG and release-readiness documentation.
- Implement the approved spec: `docs/superpowers/specs/2026-06-21-readmates-closing-risk-aging-ledger-design.md`.
- New migration file: `server/src/main/resources/db/mysql/migration/V36__admin_closing_risk_ledger.sql`.
- Do not add platform-admin mutations for session content, feedback document text, generated result JSON, publication contents, or notification send.
- Do not store or render raw member data, email body, feedback body, transcript, generated JSON, provider raw error, private domain, deployment identifier, secret, token-shaped value, or local absolute path.
- Do not add a scheduler or event-sourced history table in this pass.
- Keep repair actions host-owned through canonical `/clubs/:slug/app/host/sessions/:sessionId/closing` links.
- Existing frontend must keep working if new fields are absent; new frontend must treat missing fields as `UNTRACKED`.
- Unknown state or blocker codes must render as safe `확인 필요` copy.

---

## File Structure

- Create `server/src/main/resources/db/mysql/migration/V36__admin_closing_risk_ledger.sql`: additive ledger table, constraints, and indexes.
- Modify `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`: add tracking fields to today and club closing-risk items, add `recentlyResolvedItems` and `trackingUnavailable` to `AdminClubClosingRisks`.
- Modify `server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsSnapshotPort.kt`: add `AdminClosingRiskLedgerPort` and sync result model.
- Modify `server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt`: merge current snapshots with ledger sync results and degrade safely when ledger sync fails.
- Create `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClosingRiskLedgerAdapter.kt`: own all ledger SQL/upsert/resolve/reopen behavior.
- Modify `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt`: response mapping continues to expose application models with new additive fields.
- Modify server tests under `server/src/test/kotlin/com/readmates/club/...`: add service and persistence coverage; update cleanup SQL for the new FK table.
- Modify `front/features/platform-admin/model/platform-admin-domain-types.ts`: add tracking fields to `PlatformAdminTodayClosingRisk`.
- Modify `front/features/platform-admin/model/platform-admin-club-operations-model.ts`: add tracking fields to `AdminClubClosingRiskItem`, `recentlyResolvedItems`, helpers for aging/repeat/resolved/unavailable labels.
- Modify `front/features/platform-admin/model/platform-admin-workbench-model.ts`: add Today queue aging labels and tracking-unavailable badges.
- Modify `front/features/platform-admin/ui/admin-selected-brief.tsx`: show tracking metadata in selected closing-risk brief.
- Modify `front/features/platform-admin/ui/admin-club-operations-page.tsx`: show active tracking metadata and a compact recently resolved section.
- Modify frontend tests adjacent to the changed model/route/ui files.
- Modify `front/tests/e2e/admin-today-closing-risks.spec.ts`: assert aging copy and host board link from a public-safe fixture.
- Modify `CHANGELOG.md` and `docs/development/release-readiness-review.md` after implementation and verification.

---

### Task 1: Ledger Migration and Persistence Adapter

**Files:**
- Create: `server/src/main/resources/db/mysql/migration/V36__admin_closing_risk_ledger.sql`
- Create: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClosingRiskLedgerAdapter.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsSnapshotPort.kt`
- Create: `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClosingRiskLedgerAdapterTest.kt`

**Interfaces:**
- Consumes:
  - `AdminTodayClosingRiskItem`
  - `AdminClubClosingRiskItem`
- Produces:
  - `interface AdminClosingRiskLedgerPort`
  - `fun syncToday(items: List<AdminTodayClosingRiskItem>, observedAt: OffsetDateTime): List<AdminTodayClosingRiskItem>`
  - `fun syncClub(clubId: UUID, items: List<AdminClubClosingRiskItem>, observedAt: OffsetDateTime): AdminClubClosingRiskLedgerSync`
  - `data class AdminClubClosingRiskLedgerSync(val activeItems: List<AdminClubClosingRiskItem>, val recentlyResolvedItems: List<AdminClubClosingRiskItem>)`

- [ ] **Step 1: Add model fields and the outbound port**

Modify `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`:

```kotlin
data class AdminClubClosingRisks(
    val incompleteCount: Int,
    val blockedCount: Int,
    val readyCount: Int,
    val items: List<AdminClubClosingRiskItem>,
    val recentlyResolvedItems: List<AdminClubClosingRiskItem> = emptyList(),
    val trackingUnavailable: Boolean = false,
)

data class AdminClubClosingRiskItem(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val overallState: String,
    val primaryBlocker: String?,
    val hostClosingHref: String,
    val firstDetectedAt: OffsetDateTime? = null,
    val lastSeenAt: OffsetDateTime? = null,
    val resolvedAt: OffsetDateTime? = null,
    val ageDays: Long? = null,
    val occurrenceCount: Int = 0,
    val ledgerState: String = "UNTRACKED",
)

data class AdminTodayClosingRiskSnapshot(
    val schema: String = "admin.today_closing_risks.v1",
    val generatedAt: OffsetDateTime,
    val items: List<AdminTodayClosingRiskItem>,
    val trackingUnavailable: Boolean = false,
)

data class AdminTodayClosingRiskItem(
    val clubId: UUID,
    val clubSlug: String,
    val clubName: String,
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: LocalDate,
    val overallState: String,
    val primaryBlocker: String?,
    val hostClosingHref: String,
    val firstDetectedAt: OffsetDateTime? = null,
    val lastSeenAt: OffsetDateTime? = null,
    val resolvedAt: OffsetDateTime? = null,
    val ageDays: Long? = null,
    val occurrenceCount: Int = 0,
    val ledgerState: String = "UNTRACKED",
)
```

Modify `server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsSnapshotPort.kt`:

```kotlin
package com.readmates.club.application.port.out

import com.readmates.club.application.model.AdminClubClosingRiskItem
import com.readmates.club.application.model.AdminClubOperationsSnapshot
import com.readmates.club.application.model.AdminTodayClosingRiskItem
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import java.time.OffsetDateTime
import java.util.UUID

interface AdminClubOperationsSnapshotPort {
    fun loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot?
}

interface AdminTodayClosingRisksPort {
    fun loadTodayClosingRisks(limit: Int): AdminTodayClosingRiskSnapshot
}

interface AdminClosingRiskLedgerPort {
    fun syncToday(
        items: List<AdminTodayClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): List<AdminTodayClosingRiskItem>

    fun syncClub(
        clubId: UUID,
        items: List<AdminClubClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): AdminClubClosingRiskLedgerSync
}

data class AdminClubClosingRiskLedgerSync(
    val activeItems: List<AdminClubClosingRiskItem>,
    val recentlyResolvedItems: List<AdminClubClosingRiskItem>,
)
```

- [ ] **Step 2: Create the migration**

Create `server/src/main/resources/db/mysql/migration/V36__admin_closing_risk_ledger.sql`:

```sql
CREATE TABLE admin_closing_risk_ledger (
  id BINARY(16) NOT NULL,
  club_id BINARY(16) NOT NULL,
  session_id BINARY(16) NOT NULL,
  current_state VARCHAR(32) NOT NULL,
  primary_blocker VARCHAR(64) NULL,
  first_detected_at DATETIME(6) NOT NULL,
  last_seen_at DATETIME(6) NOT NULL,
  resolved_at DATETIME(6) NULL,
  occurrence_count INT NOT NULL DEFAULT 1,
  last_host_closing_href VARCHAR(255) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY admin_closing_risk_ledger_club_session_uk (club_id, session_id),
  KEY admin_closing_risk_ledger_state_seen_idx (current_state, last_seen_at),
  KEY admin_closing_risk_ledger_club_state_seen_idx (club_id, current_state, last_seen_at),
  CONSTRAINT admin_closing_risk_ledger_club_fk
    FOREIGN KEY (club_id) REFERENCES clubs(id),
  CONSTRAINT admin_closing_risk_ledger_session_fk
    FOREIGN KEY (session_id) REFERENCES sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

- [ ] **Step 3: Write the failing persistence test**

Create `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClosingRiskLedgerAdapterTest.kt`:

```kotlin
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
    fun `resolves missing active rows and reopens them with incremented occurrence count`() {
        seedClubAndSessions()
        val first = OffsetDateTime.of(2026, 6, 18, 0, 0, 0, 0, ZoneOffset.UTC)
        val resolved = OffsetDateTime.of(2026, 6, 20, 0, 0, 0, 0, ZoneOffset.UTC)
        val reopened = OffsetDateTime.of(2026, 6, 21, 0, 0, 0, 0, ZoneOffset.UTC)

        adapter.syncClub(UUID.fromString(LEDGER_CLUB_ID), listOf(clubRisk()), first)
        val resolvedSync = adapter.syncClub(UUID.fromString(LEDGER_CLUB_ID), emptyList(), resolved)
        val reopenedSync = adapter.syncClub(UUID.fromString(LEDGER_CLUB_ID), listOf(clubRisk()), reopened)

        assertThat(resolvedSync.activeItems).isEmpty()
        assertThat(resolvedSync.recentlyResolvedItems.single().ledgerState).isEqualTo("RESOLVED")
        assertThat(resolvedSync.recentlyResolvedItems.single().resolvedAt).isEqualTo(resolved)
        assertThat(reopenedSync.activeItems.single().ledgerState).isEqualTo("ACTIVE")
        assertThat(reopenedSync.activeItems.single().occurrenceCount).isEqualTo(2)
        assertThat(reopenedSync.activeItems.single().resolvedAt).isNull()
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

    private fun insertSession(sessionId: String, number: Int, bookTitle: String) {
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
}
```

- [ ] **Step 4: Run the failing persistence test**

Run:

```bash
./server/gradlew -p server integrationTest --tests JdbcAdminClosingRiskLedgerAdapterTest
```

Expected: FAIL because `JdbcAdminClosingRiskLedgerAdapter` does not exist yet.

- [ ] **Step 5: Implement the adapter**

Create `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClosingRiskLedgerAdapter.kt`:

```kotlin
package com.readmates.club.adapter.out.persistence

import com.readmates.club.application.model.AdminClubClosingRiskItem
import com.readmates.club.application.model.AdminTodayClosingRiskItem
import com.readmates.club.application.port.out.AdminClosingRiskLedgerPort
import com.readmates.club.application.port.out.AdminClubClosingRiskLedgerSync
import com.readmates.shared.db.dbString
import com.readmates.shared.db.utcOffsetDateTimeOrNull
import com.readmates.shared.db.uuid
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.temporal.ChronoUnit
import java.util.UUID

@Repository
class JdbcAdminClosingRiskLedgerAdapter(
    private val jdbcTemplate: JdbcTemplate,
) : AdminClosingRiskLedgerPort {
    override fun syncToday(
        items: List<AdminTodayClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): List<AdminTodayClosingRiskItem> {
        upsertActive(items, observedAt)
        resolveMissingForClubs(items.map { it.clubId }.toSet(), items.map { it.sessionId }.toSet(), observedAt)
        val rows = loadRows(items.map { it.sessionId }.toSet()).associateBy { it.sessionId }
        return items.map { item -> item.withTracking(rows[item.sessionId], observedAt) }
    }

    override fun syncClub(
        clubId: UUID,
        items: List<AdminClubClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): AdminClubClosingRiskLedgerSync {
        upsertActiveClub(clubId, items, observedAt)
        resolveMissingForClub(clubId, items.map { it.sessionId }.toSet(), observedAt)
        val rows = loadRowsForClub(clubId)
        val activeBySession = rows.filter { it.currentState != "RESOLVED" }.associateBy { it.sessionId }
        val resolvedRows = rows.filter { it.currentState == "RESOLVED" && it.resolvedAt != null }.take(5)
        return AdminClubClosingRiskLedgerSync(
            activeItems = items.map { item -> item.withTracking(activeBySession[item.sessionId], observedAt) },
            recentlyResolvedItems = resolvedRows.map { row -> row.toResolvedClubRisk(observedAt) },
        )
    }

    private fun upsertActive(
        items: List<AdminTodayClosingRiskItem>,
        observedAt: OffsetDateTime,
    ) {
        for (item in items) {
            upsertOne(
                clubId = item.clubId,
                sessionId = item.sessionId,
                sessionNumber = item.sessionNumber,
                bookTitle = item.bookTitle,
                meetingDate = item.meetingDate,
                currentState = item.overallState,
                primaryBlocker = item.primaryBlocker,
                hostClosingHref = item.hostClosingHref,
                observedAt = observedAt,
            )
        }
    }

    private fun upsertActiveClub(
        clubId: UUID,
        items: List<AdminClubClosingRiskItem>,
        observedAt: OffsetDateTime,
    ) {
        for (item in items) {
            upsertOne(
                clubId = clubId,
                sessionId = item.sessionId,
                sessionNumber = item.sessionNumber,
                bookTitle = item.bookTitle,
                meetingDate = item.meetingDate,
                currentState = item.overallState,
                primaryBlocker = item.primaryBlocker,
                hostClosingHref = item.hostClosingHref,
                observedAt = observedAt,
            )
        }
    }

    private fun upsertOne(
        clubId: UUID,
        sessionId: UUID,
        sessionNumber: Int,
        bookTitle: String,
        meetingDate: LocalDate,
        currentState: String,
        primaryBlocker: String?,
        hostClosingHref: String,
        observedAt: OffsetDateTime,
    ) {
        val existing = loadRows(setOf(sessionId)).firstOrNull()
        if (existing == null) {
            jdbcTemplate.update(
                """
                insert into admin_closing_risk_ledger (
                  id, club_id, session_id, current_state, primary_blocker,
                  first_detected_at, last_seen_at, resolved_at, occurrence_count, last_host_closing_href
                )
                values (uuid_to_bin(uuid(), true), uuid_to_bin(?, true), uuid_to_bin(?, true), ?, ?, ?, ?, null, 1, ?)
                """.trimIndent(),
                clubId.dbString(),
                sessionId.dbString(),
                currentState,
                primaryBlocker,
                observedAt,
                observedAt,
                hostClosingHref,
            )
            return
        }

        val reopened = existing.currentState == "RESOLVED"
        jdbcTemplate.update(
            """
            update admin_closing_risk_ledger
            set current_state = ?,
                primary_blocker = ?,
                last_seen_at = ?,
                resolved_at = null,
                occurrence_count = occurrence_count + ?,
                last_host_closing_href = ?
            where club_id = uuid_to_bin(?, true)
              and session_id = uuid_to_bin(?, true)
            """.trimIndent(),
            currentState,
            primaryBlocker,
            observedAt,
            if (reopened) 1 else 0,
            hostClosingHref,
            clubId.dbString(),
            sessionId.dbString(),
        )
    }

    private fun resolveMissingForClubs(
        clubIds: Set<UUID>,
        activeSessionIds: Set<UUID>,
        observedAt: OffsetDateTime,
    ) {
        for (clubId in clubIds) {
            resolveMissingForClub(clubId, activeSessionIds, observedAt)
        }
    }

    private fun resolveMissingForClub(
        clubId: UUID,
        activeSessionIds: Set<UUID>,
        observedAt: OffsetDateTime,
    ) {
        val activeRows = loadRowsForClub(clubId).filter { it.currentState != "RESOLVED" }
        for (row in activeRows.filterNot { activeSessionIds.contains(it.sessionId) }) {
            jdbcTemplate.update(
                """
                update admin_closing_risk_ledger
                set current_state = 'RESOLVED',
                    resolved_at = ?,
                    last_seen_at = ?
                where club_id = uuid_to_bin(?, true)
                  and session_id = uuid_to_bin(?, true)
                """.trimIndent(),
                observedAt,
                observedAt,
                clubId.dbString(),
                row.sessionId.dbString(),
            )
        }
    }

    private fun loadRows(sessionIds: Set<UUID>): List<LedgerRow> {
        if (sessionIds.isEmpty()) return emptyList()
        val placeholders = sessionIds.joinToString(",") { "uuid_to_bin(?, true)" }
        return jdbcTemplate.query(
            """
            select l.*, s.number, s.book_title, s.session_date
            from admin_closing_risk_ledger l
            join sessions s on s.id = l.session_id
            where l.session_id in ($placeholders)
            """.trimIndent(),
            { rs, _ -> rs.toLedgerRow() },
            *sessionIds.map { it.dbString() }.toTypedArray(),
        )
    }

    private fun loadRowsForClub(clubId: UUID): List<LedgerRow> =
        jdbcTemplate.query(
            """
            select l.*, s.number, s.book_title, s.session_date
            from admin_closing_risk_ledger l
            join sessions s on s.id = l.session_id
            where l.club_id = uuid_to_bin(?, true)
            order by l.current_state = 'RESOLVED', l.last_seen_at desc, s.number desc
            """.trimIndent(),
            { rs, _ -> rs.toLedgerRow() },
            clubId.dbString(),
        )

    private fun ResultSet.toLedgerRow(): LedgerRow =
        LedgerRow(
            clubId = uuid("club_id"),
            sessionId = uuid("session_id"),
            sessionNumber = getInt("number"),
            bookTitle = getString("book_title"),
            meetingDate = getDate("session_date").toLocalDate(),
            currentState = getString("current_state"),
            primaryBlocker = getString("primary_blocker"),
            firstDetectedAt = getObject("first_detected_at", OffsetDateTime::class.java),
            lastSeenAt = getObject("last_seen_at", OffsetDateTime::class.java),
            resolvedAt = utcOffsetDateTimeOrNull("resolved_at"),
            occurrenceCount = getInt("occurrence_count"),
            hostClosingHref = getString("last_host_closing_href"),
        )

    private fun AdminTodayClosingRiskItem.withTracking(
        row: LedgerRow?,
        observedAt: OffsetDateTime,
    ): AdminTodayClosingRiskItem =
        if (row == null) {
            copy(ledgerState = "UNTRACKED")
        } else {
            copy(
                firstDetectedAt = row.firstDetectedAt,
                lastSeenAt = row.lastSeenAt,
                resolvedAt = row.resolvedAt,
                ageDays = ageDays(row.firstDetectedAt, observedAt),
                occurrenceCount = row.occurrenceCount,
                ledgerState = if (row.currentState == "RESOLVED") "RESOLVED" else "ACTIVE",
            )
        }

    private fun AdminClubClosingRiskItem.withTracking(
        row: LedgerRow?,
        observedAt: OffsetDateTime,
    ): AdminClubClosingRiskItem =
        if (row == null) {
            copy(ledgerState = "UNTRACKED")
        } else {
            copy(
                firstDetectedAt = row.firstDetectedAt,
                lastSeenAt = row.lastSeenAt,
                resolvedAt = row.resolvedAt,
                ageDays = ageDays(row.firstDetectedAt, observedAt),
                occurrenceCount = row.occurrenceCount,
                ledgerState = if (row.currentState == "RESOLVED") "RESOLVED" else "ACTIVE",
            )
        }

    private fun LedgerRow.toResolvedClubRisk(observedAt: OffsetDateTime): AdminClubClosingRiskItem =
        AdminClubClosingRiskItem(
            sessionId = sessionId,
            sessionNumber = sessionNumber,
            bookTitle = bookTitle,
            meetingDate = meetingDate,
            overallState = "RESOLVED",
            primaryBlocker = primaryBlocker,
            hostClosingHref = hostClosingHref,
            firstDetectedAt = firstDetectedAt,
            lastSeenAt = lastSeenAt,
            resolvedAt = resolvedAt,
            ageDays = ageDays(firstDetectedAt, observedAt),
            occurrenceCount = occurrenceCount,
            ledgerState = "RESOLVED",
        )

    private fun ageDays(
        firstDetectedAt: OffsetDateTime,
        observedAt: OffsetDateTime,
    ): Long = ChronoUnit.DAYS.between(firstDetectedAt.toLocalDate(), observedAt.toLocalDate()).coerceAtLeast(0)

    private data class LedgerRow(
        val clubId: UUID,
        val sessionId: UUID,
        val sessionNumber: Int,
        val bookTitle: String,
        val meetingDate: LocalDate,
        val currentState: String,
        val primaryBlocker: String?,
        val firstDetectedAt: OffsetDateTime,
        val lastSeenAt: OffsetDateTime,
        val resolvedAt: OffsetDateTime?,
        val occurrenceCount: Int,
        val hostClosingHref: String,
    )
}
```

- [ ] **Step 6: Run the persistence test**

Run:

```bash
./server/gradlew -p server integrationTest --tests JdbcAdminClosingRiskLedgerAdapterTest
```

Expected: PASS for the new adapter test.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/resources/db/mysql/migration/V36__admin_closing_risk_ledger.sql \
  server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt \
  server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsSnapshotPort.kt \
  server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClosingRiskLedgerAdapter.kt \
  server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClosingRiskLedgerAdapterTest.kt
git commit -m "feat(server): add closing risk ledger persistence"
```

---

### Task 2: Server Service Merge and API Contract

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/application/service/AdminClubOperationsServiceTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubOperationsControllerTest.kt`
- Modify: existing integration cleanup SQL in `JdbcAdminTodayClosingRiskTest.kt` and `PlatformAdminClubOperationsControllerTest.kt`

**Interfaces:**
- Consumes: `AdminClosingRiskLedgerPort` from Task 1.
- Produces: API responses containing `firstDetectedAt`, `lastSeenAt`, `resolvedAt`, `ageDays`, `occurrenceCount`, `ledgerState`, and `trackingUnavailable`.

- [ ] **Step 1: Write service tests for successful merge and fallback**

Append to `server/src/test/kotlin/com/readmates/club/application/service/AdminClubOperationsServiceTest.kt`:

```kotlin
@Test
fun `today closing risks include tracking fields from ledger`() {
    val service =
        AdminClubOperationsService(
            FakePort(snapshot()),
            FakeTodayClosingRisksPort(
                AdminTodayClosingRiskSnapshot(
                    generatedAt = GENERATED_AT,
                    items = listOf(todayRisk()),
                ),
            ),
            FakeLedgerPort(todayItems = listOf(todayRisk().copy(ageDays = 3, occurrenceCount = 2, ledgerState = "ACTIVE"))),
        )

    val result = service.todayClosingRisks(admin(PlatformAdminRole.OWNER))

    assertThat(result.trackingUnavailable).isFalse()
    assertThat(result.items.single().ageDays).isEqualTo(3)
    assertThat(result.items.single().occurrenceCount).isEqualTo(2)
    assertThat(result.items.single().ledgerState).isEqualTo("ACTIVE")
}

@Test
fun `ledger failure degrades today closing risks to untracked`() {
    val service =
        AdminClubOperationsService(
            FakePort(snapshot()),
            FakeTodayClosingRisksPort(
                AdminTodayClosingRiskSnapshot(
                    generatedAt = GENERATED_AT,
                    items = listOf(todayRisk()),
                ),
            ),
            ThrowingLedgerPort(),
        )

    val result = service.todayClosingRisks(admin(PlatformAdminRole.OWNER))

    assertThat(result.trackingUnavailable).isTrue()
    assertThat(result.items.single().ledgerState).isEqualTo("UNTRACKED")
    assertThat(result.items.single().ageDays).isNull()
}
```

Add these helpers to the same test file:

```kotlin
private class FakeTodayClosingRisksPort(
    private val snapshot: AdminTodayClosingRiskSnapshot = AdminTodayClosingRiskSnapshot(GENERATED_AT, emptyList()),
) : AdminTodayClosingRisksPort {
    override fun loadTodayClosingRisks(limit: Int): AdminTodayClosingRiskSnapshot = snapshot
}

private class FakeLedgerPort(
    private val todayItems: List<AdminTodayClosingRiskItem> = emptyList(),
    private val clubSync: AdminClubClosingRiskLedgerSync = AdminClubClosingRiskLedgerSync(emptyList(), emptyList()),
) : AdminClosingRiskLedgerPort {
    override fun syncToday(
        items: List<AdminTodayClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): List<AdminTodayClosingRiskItem> = todayItems.ifEmpty { items }

    override fun syncClub(
        clubId: UUID,
        items: List<AdminClubClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): AdminClubClosingRiskLedgerSync = clubSync
}

private class ThrowingLedgerPort : AdminClosingRiskLedgerPort {
    override fun syncToday(
        items: List<AdminTodayClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): List<AdminTodayClosingRiskItem> = throw IllegalStateException("ledger unavailable")

    override fun syncClub(
        clubId: UUID,
        items: List<AdminClubClosingRiskItem>,
        observedAt: OffsetDateTime,
    ): AdminClubClosingRiskLedgerSync = throw IllegalStateException("ledger unavailable")
}

private fun todayRisk(): AdminTodayClosingRiskItem =
    AdminTodayClosingRiskItem(
        clubId = CLUB_ID,
        clubSlug = "reading-sai",
        clubName = "읽는사이",
        sessionId = UUID.fromString("00000000-0000-0000-0000-000000000707"),
        sessionNumber = 7,
        bookTitle = "페인트",
        meetingDate = LocalDate.parse("2026-06-18"),
        overallState = "BLOCKED",
        primaryBlocker = "FEEDBACK_DOCUMENT_INVALID",
        hostClosingHref = "/clubs/reading-sai/app/host/sessions/00000000-0000-0000-0000-000000000707/closing",
    )

private val GENERATED_AT: OffsetDateTime =
    OffsetDateTime.of(2026, 6, 21, 0, 0, 0, 0, ZoneOffset.UTC)
```

- [ ] **Step 2: Run service tests and verify failure**

Run:

```bash
./server/gradlew -p server unitTest --tests AdminClubOperationsServiceTest
```

Expected: FAIL until `AdminClubOperationsService` accepts and uses the new ledger port.

- [ ] **Step 3: Implement service merge and fallback**

Modify constructor and methods in `AdminClubOperationsService.kt`:

```kotlin
class AdminClubOperationsService(
    private val snapshotPort: AdminClubOperationsSnapshotPort,
    private val todayClosingRisksPort: AdminTodayClosingRisksPort,
    private val ledgerPort: AdminClosingRiskLedgerPort,
) : GetAdminClubOperationsUseCase,
    ListAdminTodayClosingRisksUseCase {
    override fun operationsSnapshot(
        admin: CurrentPlatformAdmin,
        clubId: UUID,
    ): AdminClubOperationsSnapshot {
        val snapshot =
            snapshotPort.loadSnapshot(clubId)
                ?: throw PlatformAdminException(PlatformAdminError.CLUB_NOT_FOUND, "Club not found")
        return try {
            val sync =
                ledgerPort.syncClub(
                    clubId = clubId,
                    items = snapshot.closingRisks.items,
                    observedAt = snapshot.generatedAt,
                )
            snapshot.copy(
                closingRisks =
                    snapshot.closingRisks.copy(
                        items = sync.activeItems,
                        recentlyResolvedItems = sync.recentlyResolvedItems,
                        trackingUnavailable = false,
                    ),
            )
        } catch (_: RuntimeException) {
            snapshot.copy(
                closingRisks =
                    snapshot.closingRisks.copy(
                        items = snapshot.closingRisks.items.map { it.copy(ledgerState = "UNTRACKED") },
                        trackingUnavailable = true,
                    ),
            )
        }
    }

    override fun todayClosingRisks(admin: CurrentPlatformAdmin): AdminTodayClosingRiskSnapshot {
        val snapshot = todayClosingRisksPort.loadTodayClosingRisks(TODAY_CLOSING_RISK_LIMIT)
        return try {
            snapshot.copy(
                items = ledgerPort.syncToday(snapshot.items, snapshot.generatedAt),
                trackingUnavailable = false,
            )
        } catch (_: RuntimeException) {
            snapshot.copy(
                items = snapshot.items.map { it.copy(ledgerState = "UNTRACKED") },
                trackingUnavailable = true,
            )
        }
    }
}
```

- [ ] **Step 4: Update API response tests**

In `PlatformAdminClubOperationsControllerTest.kt`, update `ADMIN_TODAY_CLOSING_RISK_CLEANUP_SQL` to delete ledger rows before sessions:

```kotlin
private const val ADMIN_TODAY_CLOSING_RISK_CLEANUP_SQL = """
    delete from admin_closing_risk_ledger where club_id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
    delete from notification_event_outbox where club_id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
    delete from session_feedback_documents where club_id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
    delete from public_session_publications where club_id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
    delete from sessions where club_id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
    delete from clubs where id = '$ADMIN_TODAY_CLOSING_RISK_CLUB_ID';
"""
```

Update the expected today item fields:

```kotlin
assertThat(item.fieldNames().asSequence().toList())
    .contains(
        "clubId",
        "clubSlug",
        "clubName",
        "sessionId",
        "sessionNumber",
        "bookTitle",
        "meetingDate",
        "overallState",
        "primaryBlocker",
        "hostClosingHref",
        "firstDetectedAt",
        "lastSeenAt",
        "resolvedAt",
        "ageDays",
        "occurrenceCount",
        "ledgerState",
    )
assertThat(root.get("trackingUnavailable").asBoolean()).isFalse()
assertThat(item.get("ledgerState").asText()).isEqualTo("ACTIVE")
assertThat(item.get("occurrenceCount").asInt()).isEqualTo(1)
```

- [ ] **Step 5: Run server service and controller tests**

Run:

```bash
./server/gradlew -p server unitTest --tests AdminClubOperationsServiceTest
./server/gradlew -p server integrationTest --tests PlatformAdminClubOperationsControllerTest --tests JdbcAdminTodayClosingRiskTest
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt \
  server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt \
  server/src/test/kotlin/com/readmates/club/application/service/AdminClubOperationsServiceTest.kt \
  server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubOperationsControllerTest.kt \
  server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminTodayClosingRiskTest.kt
git commit -m "feat(server): merge closing risk ledger into admin APIs"
```

---

### Task 3: Frontend Today Queue Tracking Labels

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-domain-types.ts`
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`
- Modify: `front/features/platform-admin/ui/admin-selected-brief.tsx`

**Interfaces:**
- Consumes API fields from Task 2.
- Produces Today queue copy: `3일째 차단`, `반복 2회`, `추적 상태 확인 불가`.

- [ ] **Step 1: Extend frontend contracts**

Modify `PlatformAdminTodayClosingRisk` in `front/features/platform-admin/model/platform-admin-domain-types.ts`:

```ts
export type PlatformAdminClosingRiskLedgerState = "ACTIVE" | "RESOLVED" | "UNTRACKED" | (string & {});

export type PlatformAdminTodayClosingRisk = {
  clubId: string;
  clubSlug: string;
  clubName: string;
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  meetingDate: string;
  overallState: PlatformAdminTodayClosingRiskState;
  primaryBlocker: string | null;
  hostClosingHref: string | null;
  firstDetectedAt?: string | null;
  lastSeenAt?: string | null;
  resolvedAt?: string | null;
  ageDays?: number | null;
  occurrenceCount?: number;
  ledgerState?: PlatformAdminClosingRiskLedgerState;
};

export type PlatformAdminTodayClosingRisksResponse = {
  schema: "admin.today_closing_risks.v1";
  generatedAt: string;
  items: PlatformAdminTodayClosingRisk[];
  trackingUnavailable?: boolean;
};
```

- [ ] **Step 2: Add failing model tests**

Append to `platform-admin-workbench-model.test.ts`:

```ts
it("adds age and repeat labels to closing-risk queue items", () => {
  const result = buildPlatformAdminWorkbench({
    role: "OWNER",
    activeClubCount: 0,
    domainActionRequiredCount: 0,
    selectedClubId: null,
    clubs: [],
    domains: [],
    closingRisks: [{
      clubId: "club-1",
      clubSlug: "reading-sai",
      clubName: "읽는사이",
      sessionId: "session-7",
      sessionNumber: 7,
      bookTitle: "페인트",
      meetingDate: "2026-06-18",
      overallState: "BLOCKED",
      primaryBlocker: "FEEDBACK_DOCUMENT_INVALID",
      hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-7/closing",
      ageDays: 3,
      occurrenceCount: 2,
      ledgerState: "ACTIVE",
    }],
  });

  const item = result.queueItems.find((candidate) => candidate.id === "closing-risk-session-7");
  expect(item?.reason).toBe("페인트 · 피드백 문서 다시 확인 · 3일째 차단 · 반복 2회");
  expect(item?.badges).toContain("3일째 차단");
  expect(result.selectedBrief?.closingRisk).toMatchObject({
    ageLabel: "3일째 차단",
    occurrenceLabel: "반복 2회",
    trackingLabel: "추적 중",
  });
});

it("adds tracking-unavailable copy without raw errors", () => {
  const result = buildPlatformAdminWorkbench({
    role: "OWNER",
    activeClubCount: 0,
    domainActionRequiredCount: 0,
    selectedClubId: null,
    clubs: [],
    domains: [],
    closingRisks: [{
      clubId: "club-1",
      clubSlug: "reading-sai",
      clubName: "읽는사이",
      sessionId: "session-7",
      sessionNumber: 7,
      bookTitle: "페인트",
      meetingDate: "2026-06-18",
      overallState: "BLOCKED",
      primaryBlocker: "RAW_PRIVATE_STACK_TRACE",
      hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-7/closing",
      ledgerState: "UNTRACKED",
    }],
    closingRisksUnavailable: true,
  });

  expect(result.queueItems.some((item) => item.reason.includes("RAW_PRIVATE_STACK_TRACE"))).toBe(false);
  expect(result.queueItems.find((item) => item.id === "closing-risk-session-7")?.badges).toContain("추적 상태 확인 불가");
});
```

- [ ] **Step 3: Run model tests and verify failure**

Run:

```bash
pnpm --dir front test -- platform-admin-workbench-model
```

Expected: FAIL because aging labels are not modeled yet.

- [ ] **Step 4: Implement model helpers and selected brief fields**

In `platform-admin-workbench-model.ts`, extend `PlatformAdminClosingRiskBrief`:

```ts
export type PlatformAdminClosingRiskBrief = {
  kind: "closing-risk";
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  meetingDate: string;
  stateLabel: string;
  blockerLabel: string;
  ageLabel: string | null;
  occurrenceLabel: string | null;
  trackingLabel: string;
};
```

Add helpers:

```ts
function closingRiskAgeLabel(risk: PlatformAdminTodayClosingRisk): string | null {
  if (typeof risk.ageDays !== "number") return null;
  const days = Math.max(0, Math.floor(risk.ageDays));
  if (risk.overallState === "BLOCKED") return `${days}일째 차단`;
  if (risk.overallState === "IN_PROGRESS") return `${days}일째 진행 중`;
  if (risk.overallState === "READY") return `${days}일째 조치 대기`;
  return `${days}일째 확인 필요`;
}

function closingRiskOccurrenceLabel(risk: PlatformAdminTodayClosingRisk): string | null {
  const count = risk.occurrenceCount ?? 0;
  return count > 1 ? `반복 ${count}회` : null;
}

function closingRiskTrackingLabel(risk: PlatformAdminTodayClosingRisk): string {
  if (risk.ledgerState === "ACTIVE") return "추적 중";
  if (risk.ledgerState === "RESOLVED") return "해소됨";
  return "추적 상태 확인 불가";
}

function closingRiskBadges(risk: PlatformAdminTodayClosingRisk, blockerLabel: string): string[] {
  return [
    closingRiskStateLabel(risk.overallState),
    blockerLabel,
    closingRiskAgeLabel(risk),
    closingRiskOccurrenceLabel(risk),
    risk.ledgerState === "UNTRACKED" ? "추적 상태 확인 불가" : null,
  ].filter((value): value is string => Boolean(value));
}
```

Update `buildClosingRiskQueueItems()` to use these helpers:

```ts
const ageLabel = closingRiskAgeLabel(risk);
const occurrenceLabel = closingRiskOccurrenceLabel(risk);
const reasonParts = [risk.bookTitle, blockerLabel, ageLabel, occurrenceLabel].filter(Boolean);
return {
  id: closingRiskQueueId(risk.sessionId),
  type: "closing-risk",
  clubId: risk.clubId,
  slug: risk.clubSlug,
  name: `${risk.clubName} · No.${risk.sessionNumber}`,
  severity: closingRiskSeverity(risk.overallState),
  reason: reasonParts.join(" · "),
  primaryActionLabel: risk.hostClosingHref ? "호스트 클로징 보드" : "클럽 운영 상세",
  badges: closingRiskBadges(risk, blockerLabel),
  sortRank: closingRiskSortRank(risk.overallState),
  href: risk.hostClosingHref || `/admin/clubs/${risk.clubId}`,
};
```

Update `buildClosingRiskBriefsByQueueId()` to include the new labels.

- [ ] **Step 5: Render selected brief tracking metadata**

In `admin-selected-brief.tsx`, inside the `brief.closingRisk` block, add:

```tsx
<div className="admin-selected-brief__check" data-state="blocked">
  <strong>{brief.closingRisk.trackingLabel}</strong>
  <span>
    {[brief.closingRisk.ageLabel, brief.closingRisk.occurrenceLabel].filter(Boolean).join(" · ") || "추적 정보 없음"}
  </span>
</div>
```

- [ ] **Step 6: Update route test fixture**

In `admin-today-route.test.tsx`, add tracking fields to the seeded closing risk item:

```ts
ageDays: 3,
occurrenceCount: 2,
ledgerState: "ACTIVE",
firstDetectedAt: "2026-06-18T00:00:00Z",
lastSeenAt: "2026-06-21T00:00:00Z",
resolvedAt: null,
```

Add assertions:

```ts
expect(screen.getAllByText("3일째 차단").length).toBeGreaterThan(0);
expect(screen.getAllByText("반복 2회").length).toBeGreaterThan(0);
```

- [ ] **Step 7: Run frontend model and route tests**

Run:

```bash
pnpm --dir front test -- platform-admin-workbench-model admin-today-route
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-domain-types.ts \
  front/features/platform-admin/model/platform-admin-workbench-model.ts \
  front/features/platform-admin/model/platform-admin-workbench-model.test.ts \
  front/features/platform-admin/route/admin-today-route.test.tsx \
  front/features/platform-admin/ui/admin-selected-brief.tsx
git commit -m "feat(front): show closing risk aging in admin today"
```

---

### Task 4: Club Detail Active and Resolved Risk UI

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-club-operations-model.ts`
- Modify: `front/features/platform-admin/ui/admin-club-operations-page.tsx`
- Modify: `front/features/platform-admin/ui/admin-club-operations-page.test.tsx`

**Interfaces:**
- Consumes `AdminClubClosingRisks.recentlyResolvedItems` and tracking fields from Task 2.
- Produces active-row metadata and a compact `최근 해소됨` section.

- [ ] **Step 1: Extend club operations types and helpers**

Modify `AdminClubClosingRisks` and `AdminClubClosingRiskItem`:

```ts
export type AdminClubClosingRisks = {
  incompleteCount: number;
  blockedCount: number;
  readyCount: number;
  items: AdminClubClosingRiskItem[];
  recentlyResolvedItems?: AdminClubClosingRiskItem[];
  trackingUnavailable?: boolean;
};

export type AdminClubClosingRiskItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  meetingDate: string;
  overallState: string;
  primaryBlocker: string | null;
  hostClosingHref: string;
  firstDetectedAt?: string | null;
  lastSeenAt?: string | null;
  resolvedAt?: string | null;
  ageDays?: number | null;
  occurrenceCount?: number;
  ledgerState?: "ACTIVE" | "RESOLVED" | "UNTRACKED" | (string & {});
};
```

Add helpers:

```ts
export function closingRiskAgeLabel(item: AdminClubClosingRiskItem): string | null {
  if (typeof item.ageDays !== "number") return null;
  const days = Math.max(0, Math.floor(item.ageDays));
  if (item.overallState === "BLOCKED") return `${days}일째 차단`;
  if (item.overallState === "IN_PROGRESS") return `${days}일째 진행 중`;
  if (item.overallState === "READY") return `${days}일째 조치 대기`;
  return `${days}일째 확인 필요`;
}

export function closingRiskOccurrenceLabel(item: AdminClubClosingRiskItem): string | null {
  const count = item.occurrenceCount ?? 0;
  return count > 1 ? `반복 ${count}회` : null;
}

export function closingRiskTrackingLabel(item: AdminClubClosingRiskItem): string {
  if (item.ledgerState === "ACTIVE") return "추적 중";
  if (item.ledgerState === "RESOLVED") return "해소됨";
  return "추적 상태 확인 불가";
}
```

- [ ] **Step 2: Add failing UI test**

Append to `admin-club-operations-page.test.tsx`:

```tsx
it("shows active aging metadata and recently resolved closing risks", () => {
  render(
    <MemoryRouter>
      <AdminClubOperationsPage
        snapshot={{
          ...snapshot,
          closingRisks: {
            incompleteCount: 1,
            blockedCount: 1,
            readyCount: 0,
            trackingUnavailable: false,
            items: [{
              sessionId: "session-7",
              sessionNumber: 7,
              bookTitle: "페인트",
              meetingDate: "2026-06-18",
              overallState: "BLOCKED",
              primaryBlocker: "FEEDBACK_DOCUMENT_INVALID",
              hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-7/closing",
              ageDays: 3,
              occurrenceCount: 2,
              ledgerState: "ACTIVE",
            }],
            recentlyResolvedItems: [{
              sessionId: "session-6",
              sessionNumber: 6,
              bookTitle: "이전 책",
              meetingDate: "2026-06-11",
              overallState: "RESOLVED",
              primaryBlocker: "RECORD_PACKAGE_REQUIRED",
              hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-6/closing",
              resolvedAt: "2026-06-21T00:00:00Z",
              occurrenceCount: 1,
              ledgerState: "RESOLVED",
            }],
          },
        }}
        supportGrantCount={0}
      />
    </MemoryRouter>,
  );

  expect(screen.getByText("3일째 차단")).toBeInTheDocument();
  expect(screen.getByText("반복 2회")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "최근 해소됨" })).toBeInTheDocument();
  expect(screen.getByText("No.06 · 이전 책")).toBeInTheDocument();
  expect(screen.getByText("해소됨")).toBeInTheDocument();
});
```

- [ ] **Step 3: Run UI test and verify failure**

Run:

```bash
pnpm --dir front test -- admin-club-operations-page
```

Expected: FAIL because the page does not render aging/resolved metadata yet.

- [ ] **Step 4: Update `ClosingRiskRow` and add resolved section**

In `admin-club-operations-page.tsx`, import the new helpers:

```ts
import {
  aiFailureDelta,
  blockerNextAction,
  closingRiskAgeLabel,
  closingRiskBlockerLabel,
  closingRiskOccurrenceLabel,
  closingRiskOverflowCount,
  closingRiskStateLabel,
  closingRiskTrackingLabel,
  notificationFailureDelta,
  type AdminClubClosingRiskItem,
  type AdminClubOperationsSnapshot,
} from "@/features/platform-admin/model/platform-admin-club-operations-model";
```

Inside `ClosingRiskPanel`, add:

```tsx
{closingRisks?.trackingUnavailable ? (
  <p className="tiny muted">추적 상태 확인 불가</p>
) : null}
```

After the active list, add:

```tsx
{(closingRisks?.recentlyResolvedItems?.length ?? 0) > 0 ? (
  <section className="admin-club-operations__closing-risk-resolved" aria-labelledby="admin-club-closing-risk-resolved-title">
    <h5 id="admin-club-closing-risk-resolved-title" className="h6 editorial">
      최근 해소됨
    </h5>
    <div className="admin-club-operations__closing-risk-list">
      {closingRisks?.recentlyResolvedItems?.slice(0, 5).map((item) => (
        <ClosingRiskRow key={`resolved-${item.sessionId}`} item={item} />
      ))}
    </div>
  </section>
) : null}
```

In `ClosingRiskRow`, add labels:

```tsx
const ageLabel = closingRiskAgeLabel(item);
const occurrenceLabel = closingRiskOccurrenceLabel(item);
const trackingLabel = closingRiskTrackingLabel(item);
```

Render them before the link:

```tsx
<span className="admin-club-operations__closing-risk-blocker">{trackingLabel}</span>
{ageLabel ? <span className="admin-club-operations__closing-risk-blocker">{ageLabel}</span> : null}
{occurrenceLabel ? <span className="admin-club-operations__closing-risk-blocker">{occurrenceLabel}</span> : null}
```

- [ ] **Step 5: Run club detail tests**

Run:

```bash
pnpm --dir front test -- admin-club-operations-page platform-admin-club-operations-model
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add front/features/platform-admin/model/platform-admin-club-operations-model.ts \
  front/features/platform-admin/ui/admin-club-operations-page.tsx \
  front/features/platform-admin/ui/admin-club-operations-page.test.tsx
git commit -m "feat(front): show closing risk resolution on club detail"
```

---

### Task 5: E2E, Docs, and Release Readiness

**Files:**
- Modify: `front/tests/e2e/admin-today-closing-risks.spec.ts`
- Modify: `CHANGELOG.md`
- Modify: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes implementation from Tasks 1-4.
- Produces public-safe proof and release notes.

- [ ] **Step 1: Update the E2E assertion**

In `front/tests/e2e/admin-today-closing-risks.spec.ts`, update the mocked `/api/admin/today/closing-risks` response item to include:

```ts
firstDetectedAt: "2026-06-18T00:00:00Z",
lastSeenAt: "2026-06-21T00:00:00Z",
resolvedAt: null,
ageDays: 3,
occurrenceCount: 2,
ledgerState: "ACTIVE",
```

Add assertions near the existing row/link checks:

```ts
await expect(page.getByText("3일째 차단")).toBeVisible();
await expect(page.getByText("반복 2회")).toBeVisible();
await expect(page.getByRole("link", { name: "호스트 클로징 보드" })).toHaveAttribute(
  "href",
  "/clubs/admin-risk-club/app/host/sessions/admin-risk-session/closing",
);
await expect(page.getByText("PRIVATE_PROVIDER_STACK_TRACE_TOKEN_123")).toHaveCount(0);
```

- [ ] **Step 2: Run targeted E2E**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-today-closing-risks.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Update CHANGELOG**

Add under `## Unreleased` / `### Changed`:

```markdown
- **closing risk aging ledger:** platform-admin closing risks now carry durable first-detected, last-seen, occurrence, and resolved tracking so `/admin/today` can show how long a host-owned closing issue has been open. The new ledger is additive, stores only admin-safe session-level metadata, and does not add platform-admin session-content mutations or auth/BFF token changes.
```

- [ ] **Step 4: Run full verification**

Run:

```bash
git diff --check HEAD~5..HEAD
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
./server/gradlew -p server clean test
./server/gradlew -p server check
./server/gradlew -p server architectureTest
pnpm --dir front test:e2e -- tests/e2e/admin-today-closing-risks.spec.ts
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: all commands PASS. If `clean test` is skipped by Gradle task configuration, record the skip exactly and rely on `check`/`architectureTest`/targeted integration results as evidence.

- [ ] **Step 5: Update release readiness notes with actual results**

Append to `docs/development/release-readiness-review.md` after full verification succeeds. If any command was skipped, replace the verification sentence with the exact skipped command and reason before committing.

```markdown
## 2026-06-21 Closing risk aging ledger readiness

- Scope reviewed: local `main..HEAD` for the closing risk aging ledger branch.
- Release classification: additive DB migration plus additive server/frontend platform-admin contract. No auth/BFF token change, deploy script change, public guest surface change, or platform-admin session-content mutation was added.
- Public-safety evidence: `admin_closing_risk_ledger` stores only club id, session id, safe state/blocker enums, timestamps, occurrence count, and canonical host closing href. It does not store raw member data, feedback body, generated JSON, transcript, provider raw error, private domain, deployment identifier, secret, or token-shaped value.
- Verification: `git diff --check HEAD~5..HEAD`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `./server/gradlew -p server clean test`, `./server/gradlew -p server check`, `./server/gradlew -p server architectureTest`, `pnpm --dir front test:e2e -- tests/e2e/admin-today-closing-risks.spec.ts`, `./scripts/build-public-release-candidate.sh`, and `./scripts/public-release-check.sh .tmp/public-release-candidate` passed.
- Residual risk: production tag/deploy smoke remains outside this local branch.
```

- [ ] **Step 6: Commit**

```bash
git add front/tests/e2e/admin-today-closing-risks.spec.ts CHANGELOG.md docs/development/release-readiness-review.md
git commit -m "docs: record closing risk ledger readiness"
```

---

## Self-Review

- Spec coverage: Tasks 1-2 cover durable ledger, state transition, API fields, and safe fallback. Tasks 3-4 cover `/admin/today` and `/admin/clubs/:clubId` UI. Task 5 covers E2E, CHANGELOG, release-readiness, and public-safety evidence.
- Placeholder scan: no unfinished placeholder markers remain.
- Type consistency: server fields are `firstDetectedAt`, `lastSeenAt`, `resolvedAt`, `ageDays`, `occurrenceCount`, `ledgerState`, `trackingUnavailable`; frontend uses the same camelCase names.
