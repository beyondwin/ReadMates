# ReadMates Admin Today Closing Risk Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/today` surface admin-safe session closing risks and make the linked host closing board actions clearer in Korean.

**Architecture:** Add a read-only platform-admin closing-risk queue projection under the existing club operations read surface, then consume it from the platform-admin Today route through feature-owned API/query/model modules. Keep all session repair actions host-owned; platform admin receives links and safe metadata only.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Vite 8, Vitest, Playwright, Kotlin/Spring Boot, JdbcTemplate, MySQL/Flyway, Gradle.

## Global Constraints

- Follow `docs/agents/front.md` for work under `front/`.
- Follow `docs/agents/server.md` for work under `server/`.
- Follow `docs/agents/design.md` for UI, layout, copy, and visual polish.
- Follow `docs/agents/docs.md` for CHANGELOG, release-readiness notes, and public-safe docs.
- Implement the approved spec: `docs/superpowers/specs/2026-06-20-readmates-admin-today-closing-risk-recovery-design.md`.
- New server schema string: `"admin.today_closing_risks.v1"`.
- New endpoint: `GET /api/admin/today/closing-risks`.
- Do not add a DB migration.
- Do not add platform-admin mutations for session content, publication, feedback document text, notification send, or AI commit.
- Do not expose raw member data, feedback body, generated JSON, transcript, provider raw error, email body, private domain, deployment identifier, secret, token-shaped example, or local absolute path in UI, fixtures, or docs.
- Use canonical host closing hrefs: `/clubs/:slug/app/host/sessions/:sessionId/closing`.
- Global closing-risk queue limit is 25 items.
- Unknown state or blocker codes must render as safe `확인 필요` copy, not raw internal codes.
- Required `/admin/today` data remains summary/clubs. Closing-risk fetch failure creates a partial-error queue item and must not blank the whole workbench.

---

## File Structure

- Modify `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`: add today closing risk response models next to the existing admin club operations models.
- Modify `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`: add `ListAdminTodayClosingRisksUseCase`.
- Modify `server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsSnapshotPort.kt`: add `loadTodayClosingRisks(limit: Int): AdminTodayClosingRiskSnapshot`.
- Modify `server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt`: implement the new use case without adding mutation behavior.
- Modify `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt`: add `GET /api/admin/today/closing-risks`.
- Modify `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`: add global closing-risk queue SQL and mapping.
- Modify `server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubOperationsControllerTest.kt`: cover auth, schema, and public-safe body for the new endpoint.
- Create `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminTodayClosingRiskTest.kt`: cover global ordering, limit, href, and safe fields.
- Modify `front/features/platform-admin/model/platform-admin-domain-types.ts`: add frontend response/input types for today closing risks.
- Modify `front/features/platform-admin/api/platform-admin-contracts.ts`: export the new types.
- Modify `front/features/platform-admin/api/platform-admin-api.ts`: add `fetchPlatformAdminTodayClosingRisks()`.
- Modify `front/features/platform-admin/queries/platform-admin-queries.ts`: add query key and query options for today closing risks.
- Modify `front/features/platform-admin/route/admin-today-data.ts`: prefetch closing risks as optional data.
- Modify `front/features/platform-admin/route/admin-today-route.tsx`: read the new query and pass success/error state into the workbench model.
- Modify `front/features/platform-admin/model/platform-admin-workbench-model.ts`: add `closing-risk` queue items, selected brief union, safe labels, and partial-error behavior.
- Modify `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`: cover ordering, selected brief, safe fallback labels, and partial failure.
- Modify `front/features/platform-admin/ui/admin-selected-brief.tsx`: render closing-risk selected brief variant without club-only assumptions.
- Modify `front/features/platform-admin/ui/admin-work-queue.tsx`: no structural change expected; only adjust tests if row text composition requires it.
- Modify `front/features/platform-admin/route/admin-today-route.test.tsx`: cover closing-risk rendering and partial-error rendering from seeded query data.
- Modify `front/features/host/model/session-closing-model.ts`: replace English/generic action labels with Korean repair labels.
- Modify `front/features/host/model/session-closing-model.test.ts`: cover all primary action labels and safe evidence labels.
- Modify `front/features/host/ui/session-closing-board.test.tsx`: update expected button text.
- Create `front/tests/e2e/admin-today-closing-risks.spec.ts`: verify `/admin/today` shows a safe closing-risk row and links to host closing board.
- Modify `CHANGELOG.md`: add an `Unreleased` entry after implementation.
- Modify `docs/development/release-readiness-review.md`: add closeout evidence after verification.

---

### Task 1: Server Today Closing Risk Projection

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsSnapshotPort.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubOperationsControllerTest.kt`
- Create: `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminTodayClosingRiskTest.kt`

**Interfaces:**
- Consumes: existing `AdminClubOperationsSnapshotPort.loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot?`
- Produces:
  - `data class AdminTodayClosingRiskSnapshot(val schema: String = "admin.today_closing_risks.v1", val generatedAt: OffsetDateTime, val items: List<AdminTodayClosingRiskItem>)`
  - `data class AdminTodayClosingRiskItem(val clubId: UUID, val clubSlug: String, val clubName: String, val sessionId: UUID, val sessionNumber: Int, val bookTitle: String, val meetingDate: LocalDate, val overallState: String, val primaryBlocker: String?, val hostClosingHref: String)`
  - `interface ListAdminTodayClosingRisksUseCase { fun todayClosingRisks(admin: CurrentPlatformAdmin): AdminTodayClosingRiskSnapshot }`
  - `GET /api/admin/today/closing-risks`

- [ ] **Step 1: Write the controller test first**

Append these tests to `server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubOperationsControllerTest.kt`:

```kotlin
@Test
fun `owner can read admin-safe today closing risk queue`() {
    val body =
        mockMvc
            .get("/api/admin/today/closing-risks") {
                cookie(sessionCookieForUser(OWNER_USER_ID))
            }.andExpect {
                status { isOk() }
                jsonPath("$.schema") { value("admin.today_closing_risks.v1") }
                jsonPath("$.generatedAt") { exists() }
                jsonPath("$.items") { exists() }
            }.andReturn()
            .response
            .contentAsString

    assertThat(body).doesNotContain("@example.com")
    assertThat(body.lowercase()).doesNotContain("review body")
    assertThat(body.lowercase()).doesNotContain("note body")
    assertThat(body.lowercase()).doesNotContain("source_text")
    assertThat(body.lowercase()).doesNotContain("provider")
}

@Test
fun `anonymous cannot read today closing risk queue`() {
    mockMvc
        .get("/api/admin/today/closing-risks")
        .andExpect {
            status { isUnauthorized() }
        }
}
```

- [ ] **Step 2: Write the persistence test first**

Create `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminTodayClosingRiskTest.kt`:

```kotlin
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

private const val TODAY_CLUB_ID = "00000000-0000-0000-0000-0000000fd001"
private const val TODAY_USER_ID = "00000000-0000-0000-0000-0000000fd002"
private const val TODAY_MEMBERSHIP_ID = "00000000-0000-0000-0000-0000000fd003"
private const val TODAY_BLOCKED_SESSION_ID = "00000000-0000-0000-0000-0000000fd101"
private const val TODAY_READY_SESSION_ID = "00000000-0000-0000-0000-0000000fd102"

private const val TODAY_CLEANUP_SQL = """
    delete from notification_event_outbox where club_id = '$TODAY_CLUB_ID';
    delete from session_feedback_documents where club_id = '$TODAY_CLUB_ID';
    delete from public_session_publications where club_id = '$TODAY_CLUB_ID';
    delete from one_line_reviews where club_id = '$TODAY_CLUB_ID';
    delete from highlights where club_id = '$TODAY_CLUB_ID';
    delete from sessions where club_id = '$TODAY_CLUB_ID';
    delete from memberships where id = '$TODAY_MEMBERSHIP_ID';
    delete from users where id = '$TODAY_USER_ID';
    delete from clubs where id = '$TODAY_CLUB_ID';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [TODAY_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [TODAY_CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminTodayClosingRiskTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcAdminClubOperationsAdapter(jdbcTemplate, Clock.systemUTC()) }

    @Test
    fun `loads global today closing risks in severity order with host links`() {
        seedClub()
        insertSession(TODAY_BLOCKED_SESSION_ID, 3, "Blocked Book", "CLOSED", daysAgo = 1)
        insertSession(TODAY_READY_SESSION_ID, 4, "Ready Book", "CLOSED", daysAgo = 0)
        insertPublication(TODAY_READY_SESSION_ID, visible = false)
        insertFeedbackDocument(TODAY_READY_SESSION_ID)

        val snapshot = adapter.loadTodayClosingRisks(limit = 25)

        assertThat(snapshot.schema).isEqualTo("admin.today_closing_risks.v1")
        assertThat(snapshot.items.map { it.sessionId.toString() })
            .containsSubsequence(TODAY_READY_SESSION_ID, TODAY_BLOCKED_SESSION_ID)
        val ready = snapshot.items.first { it.sessionId.toString() == TODAY_READY_SESSION_ID }
        assertThat(ready.clubSlug).isEqualTo("today-closing-risk-club")
        assertThat(ready.clubName).isEqualTo("Today Closing Risk Club")
        assertThat(ready.overallState).isEqualTo("READY")
        assertThat(ready.primaryBlocker).isEqualTo("MEMBER_NOTIFICATION_REQUIRED")
        assertThat(ready.hostClosingHref)
            .isEqualTo("/clubs/today-closing-risk-club/app/host/sessions/$TODAY_READY_SESSION_ID/closing")
    }

    @Test
    fun `applies global limit`() {
        seedClub()
        insertSession(TODAY_BLOCKED_SESSION_ID, 3, "Blocked Book", "CLOSED", daysAgo = 1)
        insertSession(TODAY_READY_SESSION_ID, 4, "Ready Book", "CLOSED", daysAgo = 0)

        val snapshot = adapter.loadTodayClosingRisks(limit = 1)

        assertThat(snapshot.items).hasSize(1)
    }

    private fun seedClub() {
        jdbcTemplate.update(
            """
            insert into clubs (id, slug, name, tagline, about, status, public_visibility)
            values (?, 'today-closing-risk-club', 'Today Closing Risk Club', '', '', 'ACTIVE', 'PUBLIC')
            """.trimIndent(),
            TODAY_CLUB_ID,
        )
        jdbcTemplate.update(
            "insert into users (id, email, name) values (?, 'today-closing-risk-owner@example.test', 'Owner')",
            TODAY_USER_ID,
        )
        jdbcTemplate.update(
            """
            insert into memberships (id, club_id, user_id, role, status, display_name)
            values (?, ?, ?, 'HOST', 'ACTIVE', 'Owner')
            """.trimIndent(),
            TODAY_MEMBERSHIP_ID,
            TODAY_CLUB_ID,
            TODAY_USER_ID,
        )
    }

    private fun insertSession(
        sessionId: String,
        number: Int,
        bookTitle: String,
        state: String,
        daysAgo: Int,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (id, club_id, number, book_title, author, session_date, state, visibility)
            values (?, ?, ?, ?, 'Author', date_sub(current_date(), interval ? day), ?, 'PUBLIC')
            """.trimIndent(),
            sessionId,
            TODAY_CLUB_ID,
            number,
            bookTitle,
            daysAgo,
            state,
        )
    }

    private fun insertPublication(sessionId: String, visible: Boolean) {
        jdbcTemplate.update(
            """
            insert into public_session_publications (club_id, session_id, public_summary, visibility, is_public, published_at)
            values (?, ?, 'safe summary', 'PUBLIC', ?, utc_timestamp(6))
            """.trimIndent(),
            TODAY_CLUB_ID,
            sessionId,
            visible,
        )
    }

    private fun insertFeedbackDocument(sessionId: String) {
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (club_id, session_id, version, source_text, created_at)
            values (?, ?, 1, '# safe feedback', utc_timestamp(6))
            """.trimIndent(),
            TODAY_CLUB_ID,
            sessionId,
        )
    }
}
```

If column names in the local schema differ, adjust only the fixture inserts after reading the existing `JdbcAdminClubOperationsClosingRiskTest.kt`; keep the assertions and public-safety intent intact.

- [ ] **Step 3: Run the server tests and verify they fail**

Run:

```bash
./server/gradlew -p server integrationTest --tests PlatformAdminClubOperationsControllerTest --tests JdbcAdminTodayClosingRiskTest
```

Expected before implementation: compilation fails for missing `loadTodayClosingRisks`, missing model classes, or missing endpoint.

- [ ] **Step 4: Add application models**

Modify `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt` by adding:

```kotlin
data class AdminTodayClosingRiskSnapshot(
    val schema: String = "admin.today_closing_risks.v1",
    val generatedAt: OffsetDateTime,
    val items: List<AdminTodayClosingRiskItem>,
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
)
```

No new imports are needed because `LocalDate`, `OffsetDateTime`, and `UUID` are already imported in this file.

- [ ] **Step 5: Add ports and use case**

Modify `server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt`:

```kotlin
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
```

Add below `GetAdminClubOperationsUseCase`:

```kotlin
interface ListAdminTodayClosingRisksUseCase {
    fun todayClosingRisks(admin: CurrentPlatformAdmin): AdminTodayClosingRiskSnapshot
}
```

Modify `server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsSnapshotPort.kt`:

```kotlin
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot

interface AdminClubOperationsSnapshotPort {
    fun loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot?

    fun loadTodayClosingRisks(limit: Int): AdminTodayClosingRiskSnapshot
}
```

- [ ] **Step 6: Implement the service use case**

Modify `server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt`:

```kotlin
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import com.readmates.club.application.port.`in`.ListAdminTodayClosingRisksUseCase
```

Change class declaration:

```kotlin
class AdminClubOperationsService(
    private val snapshotPort: AdminClubOperationsSnapshotPort,
) : GetAdminClubOperationsUseCase,
    ListAdminTodayClosingRisksUseCase {
```

Add:

```kotlin
override fun todayClosingRisks(admin: CurrentPlatformAdmin): AdminTodayClosingRiskSnapshot =
    snapshotPort.loadTodayClosingRisks(TODAY_CLOSING_RISK_LIMIT)

private companion object {
    private const val TODAY_CLOSING_RISK_LIMIT = 25
}
```

Do not add `@Transactional`; this is a read-only projection.

- [ ] **Step 7: Add the controller route**

Modify `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt` imports:

```kotlin
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
import com.readmates.club.application.port.`in`.ListAdminTodayClosingRisksUseCase
```

Change constructor:

```kotlin
class PlatformAdminClubOperationsController(
    private val getAdminClubOperationsUseCase: GetAdminClubOperationsUseCase,
    private val listAdminTodayClosingRisksUseCase: ListAdminTodayClosingRisksUseCase,
) {
```

Add a second controller class in the same file. Keep the existing `/api/admin/clubs/{clubId}/operations` controller unchanged:

```kotlin
@RestController
@RequestMapping("/api/admin/today")
class PlatformAdminTodayClosingRiskController(
    private val listAdminTodayClosingRisksUseCase: ListAdminTodayClosingRisksUseCase,
) {
    @GetMapping("/closing-risks")
    fun todayClosingRisks(admin: CurrentPlatformAdmin): AdminTodayClosingRiskSnapshot =
        listAdminTodayClosingRisksUseCase.todayClosingRisks(admin)
}
```

Use the second form as the preferred final code if it is clearer; keep the existing `/api/admin/clubs/{clubId}/operations` controller unchanged.

- [ ] **Step 8: Implement persistence projection**

Modify `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt` imports:

```kotlin
import com.readmates.club.application.model.AdminTodayClosingRiskItem
import com.readmates.club.application.model.AdminTodayClosingRiskSnapshot
```

Add to the adapter:

```kotlin
override fun loadTodayClosingRisks(limit: Int): AdminTodayClosingRiskSnapshot =
    AdminTodayClosingRiskSnapshot(
        generatedAt = OffsetDateTime.now(clock),
        items = todayClosingRiskCandidates(limit),
    )

private fun todayClosingRiskCandidates(limit: Int): List<AdminTodayClosingRiskItem> =
    jdbcTemplate.query(
        """
        select *
        from (
          select
            clubs.id as club_id,
            clubs.slug as club_slug,
            clubs.name as club_name,
            sessions.id as session_id,
            sessions.number as session_number,
            sessions.book_title,
            sessions.session_date,
            sessions.state,
            public_session_publications.public_summary,
            public_session_publications.is_public,
            public_session_publications.visibility as publication_visibility,
            (
              select count(*)
              from highlights
              where highlights.club_id = sessions.club_id
                and highlights.session_id = sessions.id
            ) as highlight_count,
            (
              select count(*)
              from one_line_reviews
              where one_line_reviews.club_id = sessions.club_id
                and one_line_reviews.session_id = sessions.id
            ) as one_liner_count,
            (
              select session_feedback_documents.source_text
              from session_feedback_documents
              where session_feedback_documents.club_id = sessions.club_id
                and session_feedback_documents.session_id = sessions.id
              order by session_feedback_documents.version desc, session_feedback_documents.created_at desc
              limit 1
            ) as feedback_source_text,
            (
              select notification_event_outbox.status
              from notification_event_outbox
              where notification_event_outbox.club_id = sessions.club_id
                and notification_event_outbox.aggregate_id = sessions.id
                and notification_event_outbox.event_type in ('FEEDBACK_DOCUMENT_PUBLISHED', 'NEXT_BOOK_PUBLISHED')
              order by notification_event_outbox.created_at desc, notification_event_outbox.id desc
              limit 1
            ) as latest_notification_status
          from sessions
          join clubs on clubs.id = sessions.club_id
          left join public_session_publications
            on public_session_publications.club_id = sessions.club_id
           and public_session_publications.session_id = sessions.id
          where clubs.status = 'ACTIVE'
            and sessions.state in ('CLOSED', 'PUBLISHED')
          order by sessions.session_date desc, sessions.number desc
          limit 200
        ) candidates
        """.trimIndent(),
    ) { rs, _ -> rs.toTodayClosingRiskCandidate() }
        .mapNotNull { it }
        .sortedWith(compareBy<AdminTodayClosingRiskItem> { todayClosingRiskRank(it.overallState) }
            .thenByDescending { it.meetingDate }
            .thenByDescending { it.sessionNumber })
        .take(limit.coerceAtLeast(0))
```

Add mapper helpers:

```kotlin
private fun ResultSet.toTodayClosingRiskCandidate(): AdminTodayClosingRiskItem? {
    val state = getString("state")
    val summary = getString("public_summary")
    val isPublic = getBoolean("is_public")
    val publicationVisible = getString("publication_visibility") == "PUBLIC"
    val highlightCount = getInt("highlight_count")
    val oneLinerCount = getInt("one_liner_count")
    val feedback = getString("feedback_source_text")
    val latestNotificationStatus = getString("latest_notification_status")
    val blocker =
        closingRiskBlocker(
            sessionState = state,
            hasRecordPackage = !summary.isNullOrBlank() || highlightCount > 0 || oneLinerCount > 0,
            hasFeedback = !feedback.isNullOrBlank(),
            hasMemberNotification = latestNotificationStatus == "PUBLISHED",
            hasPublicRecord = isPublic && publicationVisible,
        )
    val overall = closingRiskOverallState(blocker)
    if (overall == "PUBLISHED") return null
    return AdminTodayClosingRiskItem(
        clubId = uuid("club_id"),
        clubSlug = getString("club_slug"),
        clubName = getString("club_name"),
        sessionId = uuid("session_id"),
        sessionNumber = getInt("session_number"),
        bookTitle = getString("book_title"),
        meetingDate = getObject("session_date", LocalDate::class.java),
        overallState = overall,
        primaryBlocker = blocker,
        hostClosingHref = "/clubs/${getString("club_slug")}/app/host/sessions/${uuid("session_id")}/closing",
    )
}

private fun closingRiskBlocker(
    sessionState: String,
    hasRecordPackage: Boolean,
    hasFeedback: Boolean,
    hasMemberNotification: Boolean,
    hasPublicRecord: Boolean,
): String? {
    if (sessionState != "CLOSED" && sessionState != "PUBLISHED") return "SESSION_CLOSE_REQUIRED"
    if (!hasRecordPackage) return "RECORD_PACKAGE_REQUIRED"
    if (!hasFeedback) return "FEEDBACK_DOCUMENT_REQUIRED"
    if (!hasMemberNotification) return "MEMBER_NOTIFICATION_REQUIRED"
    if (!hasPublicRecord) return "PUBLIC_RECORD_REQUIRED"
    return null
}

private fun closingRiskOverallState(blocker: String?): String =
    when (blocker) {
        null -> "PUBLISHED"
        "RECORD_PACKAGE_REQUIRED", "FEEDBACK_DOCUMENT_REQUIRED" -> "IN_PROGRESS"
        "MEMBER_NOTIFICATION_REQUIRED", "PUBLIC_RECORD_REQUIRED" -> "READY"
        else -> "BLOCKED"
    }

private fun todayClosingRiskRank(state: String): Int =
    when (state) {
        "BLOCKED" -> 0
        "IN_PROGRESS" -> 1
        "READY" -> 2
        else -> 3
    }
```

If equivalent helper functions already exist in the adapter from the previous closing projection, reuse them instead of duplicating logic. Preserve the same externally visible state/blocker values.

- [ ] **Step 9: Run focused server tests**

Run:

```bash
./server/gradlew -p server integrationTest --tests PlatformAdminClubOperationsControllerTest --tests JdbcAdminTodayClosingRiskTest
```

Expected: both focused integration test classes pass.

- [ ] **Step 10: Run architecture guard**

Run:

```bash
./server/gradlew -p server architectureTest
```

Expected: pass. If it fails because the new use case is not registered in an architecture allowlist, update the slice registry rather than weakening the rule.

- [ ] **Step 11: Commit Task 1**

```bash
git add server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt \
  server/src/main/kotlin/com/readmates/club/application/port/in/PlatformAdminUseCases.kt \
  server/src/main/kotlin/com/readmates/club/application/port/out/AdminClubOperationsSnapshotPort.kt \
  server/src/main/kotlin/com/readmates/club/application/service/AdminClubOperationsService.kt \
  server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt \
  server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt \
  server/src/test/kotlin/com/readmates/club/api/PlatformAdminClubOperationsControllerTest.kt \
  server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminTodayClosingRiskTest.kt
git commit -m "feat(server): expose admin today closing risks"
```

---

### Task 2: Frontend Contract, Query, and Loader Prefetch

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-domain-types.ts`
- Modify: `front/features/platform-admin/api/platform-admin-contracts.ts`
- Modify: `front/features/platform-admin/api/platform-admin-api.ts`
- Modify: `front/features/platform-admin/queries/platform-admin-queries.ts`
- Modify: `front/features/platform-admin/route/admin-today-data.ts`
- Modify: `front/features/platform-admin/route/admin-today-route.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/today/closing-risks`
- Produces:
  - `PlatformAdminTodayClosingRisksResponse`
  - `fetchPlatformAdminTodayClosingRisks(): Promise<PlatformAdminTodayClosingRisksResponse>`
  - `platformAdminTodayClosingRisksQuery()`
  - `PlatformAdminWorkbenchInput.closingRisks` and `closingRisksUnavailable` populated by the route

- [ ] **Step 1: Add frontend response types**

Modify `front/features/platform-admin/model/platform-admin-domain-types.ts`:

```ts
export type PlatformAdminTodayClosingRiskItem = {
  clubId: string;
  clubSlug: string;
  clubName: string;
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  meetingDate: string;
  overallState: string;
  primaryBlocker: string | null;
  hostClosingHref: string;
};

export type PlatformAdminTodayClosingRisksResponse = {
  schema: "admin.today_closing_risks.v1";
  generatedAt: string;
  items: PlatformAdminTodayClosingRiskItem[];
};
```

Modify `front/features/platform-admin/api/platform-admin-contracts.ts` export list:

```ts
export type {
  PlatformAdminTodayClosingRiskItem,
  PlatformAdminTodayClosingRisksResponse,
  // keep existing exports
} from "@/features/platform-admin/model/platform-admin-domain-types";
```

- [ ] **Step 2: Add API function**

Modify imports in `front/features/platform-admin/api/platform-admin-api.ts`:

```ts
import type {
  PlatformAdminTodayClosingRisksResponse,
  // keep existing imports
} from "@/features/platform-admin/api/platform-admin-contracts";
```

Add:

```ts
export function fetchPlatformAdminTodayClosingRisks() {
  return readmatesFetch<PlatformAdminTodayClosingRisksResponse>(
    "/api/admin/today/closing-risks",
    undefined,
    { clubSlug: undefined },
  );
}
```

- [ ] **Step 3: Add query key and query options**

Modify `front/features/platform-admin/queries/platform-admin-queries.ts` imports:

```ts
import {
  fetchPlatformAdminTodayClosingRisks,
  // keep existing imports
} from "@/features/platform-admin/api/platform-admin-api";
```

Extend `platformAdminKeys`:

```ts
todayClosingRisks: () => [...platformAdminKeys.all, "today-closing-risks"] as const,
```

Add:

```ts
export function platformAdminTodayClosingRisksQuery() {
  return queryOptions({
    queryKey: platformAdminKeys.todayClosingRisks(),
    queryFn: fetchPlatformAdminTodayClosingRisks,
  });
}
```

- [ ] **Step 4: Prefetch optional closing risks in loader**

Modify `front/features/platform-admin/route/admin-today-data.ts` imports:

```ts
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
  platformAdminTodayClosingRisksQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
```

Add helper:

```ts
const emptyClosingRisks = {
  schema: "admin.today_closing_risks.v1" as const,
  generatedAt: new Date(0).toISOString(),
  items: [],
};

async function loadOptionalClosingRisks(queryClient: QueryClient) {
  const query = platformAdminTodayClosingRisksQuery();
  try {
    await queryClient.fetchQuery(query);
  } catch (error) {
    if (!(error instanceof ReadmatesApiError)) {
      throw error;
    }
    queryClient.setQueryData(query.queryKey, emptyClosingRisks);
  }
}
```

Update `Promise.all`:

```ts
await Promise.all([
  queryClient.fetchQuery(platformAdminSummaryQuery()),
  queryClient.fetchQuery(platformAdminClubsQuery()),
  loadOptionalAiOps(queryClient),
  loadOptionalClosingRisks(queryClient),
]);
```

This loader fallback intentionally seeds an empty payload. The route still uses `query.isError` during client-side refetch failure.

- [ ] **Step 5: Read query in route and pass model input**

Modify `front/features/platform-admin/route/admin-today-route.tsx` imports:

```ts
import {
  platformAdminClubsQuery,
  platformAdminSummaryQuery,
  platformAdminTodayClosingRisksQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
```

Add:

```tsx
const closingRiskQuery = useQuery(platformAdminTodayClosingRisksQuery());
```

Add to `input`:

```ts
closingRisks: closingRiskQuery.data?.items ?? [],
closingRisksUnavailable: closingRiskQuery.isError,
```

- [ ] **Step 6: Add route test seed and failing assertions**

Modify `front/features/platform-admin/route/admin-today-route.test.tsx` imports:

```ts
import { platformAdminTodayClosingRisksQuery } from "@/features/platform-admin/queries/platform-admin-queries";
```

In `seededClient()`, add:

```ts
queryClient.setQueryData(platformAdminTodayClosingRisksQuery().queryKey, {
  schema: "admin.today_closing_risks.v1",
  generatedAt: "2026-06-20T00:00:00Z",
  items: [],
});
```

Add test:

```tsx
it("passes seeded closing risks into the today ledger", () => {
  const client = seededClient();
  client.setQueryData(platformAdminTodayClosingRisksQuery().queryKey, {
    schema: "admin.today_closing_risks.v1",
    generatedAt: "2026-06-20T00:00:00Z",
    items: [{
      clubId: "club-ready",
      clubSlug: "ready-club",
      clubName: "Ready Club",
      sessionId: "session-1",
      sessionNumber: 12,
      bookTitle: "모던 자바스크립트",
      meetingDate: "2026-06-20",
      overallState: "BLOCKED",
      primaryBlocker: "FEEDBACK_DOCUMENT_INVALID",
      hostClosingHref: "/clubs/ready-club/app/host/sessions/session-1/closing",
    }],
  });

  renderRoute(client, "/admin/today?selected=closing-risk-session-1");

  expect(screen.getByText(/모던 자바스크립트/)).toBeInTheDocument();
});
```

Expected now: this test fails until Task 3 adds model/UI support.

- [ ] **Step 7: Run frontend focused tests**

Run:

```bash
pnpm --dir front test -- admin-today-route
```

Expected after Task 2 only: existing tests pass; the new closing risk assertion may fail until Task 3. If using strict TDD, commit Task 2 before adding the failing assertion, then add the assertion in Task 3.

- [ ] **Step 8: Commit Task 2**

```bash
git add front/features/platform-admin/model/platform-admin-domain-types.ts \
  front/features/platform-admin/api/platform-admin-contracts.ts \
  front/features/platform-admin/api/platform-admin-api.ts \
  front/features/platform-admin/queries/platform-admin-queries.ts \
  front/features/platform-admin/route/admin-today-data.ts \
  front/features/platform-admin/route/admin-today-route.tsx \
  front/features/platform-admin/route/admin-today-route.test.tsx
git commit -m "feat(front): load admin today closing risks"
```

---

### Task 3: Workbench Queue, Selected Brief, and UI Rendering

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.ts`
- Modify: `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`
- Modify: `front/features/platform-admin/ui/admin-selected-brief.tsx`
- Modify: `front/features/platform-admin/route/admin-today-route.test.tsx`

**Interfaces:**
- Consumes: `PlatformAdminTodayClosingRiskItem[]` from Task 2
- Produces:
  - `WorkbenchQueueItemType` includes `"closing-risk"`
  - `PlatformAdminSelectedBrief` supports a closing-risk selected brief variant
  - safe label helpers for state/blocker

- [ ] **Step 1: Add failing model tests**

Append to `front/features/platform-admin/model/platform-admin-workbench-model.test.ts`:

```ts
describe("buildPlatformAdminWorkbench — closing risk queue", () => {
  it("adds closing risk items ahead of notification warnings and below publish blockers", () => {
    const result = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedItemId: "closing-risk-session-1",
      closingRisks: [{
        clubId: "club-ready",
        clubSlug: "ready-club",
        clubName: "Ready Club",
        sessionId: "session-1",
        sessionNumber: 12,
        bookTitle: "모던 자바스크립트",
        meetingDate: "2026-06-20",
        overallState: "BLOCKED",
        primaryBlocker: "FEEDBACK_DOCUMENT_INVALID",
        hostClosingHref: "/clubs/ready-club/app/host/sessions/session-1/closing",
      }],
      notificationSnapshot,
    });

    expect(result.queueItems.map((item) => item.id)).toContain("closing-risk-session-1");
    expect(result.queueItems.find((item) => item.id === "closing-risk-session-1")).toMatchObject({
      type: "closing-risk",
      severity: "critical",
      name: "Ready Club · No.12",
      slug: "ready-club",
      reason: "모던 자바스크립트 · 피드백 문서 다시 확인",
      primaryActionLabel: "호스트 클로징 보드",
      href: "/clubs/ready-club/app/host/sessions/session-1/closing",
    });
    expect(result.selectedBrief?.item.id).toBe("closing-risk-session-1");
    expect(result.selectedBrief?.primaryAction.href).toBe("/clubs/ready-club/app/host/sessions/session-1/closing");
  });

  it("uses safe fallback labels for unknown closing risk codes", () => {
    const result = buildPlatformAdminWorkbench({
      ...baseInput,
      selectedItemId: "closing-risk-session-unknown",
      closingRisks: [{
        clubId: "club-ready",
        clubSlug: "ready-club",
        clubName: "Ready Club",
        sessionId: "session-unknown",
        sessionNumber: 13,
        bookTitle: "Unknown Codes",
        meetingDate: "2026-06-20",
        overallState: "RAW_PRIVATE_STATE",
        primaryBlocker: "RAW_PRIVATE_BLOCKER",
        hostClosingHref: "/clubs/ready-club/app/host/sessions/session-unknown/closing",
      }],
    });

    const serialized = JSON.stringify(result);
    expect(serialized).toContain("확인 필요");
    expect(serialized).not.toContain("RAW_PRIVATE_STATE");
    expect(serialized).not.toContain("RAW_PRIVATE_BLOCKER");
  });

  it("adds a partial failure item when closing risk query cannot be read", () => {
    const result = buildPlatformAdminWorkbench({
      ...baseInput,
      closingRisksUnavailable: true,
    });

    expect(result.queueItems.find((item) => item.id === "partial-closing-risks")).toMatchObject({
      type: "partial-error",
      severity: "warn",
      primaryActionLabel: "클로징 확인 불가",
    });
  });
});
```

- [ ] **Step 2: Run model tests and verify they fail**

Run:

```bash
pnpm --dir front test -- platform-admin-workbench-model
```

Expected before implementation: TypeScript errors or assertions fail because `closingRisks` is not supported.

- [ ] **Step 3: Add model input and queue types**

Modify `front/features/platform-admin/model/platform-admin-workbench-model.ts`:

```ts
import type { PlatformAdminTodayClosingRiskItem } from "@/features/platform-admin/model/platform-admin-domain-types";
```

Extend input:

```ts
closingRisks?: ReadonlyArray<PlatformAdminTodayClosingRiskItem>;
closingRisksUnavailable?: boolean;
```

Change:

```ts
export type WorkbenchQueueItemType = "club" | "notification" | "ai" | "closing-risk" | "partial-error";
```

Add selected brief detail type:

```ts
export type PlatformAdminClosingRiskBrief = {
  kind: "closing-risk";
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  meetingDate: string;
  stateLabel: string;
  blockerLabel: string;
};
```

Extend `PlatformAdminSelectedBrief`:

```ts
  closingRisk?: PlatformAdminClosingRiskBrief | null;
```

If TypeScript requires a stricter union, define:

```ts
export type PlatformAdminSelectedBrief =
  | PlatformAdminClubSelectedBrief
  | PlatformAdminClosingRiskSelectedBrief;
```

Use the union only if it simplifies null handling in `AdminSelectedBrief`.

- [ ] **Step 4: Add safe label helpers and queue builder**

Add to `platform-admin-workbench-model.ts`:

```ts
function closingRiskStateLabel(state: string): string {
  if (state === "BLOCKED") return "차단";
  if (state === "IN_PROGRESS") return "진행 중";
  if (state === "READY") return "확인 준비";
  return "확인 필요";
}

function closingRiskBlockerLabel(blocker: string | null): string {
  if (blocker === "FEEDBACK_DOCUMENT_INVALID") return "피드백 문서 다시 확인";
  if (blocker === "SESSION_CLOSE_REQUIRED") return "세션 종료 필요";
  if (blocker === "RECORD_PACKAGE_REQUIRED") return "기록 패키지 필요";
  if (blocker === "FEEDBACK_DOCUMENT_REQUIRED") return "피드백 문서 필요";
  if (blocker === "MEMBER_NOTIFICATION_REQUIRED") return "멤버 알림 확인";
  if (blocker === "PUBLIC_RECORD_REQUIRED") return "공개 기록 확인";
  return "확인 필요";
}

function closingRiskSeverity(state: string): WorkQueueSeverity {
  if (state === "BLOCKED") return "critical";
  if (state === "IN_PROGRESS") return "warn";
  return "attention";
}

function closingRiskSortRank(state: string): number {
  if (state === "BLOCKED") return 25;
  if (state === "IN_PROGRESS") return 35;
  return 45;
}

function buildClosingRiskQueueItems(
  risks: ReadonlyArray<PlatformAdminTodayClosingRiskItem>,
): WorkbenchQueueItem[] {
  return risks.map((risk) => {
    const blockerLabel = closingRiskBlockerLabel(risk.primaryBlocker);
    return {
      id: `closing-risk-${risk.sessionId}`,
      type: "closing-risk",
      clubId: risk.clubId,
      slug: risk.clubSlug,
      name: `${risk.clubName} · No.${risk.sessionNumber}`,
      severity: closingRiskSeverity(risk.overallState),
      reason: `${risk.bookTitle} · ${blockerLabel}`,
      primaryActionLabel: risk.hostClosingHref ? "호스트 클로징 보드" : "클럽 운영 상세",
      badges: [closingRiskStateLabel(risk.overallState), blockerLabel],
      sortRank: closingRiskSortRank(risk.overallState),
      href: risk.hostClosingHref || `/admin/clubs/${risk.clubId}`,
    };
  });
}

function buildClosingRiskPartialItem(): WorkbenchQueueItem {
  return {
    id: "partial-closing-risks",
    type: "partial-error",
    clubId: null,
    slug: "closing-risks",
    name: "클로징 리스크",
    severity: "warn",
    reason: "클로징 리스크 확인 불가",
    primaryActionLabel: "클로징 확인 불가",
    badges: ["partial"],
    sortRank: 36,
    href: "/admin/today",
  };
}
```

Update queue assembly:

```ts
const closingRiskItems = input.closingRisksUnavailable
  ? [buildClosingRiskPartialItem()]
  : buildClosingRiskQueueItems(input.closingRisks ?? []);
const queueItems = [...clubItems, ...closingRiskItems, ...notificationItems, ...aiItems].sort(compareQueueItems);
```

- [ ] **Step 5: Build selected brief for closing risks**

In `buildSelectedBrief`, branch on `selectedItem.type === "closing-risk"` before club checklist logic:

```ts
if (selectedItem.type === "closing-risk") {
  const risk = inputClosingRiskByQueueId.get(selectedItem.id);
  return {
    item: selectedItem,
    club: input.clubs.find((club) => club.clubId === selectedItem.clubId) ?? null,
    domains: [],
    publishChecklist: [],
    primaryAction: {
      kind: "open-detail",
      label: selectedItem.primaryActionLabel,
      href: selectedItem.href,
      disabled: false,
      reason: null,
    },
    drillLinks: [
      { label: "클럽 운영 상세", href: `/admin/clubs/${selectedItem.clubId}` },
    ],
    permissionNote: null,
    closingRisk: risk ? {
      kind: "closing-risk",
      sessionId: risk.sessionId,
      sessionNumber: risk.sessionNumber,
      bookTitle: risk.bookTitle,
      meetingDate: risk.meetingDate,
      stateLabel: closingRiskStateLabel(risk.overallState),
      blockerLabel: closingRiskBlockerLabel(risk.primaryBlocker),
    } : null,
  };
}
```

Implementation detail: create `const inputClosingRiskByQueueId = new Map(...)` in `buildPlatformAdminWorkbench` and pass it to `buildSelectedBrief`, or store safe fields on `WorkbenchQueueItem` if that is cleaner. Do not render raw state/blocker codes.

- [ ] **Step 6: Render closing-risk brief**

Modify `front/features/platform-admin/ui/admin-selected-brief.tsx` after the header:

```tsx
{brief.closingRisk ? (
  <div className="admin-selected-brief__checklist" aria-label="회차 클로징 리스크">
    <div className="admin-selected-brief__check" data-state="blocked">
      <strong>No.{brief.closingRisk.sessionNumber} · {brief.closingRisk.bookTitle}</strong>
      <span>{brief.closingRisk.meetingDate}</span>
    </div>
    <div className="admin-selected-brief__check" data-state="blocked">
      <strong>{brief.closingRisk.stateLabel}</strong>
      <span>{brief.closingRisk.blockerLabel}</span>
    </div>
  </div>
) : null}
```

Keep the existing publish checklist block for club items.

- [ ] **Step 7: Finish route test assertions**

Update the Task 2 `admin-today-route.test.tsx` closing risk test:

```tsx
expect(screen.getByText(/Ready Club · No.12/)).toBeInTheDocument();
expect(screen.getByText(/모던 자바스크립트 · 피드백 문서 다시 확인/)).toBeInTheDocument();
expect(screen.getByRole("link", { name: "호스트 클로징 보드" }))
  .toHaveAttribute("href", "/clubs/ready-club/app/host/sessions/session-1/closing");
expect(document.body.textContent).not.toContain("FEEDBACK_DOCUMENT_INVALID");
expect(document.body.textContent).not.toContain("member1@example.com");
```

Add partial-error route test by making the query data absent and setting query state to error if practical. If direct query error setup is brittle, rely on the model test for partial-error and keep route coverage to successful seeded rendering.

- [ ] **Step 8: Run focused frontend tests**

Run:

```bash
pnpm --dir front test -- platform-admin-workbench-model admin-today-route
```

Expected: all focused tests pass.

- [ ] **Step 9: Commit Task 3**

```bash
git add front/features/platform-admin/model/platform-admin-workbench-model.ts \
  front/features/platform-admin/model/platform-admin-workbench-model.test.ts \
  front/features/platform-admin/ui/admin-selected-brief.tsx \
  front/features/platform-admin/route/admin-today-route.test.tsx
git commit -m "feat(front): show closing risks in admin today"
```

---

### Task 4: Host Closing Board Korean Repair Labels

**Files:**
- Modify: `front/features/host/model/session-closing-model.ts`
- Modify: `front/features/host/model/session-closing-model.test.ts`
- Modify: `front/features/host/ui/session-closing-board.test.tsx`

**Interfaces:**
- Consumes: existing `SessionClosingStatusInput.overall.primaryAction`
- Produces: `SessionClosingBoardView.primaryAction.label` in Korean repair copy

- [ ] **Step 1: Add failing label coverage**

Modify `front/features/host/model/session-closing-model.test.ts`:

```ts
it.each([
  ["CLOSE_SESSION", "세션 종료 확인"],
  ["IMPORT_RECORDS", "기록 패키지 검토"],
  ["PUBLISH_RECORDS", "기록 공개 설정 확인"],
  ["SEND_NOTIFICATION", "멤버 알림 상태 확인"],
  ["REVIEW_PUBLIC_PAGE", "공개 기록 확인"],
  ["NONE", "추가 조치 없음"],
] as const)("maps %s to Korean repair label %s", (primaryAction, label) => {
  const view = getSessionClosingBoardView({
    ...baseStatus,
    overall: { ...baseStatus.overall, primaryAction },
  });

  expect(view.primaryAction.label).toBe(label);
});
```

Update existing assertion:

```ts
expect(view.primaryAction.label).toBe("멤버 알림 상태 확인");
```

Modify `front/features/host/ui/session-closing-board.test.tsx` fixture:

```ts
primaryAction: { label: "멤버 알림 상태 확인", href: "/app/host/notifications" },
```

Update assertion:

```ts
expect(screen.getByRole("link", { name: "멤버 알림 상태 확인" })).toHaveAttribute("href", "/app/host/notifications");
```

- [ ] **Step 2: Run host tests and verify they fail**

Run:

```bash
pnpm --dir front test -- session-closing
```

Expected before implementation: tests fail because labels are still English.

- [ ] **Step 3: Implement Korean labels**

Modify `primaryAction()` in `front/features/host/model/session-closing-model.ts`:

```ts
function primaryAction(status: SessionClosingStatusInput) {
  switch (status.overall.primaryAction) {
    case "CLOSE_SESSION":
      return { label: "세션 종료 확인", href: `/app/host/sessions/${status.session.sessionId}/edit` };
    case "IMPORT_RECORDS":
      return { label: "기록 패키지 검토", href: `/app/host/sessions/${status.session.sessionId}/edit?records=json` };
    case "PUBLISH_RECORDS":
      return { label: "기록 공개 설정 확인", href: `/app/host/sessions/${status.session.sessionId}/edit` };
    case "SEND_NOTIFICATION":
      return { label: "멤버 알림 상태 확인", href: "/app/host/notifications" };
    case "REVIEW_PUBLIC_PAGE":
      return { label: "공개 기록 확인", href: status.evidence.publicRecordHref };
    case "NONE":
      return { label: "추가 조치 없음", href: null };
  }
}
```

Do not change href semantics in this task.

- [ ] **Step 4: Run host tests**

Run:

```bash
pnpm --dir front test -- session-closing
```

Expected: `session-closing-model` and `session-closing-board` tests pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add front/features/host/model/session-closing-model.ts \
  front/features/host/model/session-closing-model.test.ts \
  front/features/host/ui/session-closing-board.test.tsx
git commit -m "fix(front): clarify host closing actions"
```

---

### Task 5: Browser Coverage, Release Notes, and Verification

**Files:**
- Create: `front/tests/e2e/admin-today-closing-risks.spec.ts`
- Modify: `CHANGELOG.md`
- Modify: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes: server endpoint from Task 1, frontend route/model from Tasks 2-3, host labels from Task 4
- Produces: browser-level evidence and release-readiness closeout

- [ ] **Step 1: Add targeted E2E test**

Create `front/tests/e2e/admin-today-closing-risks.spec.ts` by following the auth/dev-login helpers used in existing admin E2E specs. The core assertions must be:

```ts
await page.goto("/admin/today");
await expect(page.getByRole("heading", { name: "오늘 할 일" })).toBeVisible();
await expect(page.getByText(/클로징|기록|피드백|알림/)).toBeVisible();
await expect(page.getByText("member1@example.com")).toHaveCount(0);
await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
await expect(page.getByText("{\"")).toHaveCount(0);
```

If current fixtures do not naturally create a closing-risk item, seed the route through existing public-safe dev fixtures or convert the test to mock the BFF response using Playwright `page.route`. Prefer real app data if existing admin E2E setup already provides a closed/incomplete session.

- [ ] **Step 2: Run targeted E2E**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-today-closing-risks.spec.ts
```

Expected: targeted E2E passes and no private sentinel renders.

- [ ] **Step 3: Update CHANGELOG**

Add under `CHANGELOG.md` `## Unreleased` / `### Changed`:

```md
- **admin today closing risks:** `/admin/today` now includes admin-safe session closing risk items that link to host-owned closing boards, and the host closing board uses clearer Korean repair labels. The feature is read-only for platform admins and adds no DB migration, auth/BFF token change, deployment behavior change, or admin session mutation.
```

- [ ] **Step 4: Update release-readiness review**

Append to `docs/development/release-readiness-review.md`:

```md
## 2026-06-20 Admin today closing risk recovery closeout

- Scope reviewed: local `main..HEAD` for the admin today closing risk recovery branch.
- Release classification: additive server/admin frontend read projection plus host closing board copy improvement. No DB migration, auth/BFF token change, deploy script change, CI workflow change, or platform-admin session mutation was added.
- Product evidence: `/admin/today` shows admin-safe session closing risk items and links to host-owned closing boards; host closing board primary actions use Korean repair labels.
- Public safety: closing risk rows expose only club/session metadata, safe state/blocker labels, and host closing hrefs. They do not expose raw member data, feedback bodies, provider raw errors, raw JSON, private domains, or token-shaped values.
- Local verification before merge: `git diff --check`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `pnpm --dir front test:e2e -- tests/e2e/admin-today-closing-risks.spec.ts`, `./server/gradlew -p server check`, `./server/gradlew -p server architectureTest`, `./scripts/build-public-release-candidate.sh`, and `./scripts/public-release-check.sh .tmp/public-release-candidate` passed.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke. These require release-operation access after merge and are not local evidence for this branch.
- Residual risk: no known local release-readiness residual remains after frontend, targeted E2E, server, architecture, public-release, and safety-scan evidence. Production deploy/tag smoke remains outside this local branch.
```

- [ ] **Step 5: Run full required local checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/admin-today-closing-risks.spec.ts
./server/gradlew -p server check
./server/gradlew -p server architectureTest
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: all commands pass. If the focused E2E is the only changed flow, full E2E is optional; run full `pnpm --dir front test:e2e` if route/auth/BFF behavior changed beyond the read endpoint.

- [ ] **Step 6: Final public-safety scan**

Run:

```bash
git diff --cached --check
rg -n "member1@example.com|private\\.example|ADMIN_ROUTE|raw JSON|token|secret|OCID" front/features/platform-admin front/features/host server/src/main/kotlin CHANGELOG.md docs/development/release-readiness-review.md
```

Expected: no production UI/server/doc leak. Test-only sentinel assertions are acceptable when they assert non-rendering.

- [ ] **Step 7: Commit Task 5**

```bash
git add front/tests/e2e/admin-today-closing-risks.spec.ts CHANGELOG.md docs/development/release-readiness-review.md
git commit -m "test(e2e): cover admin today closing risks"
```

---

## Final Verification Checklist

Run after all tasks are committed:

```bash
git diff --check
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/admin-today-closing-risks.spec.ts
./server/gradlew -p server check
./server/gradlew -p server architectureTest
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected final state:

- `/api/admin/today/closing-risks` returns `admin.today_closing_risks.v1`.
- `/admin/today` includes closing-risk queue rows when server data exists.
- Closing-risk partial failure does not blank `/admin/today`.
- Host closing board primary action labels are Korean and specific.
- No platform-admin session mutation exists.
- Public release candidate scanner passes.

## Self-Review

- Spec coverage: Tasks 1-3 implement `/admin/today` closing risk discovery, Task 4 implements host CTA quality, Task 5 implements browser/release evidence.
- Placeholder scan: no unresolved placeholder markers or unspecified test command remains.
- Type consistency: server model names use `AdminTodayClosingRiskSnapshot` and `AdminTodayClosingRiskItem`; frontend response names use `PlatformAdminTodayClosingRisksResponse` and `PlatformAdminTodayClosingRiskItem`; workbench queue ids use `closing-risk-${sessionId}`.
