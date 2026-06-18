# ReadMates Platform Admin Closing Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make platform admin club detail show actionable, public-safe session closing risks and fix real `/admin/**` BrowserRouter entry so the screen is reachable outside isolated route tests.

**Architecture:** Use an additive `admin.club_operations_snapshot.v1` field named `closingRisks`; do not create a new admin console or admin mutations. Keep the server projection adapter-local for this iteration, with tests pinning parity to host closing semantics. Fix route ordering before adding UI so `/admin/**` is no longer swallowed by the public route catch-all.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Vite 8, Vitest, Playwright, Kotlin/Spring Boot, JdbcTemplate, MySQL/Flyway, Gradle.

## Global Constraints

- Follow `docs/agents/front.md` for work under `front/`.
- Follow `docs/agents/server.md` for work under `server/`.
- Follow `docs/agents/design.md` for UI, layout, copy, and visual polish.
- Follow `docs/agents/docs.md` for CHANGELOG and release-readiness documentation.
- Keep the `AdminClubOperationsSnapshot` schema string at `"admin.club_operations_snapshot.v1"` and add `closingRisks` as an additive field.
- Do not add a DB migration.
- Do not add platform-admin mutations for session close, record publish, notification send, RSVP, or attendance.
- Do not expose raw member data, feedback body, provider raw error, raw JSON, internal stack trace, secret, token-shaped value, private domain, OCID, or deployment state.
- Use adapter-local admin closing projection in this iteration; do not extract shared `sessionclosing` helpers unless a compile boundary requires it.
- Keep operations snapshot failure policy unchanged: if `/api/admin/clubs/:clubId/operations` fails, the current route-level query failure behavior remains. Do not add panel-local isolation in this implementation.
- Use canonical host closing hrefs: `/clubs/:slug/app/host/sessions/:sessionId/closing`.
- Row limit for displayed closing risk items is 5; overflow is summarized as `외 N개 회차`.

---

## File Structure

- Modify `front/src/app/router.tsx`: route order fix so admin/auth/member/host app routes are matched before public catch-all.
- Create `front/src/app/router-route-order.test.tsx`: route composition characterization for `/admin/today`, `/admin/clubs/:clubId`, and public 404.
- Modify `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`: add `AdminClubClosingRisks` and `AdminClubClosingRiskItem`.
- Modify `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt`: include `closingRisks` in the response DTO.
- Modify `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`: calculate closing risk projection.
- Modify `server/src/test/kotlin/com/readmates/club/application/service/AdminClubOperationsServiceTest.kt`: update snapshot fixture for the new additive field.
- Modify or create `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsClosingRiskTest.kt`: integration tests for empty, ready, and in-progress closing projections.
- Modify `front/features/platform-admin/model/platform-admin-club-operations-model.ts`: add frontend types and safe label helpers.
- Modify `front/features/platform-admin/ui/admin-club-operations-page.tsx`: render the closing risk panel without host command buttons.
- Modify `front/features/platform-admin/ui/admin-club-operations-page.test.tsx`: UI coverage for empty, blocked, ready, overflow, unknown blocker, and command absence.
- Modify `front/tests/e2e/admin-club-operations.spec.ts`: browser-level route entry, closing risk row, host board link, and sentinel non-render assertions.
- Modify `front/src/styles/globals.css`: responsive admin closing risk panel styling, following existing admin operations classes.
- Modify `CHANGELOG.md`: implementation closeout entry under `## Unreleased`.
- Modify `docs/development/release-readiness-review.md`: closeout note after verification.

---

### Task 1: Fix Real Admin Route Entry

**Files:**
- Create: `front/src/app/router-route-order.test.tsx`
- Modify: `front/src/app/router.tsx`

**Interfaces:**
- Consumes: `buildRoutes(queryClient: QueryClient): RouteObject[]`
- Produces: route ordering where `matchRoutes(buildRoutes(queryClient), "/admin/today")` includes route id `"app-admin"` and does not terminate at the public `*` route.

- [ ] **Step 1: Write the failing route-order test**

Create `front/src/app/router-route-order.test.tsx` with this content:

```tsx
import { QueryClient } from "@tanstack/react-query";
import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { buildRoutes } from "@/src/app/router";

function routeIdsFor(pathname: string): Array<string | undefined> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (matchRoutes(buildRoutes(queryClient), pathname) ?? []).map((match) => match.route.id);
}

function routePathsFor(pathname: string): Array<string | undefined> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (matchRoutes(buildRoutes(queryClient), pathname) ?? []).map((match) => match.route.path);
}

describe("router route order", () => {
  it("matches admin routes before the public catch-all", () => {
    expect(routeIdsFor("/admin/today")).toContain("app-admin");
    expect(routeIdsFor("/admin/clubs/club-1")).toContain("app-admin");
    expect(routePathsFor("/admin/today")).not.toEqual(expect.arrayContaining(["*"]));
  });

  it("keeps public unknown routes on the public not-found branch", () => {
    expect(routeIdsFor("/unknown-public-route")).not.toContain("app-admin");
    expect(routePathsFor("/unknown-public-route")).toEqual(expect.arrayContaining(["*"]));
  });
});
```

- [ ] **Step 2: Run the route-order test and verify it fails**

Run:

```bash
pnpm --dir front test -- router-route-order
```

Expected before implementation: the first test fails because `/admin/today` is matched by the public route tree and does not contain `app-admin`.

- [ ] **Step 3: Fix route ordering**

Modify `front/src/app/router.tsx` so `buildRoutes` returns app/auth/admin routes before the public catch-all route:

```tsx
export function buildRoutes(queryClient: QueryClient): RouteObject[] {
  return [
    ...authRoutes(queryClient),
    ...memberRoutes(queryClient),
    ...hostRoutes(queryClient),
    ...adminRoutes(queryClient),
    publicRoutes(queryClient),
  ];
}
```

Do not change route paths, loaders, guards, or public route components in this task.

- [ ] **Step 4: Run the route-order test and verify it passes**

Run:

```bash
pnpm --dir front test -- router-route-order
```

Expected: both tests pass.

- [ ] **Step 5: Run a small route regression set**

Run:

```bash
pnpm --dir front test -- admin-shell-layout admin-club-detail-route public-records-page
```

Expected: all selected Vitest files pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add front/src/app/router.tsx front/src/app/router-route-order.test.tsx
git commit -m "fix(front): route admin paths before public catch-all"
```

---

### Task 2: Add Server Closing Risk Projection

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt`
- Modify: `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`
- Modify: `server/src/test/kotlin/com/readmates/club/application/service/AdminClubOperationsServiceTest.kt`
- Create: `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsClosingRiskTest.kt`

**Interfaces:**
- Consumes: `JdbcAdminClubOperationsAdapter.loadSnapshot(clubId: UUID): AdminClubOperationsSnapshot?`
- Produces:
  - Kotlin model `AdminClubClosingRisks(incompleteCount: Int, blockedCount: Int, readyCount: Int, items: List<AdminClubClosingRiskItem>)`
  - Kotlin model `AdminClubClosingRiskItem(sessionId: UUID, sessionNumber: Int, bookTitle: String, meetingDate: LocalDate, overallState: String, primaryBlocker: String?, hostClosingHref: String)`
  - Response JSON field `closingRisks`

- [ ] **Step 1: Write the integration test first**

Create `server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsClosingRiskTest.kt` with this content:

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
import java.util.UUID

private const val CLUB_ID = "00000000-0000-0000-0000-0000000fc001"
private const val USER_ID = "00000000-0000-0000-0000-0000000fc002"
private const val MEMBERSHIP_ID = "00000000-0000-0000-0000-0000000fc003"
private const val BLOCKED_SESSION_ID = "00000000-0000-0000-0000-0000000fc101"
private const val READY_SESSION_ID = "00000000-0000-0000-0000-0000000fc102"
private const val PUBLISHED_SESSION_ID = "00000000-0000-0000-0000-0000000fc103"
private const val EVENT_ID = "00000000-0000-0000-0000-0000000fc201"

private const val CLEANUP_SQL = """
    delete from notification_event_outbox where club_id = '$CLUB_ID';
    delete from session_feedback_documents where club_id = '$CLUB_ID';
    delete from public_session_publications where club_id = '$CLUB_ID';
    delete from one_line_reviews where club_id = '$CLUB_ID';
    delete from highlights where club_id = '$CLUB_ID';
    delete from sessions where club_id = '$CLUB_ID';
    delete from memberships where id = '$MEMBERSHIP_ID';
    delete from users where id = '$USER_ID';
    delete from clubs where id = '$CLUB_ID';
"""

@SpringBootTest(properties = ["spring.flyway.locations=classpath:db/mysql/migration,classpath:db/mysql/dev"])
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD)
@Sql(statements = [CLEANUP_SQL], executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD)
@Tag("integration")
class JdbcAdminClubOperationsClosingRiskTest(
    @param:Autowired private val jdbcTemplate: JdbcTemplate,
) : ReadmatesMySqlIntegrationTestSupport() {
    private val adapter by lazy { JdbcAdminClubOperationsAdapter(jdbcTemplate, Clock.systemUTC()) }

    @Test
    fun `projects in-progress and ready closing risks without exposing private content`() {
        seedClubWithHost()
        insertSession(BLOCKED_SESSION_ID, 7, "Parser Review", "CLOSED", "PUBLIC", daysAgo = 2)
        insertSession(READY_SESSION_ID, 8, "Notify Members", "CLOSED", "PUBLIC", daysAgo = 1)
        insertSession(PUBLISHED_SESSION_ID, 9, "Already Public", "PUBLISHED", "PUBLIC", daysAgo = 0)
        insertPublication(READY_SESSION_ID, visible = false)
        insertFeedbackDocument(READY_SESSION_ID)
        insertPublication(PUBLISHED_SESSION_ID, visible = true)
        insertFeedbackDocument(PUBLISHED_SESSION_ID)
        insertPublishedNotification(PUBLISHED_SESSION_ID)

        val snapshot = adapter.loadSnapshot(UUID.fromString(CLUB_ID))

        assertThat(snapshot).isNotNull
        val risks = snapshot!!.closingRisks
        assertThat(risks.incompleteCount).isEqualTo(2)
        assertThat(risks.blockedCount).isEqualTo(0)
        assertThat(risks.readyCount).isEqualTo(1)
        assertThat(risks.items.map { it.sessionId.toString() })
            .containsExactly(READY_SESSION_ID, BLOCKED_SESSION_ID)

        val ready = risks.items.first { it.sessionId.toString() == READY_SESSION_ID }
        assertThat(ready.overallState).isEqualTo("READY")
        assertThat(ready.primaryBlocker).isEqualTo("MEMBER_NOTIFICATION_REQUIRED")
        assertThat(ready.hostClosingHref).isEqualTo("/clubs/closing-risk-club/app/host/sessions/$READY_SESSION_ID/closing")

        val blocked = risks.items.first { it.sessionId.toString() == BLOCKED_SESSION_ID }
        assertThat(blocked.overallState).isEqualTo("IN_PROGRESS")
        assertThat(blocked.primaryBlocker).isEqualTo("RECORD_PACKAGE_REQUIRED")
        assertThat(blocked.bookTitle).isEqualTo("Parser Review")
    }

    @Test
    fun `clean club reports an empty closing risk projection`() {
        seedClubWithHost()

        val snapshot = adapter.loadSnapshot(UUID.fromString(CLUB_ID))

        assertThat(snapshot!!.closingRisks.incompleteCount).isEqualTo(0)
        assertThat(snapshot.closingRisks.blockedCount).isEqualTo(0)
        assertThat(snapshot.closingRisks.readyCount).isEqualTo(0)
        assertThat(snapshot.closingRisks.items).isEmpty()
    }

    private fun seedClubWithHost() {
        jdbcTemplate.update(
            "insert into clubs (id, slug, name, tagline, about, status, public_visibility) values (?, 'closing-risk-club', 'Closing Risk Club', '', '', 'ACTIVE', 'PUBLIC')",
            CLUB_ID,
        )
        jdbcTemplate.update(
            "insert into users (id, google_subject_id, email, name, short_name, auth_provider) values (?, 'closing-risk-user', 'closing-risk@example.com', 'Closing Risk', 'CR', 'GOOGLE')",
            USER_ID,
        )
        jdbcTemplate.update(
            "insert into memberships (id, club_id, user_id, role, status, joined_at, short_name) values (?, ?, ?, 'HOST', 'ACTIVE', utc_timestamp(6), 'CR')",
            MEMBERSHIP_ID,
            CLUB_ID,
            USER_ID,
        )
    }

    private fun insertSession(
        id: String,
        number: Int,
        title: String,
        state: String,
        visibility: String,
        daysAgo: Int,
    ) {
        jdbcTemplate.update(
            """
            insert into sessions (
              id, club_id, number, book_title, book_author, session_date,
              start_time, end_time, location_label, state, visibility
            )
            values (?, ?, ?, ?, '작가', current_date() - interval ? day,
              '19:00:00', '21:00:00', '모임방', ?, ?)
            """.trimIndent(),
            id,
            CLUB_ID,
            number,
            title,
            daysAgo,
            state,
            visibility,
        )
    }

    private fun insertPublication(
        sessionId: String,
        visible: Boolean,
    ) {
        jdbcTemplate.update(
            """
            insert into public_session_publications (
              id, club_id, session_id, public_summary, is_public, visibility, published_at
            )
            values (uuid(), ?, ?, '공개 가능한 요약입니다.', ?, 'PUBLIC', if(?, utc_timestamp(6), null))
            """.trimIndent(),
            CLUB_ID,
            sessionId,
            visible,
            visible,
        )
    }

    private fun insertFeedbackDocument(sessionId: String) {
        jdbcTemplate.update(
            """
            insert into session_feedback_documents (
              id, club_id, session_id, version, source_text, file_name, content_type, file_size
            )
            values (uuid(), ?, ?, 1, '# 공개 가능한 회고', 'feedback.md', 'text/markdown', 18)
            """.trimIndent(),
            CLUB_ID,
            sessionId,
        )
    }

    private fun insertPublishedNotification(sessionId: String) {
        jdbcTemplate.update(
            """
            insert into notification_event_outbox (
              id, club_id, event_type, aggregate_type, aggregate_id, payload_json, status,
              kafka_key, attempt_count, last_error, dedupe_key, created_at, updated_at
            )
            values (?, ?, 'FEEDBACK_DOCUMENT_PUBLISHED', 'SESSION', ?, json_object('sessionId', ?), 'PUBLISHED',
              ?, 1, null, ?, utc_timestamp(6), utc_timestamp(6))
            """.trimIndent(),
            EVENT_ID,
            CLUB_ID,
            sessionId,
            sessionId,
            "closing-risk-$sessionId",
            "closing-risk-$sessionId",
        )
    }
}
```

- [ ] **Step 2: Run the new integration test and verify it fails**

Run:

```bash
./server/gradlew -p server integrationTest --tests JdbcAdminClubOperationsClosingRiskTest
```

Expected before implementation: compilation fails because `AdminClubOperationsSnapshot.closingRisks` does not exist.

- [ ] **Step 3: Add server model types**

Modify `server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt`.

Add `closingRisks` to `AdminClubOperationsSnapshot`:

```kotlin
data class AdminClubOperationsSnapshot(
    val schema: String = "admin.club_operations_snapshot.v1",
    val generatedAt: OffsetDateTime,
    val club: AdminClubOperationsClub,
    val readiness: AdminClubReadinessSummary,
    val memberActivity: AdminClubMemberActivity,
    val sessionProgress: AdminClubSessionProgress,
    val notificationHealth: AdminClubNotificationHealth,
    val aiUsage: AdminClubAiUsage,
    val closingRisks: AdminClubClosingRisks = AdminClubClosingRisks(),
    val safeLinks: List<AdminClubSafeLink>,
)
```

Add the new model classes below `AdminClubSessionProgress`:

```kotlin
data class AdminClubClosingRisks(
    val incompleteCount: Int = 0,
    val blockedCount: Int = 0,
    val readyCount: Int = 0,
    val items: List<AdminClubClosingRiskItem> = emptyList(),
)

data class AdminClubClosingRiskItem(
    val sessionId: UUID,
    val sessionNumber: Int,
    val bookTitle: String,
    val meetingDate: java.time.LocalDate,
    val overallState: String,
    val primaryBlocker: String?,
    val hostClosingHref: String,
)
```

- [ ] **Step 4: Add response DTO field**

Modify `server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt`.

Add the field:

```kotlin
val closingRisks: Any,
```

Then pass it from the snapshot in `from(...)`:

```kotlin
closingRisks = snapshot.closingRisks,
```

The response DTO constructor must keep `schema`, `generatedAt`, `club`, `readiness`, `memberActivity`, `sessionProgress`, `notificationHealth`, `aiUsage`, `closingRisks`, and `safeLinks` in the same order as the data class fields.

- [ ] **Step 5: Implement adapter-local projection**

Modify `server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt`.

Add imports:

```kotlin
import com.readmates.club.application.model.AdminClubClosingRiskItem
import com.readmates.club.application.model.AdminClubClosingRisks
import java.time.LocalDate
```

Pass `closingRisks` when creating `AdminClubOperationsSnapshot`:

```kotlin
closingRisks = closingRisks(club),
```

Add these functions inside `JdbcAdminClubOperationsAdapter`:

```kotlin
private fun closingRisks(club: AdminClubOperationsClub): AdminClubClosingRisks {
    val items = closingRiskItems(club)
    return AdminClubClosingRisks(
        incompleteCount = items.size,
        blockedCount = items.count { it.overallState == "BLOCKED" },
        readyCount = items.count { it.overallState == "READY" },
        items = items.take(CLOSING_RISK_ITEM_LIMIT),
    )
}

private fun closingRiskItems(club: AdminClubOperationsClub): List<AdminClubClosingRiskItem> =
    jdbcTemplate.query(
        """
        select
          sessions.id,
          sessions.number,
          sessions.book_title,
          sessions.session_date,
          sessions.state,
          sessions.visibility,
          public_session_publications.public_summary,
          public_session_publications.is_public,
          public_session_publications.visibility as publication_visibility,
          public_session_publications.published_at,
          exists (
            select 1
            from session_feedback_documents
            where session_feedback_documents.club_id = sessions.club_id
              and session_feedback_documents.session_id = sessions.id
          ) as feedback_uploaded,
          exists (
            select 1
            from notification_event_outbox
            where notification_event_outbox.club_id = sessions.club_id
              and notification_event_outbox.aggregate_id = sessions.id
              and notification_event_outbox.event_type in ('FEEDBACK_DOCUMENT_PUBLISHED', 'NEXT_BOOK_PUBLISHED')
              and notification_event_outbox.status = 'PUBLISHED'
          ) as notification_sent,
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
          ) as one_liner_count
        from sessions
        left join public_session_publications
          on public_session_publications.club_id = sessions.club_id
         and public_session_publications.session_id = sessions.id
        where sessions.club_id = ?
          and sessions.state in ('CLOSED', 'PUBLISHED')
        order by sessions.session_date desc, sessions.number desc
        limit 25
        """.trimIndent(),
        { rs, _ ->
            val sessionId = rs.uuid("id")
            val sessionClosed = rs.getString("state") in setOf("CLOSED", "PUBLISHED")
            val recordSaved =
                !rs.getString("public_summary").isNullOrBlank() ||
                    rs.getInt("highlight_count") > 0 ||
                    rs.getInt("one_liner_count") > 0
            val feedbackReady = rs.getBoolean("feedback_uploaded")
            val notificationSent = rs.getBoolean("notification_sent")
            val publicApplicable = rs.getString("visibility") == "PUBLIC"
            val publicReady =
                publicApplicable &&
                    rs.getBoolean("is_public") &&
                    rs.getTimestamp("published_at") != null &&
                    rs.getString("publication_visibility") == "PUBLIC" &&
                    rs.getString("state") == "PUBLISHED"
            val blocker =
                closingPrimaryBlocker(
                    sessionClosed = sessionClosed,
                    recordSaved = recordSaved,
                    feedbackReady = feedbackReady,
                    notificationSent = notificationSent,
                    publicApplicable = publicApplicable,
                    publicReady = publicReady,
                )
            val state = closingOverallState(blocker)
            AdminClubClosingRiskItem(
                sessionId = sessionId,
                sessionNumber = rs.getInt("number"),
                bookTitle = rs.getString("book_title"),
                meetingDate = rs.getObject("session_date", LocalDate::class.java),
                overallState = state,
                primaryBlocker = blocker,
                hostClosingHref = "/clubs/${club.slug}/app/host/sessions/$sessionId/closing",
            )
        },
        club.clubId.dbString(),
    ).filter { it.primaryBlocker != null }
```

Add these top-level helper functions below `BigDecimal.formatCost()`:

```kotlin
private fun closingPrimaryBlocker(
    sessionClosed: Boolean,
    recordSaved: Boolean,
    feedbackReady: Boolean,
    notificationSent: Boolean,
    publicApplicable: Boolean,
    publicReady: Boolean,
): String? =
    when {
        !sessionClosed -> "SESSION_CLOSE_REQUIRED"
        !recordSaved -> "RECORD_PACKAGE_REQUIRED"
        !feedbackReady -> "FEEDBACK_DOCUMENT_REQUIRED"
        !notificationSent -> "MEMBER_NOTIFICATION_REQUIRED"
        publicApplicable && !publicReady -> "PUBLIC_RECORD_REQUIRED"
        else -> null
    }

private fun closingOverallState(primaryBlocker: String?): String =
    when (primaryBlocker) {
        null -> "PUBLISHED"
        "MEMBER_NOTIFICATION_REQUIRED", "PUBLIC_RECORD_REQUIRED" -> "READY"
        else -> "IN_PROGRESS"
    }
```

Add the constant:

```kotlin
private const val CLOSING_RISK_ITEM_LIMIT = 5
```

- [ ] **Step 6: Update service fixture**

Modify `server/src/test/kotlin/com/readmates/club/application/service/AdminClubOperationsServiceTest.kt`.

Import the new type:

```kotlin
import com.readmates.club.application.model.AdminClubClosingRisks
```

Add this argument before `safeLinks` in `snapshot()`:

```kotlin
closingRisks = AdminClubClosingRisks(),
```

- [ ] **Step 7: Run focused server tests**

Run:

```bash
./server/gradlew -p server integrationTest --tests JdbcAdminClubOperationsClosingRiskTest
./server/gradlew -p server unitTest --tests AdminClubOperationsServiceTest
```

Expected: both commands pass.

- [ ] **Step 8: Commit Task 2**

```bash
git add server/src/main/kotlin/com/readmates/club/application/model/AdminClubOperationsModels.kt \
  server/src/main/kotlin/com/readmates/club/adapter/in/web/PlatformAdminClubOperationsController.kt \
  server/src/main/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsAdapter.kt \
  server/src/test/kotlin/com/readmates/club/application/service/AdminClubOperationsServiceTest.kt \
  server/src/test/kotlin/com/readmates/club/adapter/out/persistence/JdbcAdminClubOperationsClosingRiskTest.kt
git commit -m "feat(server): project admin closing risks"
```

---

### Task 3: Render Admin Closing Risk Panel

**Files:**
- Modify: `front/features/platform-admin/model/platform-admin-club-operations-model.ts`
- Modify: `front/features/platform-admin/ui/admin-club-operations-page.tsx`
- Modify: `front/features/platform-admin/ui/admin-club-operations-page.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: `AdminClubOperationsSnapshot.closingRisks`
- Produces:
  - `AdminClubClosingRiskItem`
  - `closingRiskStateLabel(state: string): string`
  - `closingRiskBlockerLabel(code: string | null): string`
  - `closingRiskOverflowCount(snapshot: AdminClubOperationsSnapshot): number`

- [ ] **Step 1: Write failing UI tests**

Append these tests to `front/features/platform-admin/ui/admin-club-operations-page.test.tsx`:

```tsx
it("renders closing risk rows with host closing board links", () => {
  const withRisks: AdminClubOperationsSnapshot = {
    ...snapshot,
    closingRisks: {
      incompleteCount: 2,
      blockedCount: 0,
      readyCount: 1,
      items: [
        {
          sessionId: "session-8",
          sessionNumber: 8,
          bookTitle: "Notify Members",
          meetingDate: "2026-06-18",
          overallState: "READY",
          primaryBlocker: "MEMBER_NOTIFICATION_REQUIRED",
          hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-8/closing",
        },
      ],
    },
  };
  render(
    <MemoryRouter>
      <AdminClubOperationsPage snapshot={withRisks} supportGrantCount={0} />
    </MemoryRouter>,
  );

  expect(screen.getByRole("heading", { name: "클로징 확인 필요" })).toBeInTheDocument();
  expect(screen.getByText("No.08 · Notify Members")).toBeInTheDocument();
  expect(screen.getByText("멤버 알림 확인")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "호스트 클로징 보드" })).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app/host/sessions/session-8/closing",
  );
  expect(screen.queryByRole("button", { name: /발행|세션 종료|알림 발송|RSVP|출석/ })).not.toBeInTheDocument();
});

it("renders empty and overflow closing risk states", () => {
  const manyRisks: AdminClubOperationsSnapshot = {
    ...snapshot,
    closingRisks: {
      incompleteCount: 7,
      blockedCount: 1,
      readyCount: 2,
      items: Array.from({ length: 5 }, (_, index) => ({
        sessionId: `session-${index}`,
        sessionNumber: index + 1,
        bookTitle: `Book ${index + 1}`,
        meetingDate: "2026-06-18",
        overallState: index === 0 ? "BLOCKED" : "IN_PROGRESS",
        primaryBlocker: index === 0 ? "UNKNOWN_CODE_FROM_SERVER" : "RECORD_PACKAGE_REQUIRED",
        hostClosingHref: `/clubs/reading-sai/app/host/sessions/session-${index}/closing`,
      })),
    },
  };
  render(
    <MemoryRouter>
      <AdminClubOperationsPage snapshot={manyRisks} supportGrantCount={0} />
    </MemoryRouter>,
  );

  expect(screen.getByText("외 2개 회차")).toBeInTheDocument();
  expect(screen.getByText("확인 필요")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run UI tests and verify they fail**

Run:

```bash
pnpm --dir front test -- admin-club-operations-page
```

Expected before implementation: tests fail because `closingRisks` type and UI do not exist.

- [ ] **Step 3: Add frontend types and helpers**

Modify `front/features/platform-admin/model/platform-admin-club-operations-model.ts`.

Add types:

```ts
export type AdminClubClosingRiskItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  meetingDate: string;
  overallState: "IN_PROGRESS" | "BLOCKED" | "READY" | string;
  primaryBlocker: string | null;
  hostClosingHref: string;
};

export type AdminClubClosingRisks = {
  incompleteCount: number;
  blockedCount: number;
  readyCount: number;
  items: AdminClubClosingRiskItem[];
};
```

Add this field to `AdminClubOperationsSnapshot` before `safeLinks`:

```ts
closingRisks?: AdminClubClosingRisks;
```

Add helpers:

```ts
export function closingRiskStateLabel(state: string): string {
  if (state === "BLOCKED") return "차단";
  if (state === "READY") return "확인 준비";
  if (state === "IN_PROGRESS") return "진행 중";
  return "확인 필요";
}

export function closingRiskBlockerLabel(code: string | null): string {
  switch (code) {
    case "SESSION_CLOSE_REQUIRED":
      return "세션 종료 필요";
    case "RECORD_PACKAGE_REQUIRED":
      return "기록 패키지 필요";
    case "FEEDBACK_DOCUMENT_REQUIRED":
      return "피드백 문서 필요";
    case "MEMBER_NOTIFICATION_REQUIRED":
      return "멤버 알림 확인";
    case "PUBLIC_RECORD_REQUIRED":
      return "공개 기록 확인";
    case null:
      return "확인 필요";
    default:
      return "확인 필요";
  }
}

export function closingRiskOverflowCount(snapshot: AdminClubOperationsSnapshot): number {
  const risks = snapshot.closingRisks;
  if (!risks) return 0;
  return Math.max(0, risks.incompleteCount - risks.items.length);
}
```

- [ ] **Step 4: Render the closing risk panel**

Modify imports in `front/features/platform-admin/ui/admin-club-operations-page.tsx`:

```tsx
import {
  aiFailureDelta,
  blockerNextAction,
  closingRiskBlockerLabel,
  closingRiskOverflowCount,
  closingRiskStateLabel,
  notificationFailureDelta,
  type AdminClubClosingRiskItem,
  type AdminClubOperationsSnapshot,
} from "@/features/platform-admin/model/platform-admin-club-operations-model";
```

Inside the `호스트 운영` section, after the existing grid, render:

```tsx
<ClosingRiskPanel snapshot={snapshot} />
```

Add these components below `Stat`:

```tsx
function ClosingRiskPanel({ snapshot }: { snapshot: AdminClubOperationsSnapshot }) {
  const risks = snapshot.closingRisks;
  const overflow = closingRiskOverflowCount(snapshot);

  if (!risks || risks.incompleteCount === 0) {
    return (
      <section className="admin-club-operations__closing" aria-labelledby="admin-closing-risks-title">
        <div className="row-between">
          <h4 id="admin-closing-risks-title" className="h5 editorial">클로징 확인 필요</h4>
          <span className="platform-admin-domain-status">0</span>
        </div>
        <p className="muted">확인할 회차 클로징 리스크가 없습니다.</p>
      </section>
    );
  }

  return (
    <section className="admin-club-operations__closing" aria-labelledby="admin-closing-risks-title">
      <div className="row-between">
        <div>
          <h4 id="admin-closing-risks-title" className="h5 editorial">클로징 확인 필요</h4>
          <p className="tiny muted">
            미완료 {risks.incompleteCount} · 차단 {risks.blockedCount} · 준비 {risks.readyCount}
          </p>
        </div>
        <span className="platform-admin-domain-status">{risks.incompleteCount}</span>
      </div>
      <div className="admin-club-operations__closing-list">
        {risks.items.map((item) => (
          <ClosingRiskRow key={item.sessionId} item={item} />
        ))}
      </div>
      {overflow > 0 ? <p className="tiny muted">외 {overflow}개 회차</p> : null}
    </section>
  );
}

function ClosingRiskRow({ item }: { item: AdminClubClosingRiskItem }) {
  return (
    <article className="surface-quiet admin-club-operations__closing-row">
      <div>
        <p className="admin-club-operations__closing-title">
          No.{String(item.sessionNumber).padStart(2, "0")} · {item.bookTitle}
        </p>
        <p className="tiny muted">{item.meetingDate} · {closingRiskBlockerLabel(item.primaryBlocker)}</p>
      </div>
      <div className="admin-club-operations__closing-actions">
        <span className="platform-admin-domain-status">{closingRiskStateLabel(item.overallState)}</span>
        <Link className="btn btn-ghost btn-sm" to={item.hostClosingHref}>
          호스트 클로징 보드
        </Link>
      </div>
    </article>
  );
}
```

- [ ] **Step 5: Add styling**

Append near the existing `.admin-club-operations` rules in `front/src/styles/globals.css`:

```css
.admin-club-operations__closing {
  margin-top: 16px;
  padding: 16px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-muted);
}

.admin-club-operations__closing-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.admin-club-operations__closing-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 12px;
}

.admin-club-operations__closing-title {
  margin: 0 0 4px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.admin-club-operations__closing-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
```

Add this inside the existing mobile media query that already handles `.admin-club-operations__grid`:

```css
  .admin-club-operations__closing-row {
    flex-direction: column;
  }

  .admin-club-operations__closing-actions {
    justify-content: flex-start;
  }
```

- [ ] **Step 6: Run focused frontend tests**

Run:

```bash
pnpm --dir front test -- admin-club-operations-page platform-admin-club-operations-model
```

Expected: tests pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add front/features/platform-admin/model/platform-admin-club-operations-model.ts \
  front/features/platform-admin/ui/admin-club-operations-page.tsx \
  front/features/platform-admin/ui/admin-club-operations-page.test.tsx \
  front/src/styles/globals.css
git commit -m "feat(front): show admin closing risks"
```

---

### Task 4: Prove Browser Flow with E2E

**Files:**
- Modify: `front/tests/e2e/admin-club-operations.spec.ts`

**Interfaces:**
- Consumes: route fixture `routePlatformAdminShell(page: Page)`
- Produces: E2E evidence that `/admin/clubs/:clubId` direct entry renders admin detail, closing risk rows, host closing links, and no host command buttons or private sentinels.

- [ ] **Step 1: Extend the mocked operations response**

Modify the mocked response inside `routePlatformAdminShell` in `front/tests/e2e/admin-club-operations.spec.ts`.

Add `closingRisks` before `safeLinks`:

```ts
closingRisks: {
  incompleteCount: 2,
  blockedCount: 1,
  readyCount: 1,
  items: [
    {
      sessionId: "session-8",
      sessionNumber: 8,
      bookTitle: "Notify Members",
      meetingDate: "2026-06-18",
      overallState: "READY",
      primaryBlocker: "MEMBER_NOTIFICATION_REQUIRED",
      hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-8/closing",
    },
    {
      sessionId: "session-7",
      sessionNumber: 7,
      bookTitle: "Complete Records",
      meetingDate: "2026-06-11",
      overallState: "IN_PROGRESS",
      primaryBlocker: "RECORD_PACKAGE_REQUIRED",
      hostClosingHref: "/clubs/reading-sai/app/host/sessions/session-7/closing",
    },
  ],
},
```

- [ ] **Step 2: Extend assertions**

Append these assertions to the existing test:

```ts
await expect(page.getByRole("heading", { name: "클로징 확인 필요" })).toBeVisible();
await expect(page.getByText("No.08 · Notify Members")).toBeVisible();
await expect(page.getByText("멤버 알림 확인")).toBeVisible();
await expect(page.getByRole("link", { name: "호스트 클로징 보드" }).first()).toHaveAttribute(
  "href",
  "/clubs/reading-sai/app/host/sessions/session-8/closing",
);
await expect(page.getByText("member1@example.com")).toHaveCount(0);
await expect(page.getByText("private.example.com")).toHaveCount(0);
await expect(page.getByText("ADMIN_ROUTE")).toHaveCount(0);
await expect(page.getByText("{\"")).toHaveCount(0);
await expect(page.getByRole("button", { name: /RSVP|출석|세션 편집|발행|세션 종료|알림 발송/ })).toHaveCount(0);
```

- [ ] **Step 3: Run targeted E2E and verify direct entry**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-club-operations.spec.ts
```

Expected: the test passes and proves direct `/admin/clubs/:clubId` entry no longer lands on public 404.

- [ ] **Step 4: Commit Task 4**

```bash
git add front/tests/e2e/admin-club-operations.spec.ts
git commit -m "test(e2e): cover admin closing risks"
```

---

### Task 5: Documentation, Full Verification, and Release Evidence

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `docs/development/release-readiness-review.md`

**Interfaces:**
- Consumes: commits from Tasks 1-4
- Produces: release-facing documentation and verification evidence for the changed frontend/server/admin surfaces.

- [ ] **Step 1: Update CHANGELOG**

Under `## Unreleased` / `### Changed`, add:

```markdown
- **platform admin closing projection:** `/admin/clubs/:clubId` now shows admin-safe session closing risks with host closing board drilldowns, and `/admin/**` direct browser entry is routed through the admin shell instead of the public catch-all. The projection is additive on `admin.club_operations_snapshot.v1`, exposes only session-level safe fields, and does not add admin mutations, DB migrations, auth/BFF token changes, or deployment behavior changes.
```

- [ ] **Step 2: Run full local verification**

Run:

```bash
git diff --check
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/admin-club-operations.spec.ts
./server/gradlew -p server check
./server/gradlew -p server architectureTest
./server/gradlew -p server integrationTest --tests JdbcAdminClubOperationsClosingRiskTest
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

- `git diff --check` exits 0.
- Frontend lint/test/build pass.
- Targeted E2E passes.
- Server `check`, `architectureTest`, and focused integration test pass.
- Public release candidate build/check pass and gitleaks reports no leaks.

- [ ] **Step 3: Update release-readiness review**

Append a new note to `docs/development/release-readiness-review.md` near the other 2026-06-18/2026-06-19 notes:

```markdown
## 2026-06-19 Platform admin closing projection closeout

- Scope reviewed: local `main..HEAD` for the platform admin closing projection branch.
- Release classification: additive server/admin frontend projection plus route-order fix. No DB migration, auth/BFF token change, deploy script change, CI workflow change, or platform-admin mutation was added.
- Product evidence: `/admin/**` direct BrowserRouter entry now reaches the admin shell, and `/admin/clubs/:clubId` shows admin-safe session closing risk rows with host closing board drilldowns instead of only aggregate incomplete-record counts.
- Public safety: closing risk projection contains session id, session number, book title, meeting date, safe state/blocker label, and host closing href only. It does not expose raw member data, feedback bodies, provider raw errors, raw JSON, private domains, or token-shaped values.
- Local verification before merge: `git diff --check`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, `pnpm --dir front test:e2e -- tests/e2e/admin-club-operations.spec.ts`, `./server/gradlew -p server check`, `./server/gradlew -p server architectureTest`, `./server/gradlew -p server integrationTest --tests JdbcAdminClubOperationsClosingRiskTest`, `./scripts/build-public-release-candidate.sh`, and `./scripts/public-release-check.sh .tmp/public-release-candidate` passed.
- Skipped: production OAuth, VM, provider-console, tag/deploy smoke. These require release-operation access after merge and are not local evidence for this branch.
- Residual risk: no known local release-readiness residual remains after admin route, frontend, server, targeted E2E, architecture, and public-release evidence. Production deploy/tag smoke remains outside this local merge.
```

If any command in Step 2 is skipped or fails and is repaired with a narrower rerun, edit the note so it reports the actual final commands and outcomes.

- [ ] **Step 4: Commit Task 5**

```bash
git add CHANGELOG.md docs/development/release-readiness-review.md
git commit -m "docs: record admin closing projection readiness"
```

---

## Self-Review Checklist

- Spec coverage:
  - Route reality fix: Task 1 and Task 4.
  - Admin-safe closing risk projection: Task 2.
  - Club detail UI: Task 3.
  - E2E evidence and public-safety sentinels: Task 4.
  - Release evidence and docs: Task 5.
- Placeholder scan:
  - Placeholder scan is clean.
- Type consistency:
  - Server field is `closingRisks`.
  - Frontend field is optional `closingRisks?: AdminClubClosingRisks` for additive compatibility.
  - State strings are `"IN_PROGRESS"`, `"BLOCKED"`, and `"READY"`.
  - Host link field is `hostClosingHref`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-readmates-platform-admin-closing-projection.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.
