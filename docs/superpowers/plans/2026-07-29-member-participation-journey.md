# Member Participation Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicated recent-book preview in member space with a self-comparison participation journey that handles mid-join membership correctly and provides a quiet, reliable logout action.

**Architecture:** Harden the existing archive my-page read projection so its six recent rows contain only current-club sessions where the current membership was an active participant, while preserving `ATTENDED`, `ABSENT`, and `UNKNOWN` as an additive API field. Build a pure frontend view model from that profile projection plus the existing whole-journey summary, render it through prop-driven responsive components, and compose the existing auth logout control at the route boundary.

**Tech Stack:** Kotlin 2.2, Spring Boot, JdbcTemplate, MySQL/Testcontainers, React 19, React Router 7, TypeScript 6, Vitest, Testing Library, Playwright, CSS custom properties.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-07-28-member-participation-journey-design.md`.
- Keep the slice inside the existing archive read-side boundary; do not add a table, Flyway migration, BFF route, trusted header, auth policy, or deployment setting.
- Compare the member only with their own history. Do not add club averages, rankings, points, badges, levels, or competitive copy.
- Recent participation means at most six `PUBLISHED` sessions with a current-membership `session_participants` row whose `participation_status` is `ACTIVE`.
- Sessions before the membership joined, sessions without that membership as a participant, removed participation rows, other clubs, and other memberships must not enter the timeline, denominator, or streak.
- Add `attendanceStatus: "ATTENDED" | "ABSENT" | "UNKNOWN"` to each recent attendance item and retain the existing `attended` compatibility field. `attended` is `true` only for `ATTENDED`.
- `UNKNOWN` must remain visible as `미확인`, must not count as absence or attendance, and must suppress a current streak claim when it is the newest row.
- Keep desktop and mobile on one semantic responsive DOM. Use text plus symbols, not color alone, and keep every action target at least 44px high and wide.
- Keep the member home responsible for RSVP, progress, question-count, and pace guidance. Member space may only link to the current session with the approved gentle participation copy.
- Put logout after the record link in a low-hierarchy account section. Reuse the existing auth route/UI logout implementation, redirect successful/401 logout to `/`, and keep failure feedback inline.
- Do not persist or print real member data, private domains, secrets, deployment state, local absolute paths, OCIDs, or token-shaped examples.
- Use the repository package manager through Corepack for frontend checks: `corepack pnpm`. If Corepack is unavailable, use `npx --yes corepack@0.35.0 pnpm` and record that exact fallback.
- Preserve unrelated working-tree changes. Execution should begin from a dedicated worktree created with the worktree skill.

## File Structure

### Server ownership

- `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveListQueries.kt`
  - Own the fixed-size recent-participation SQL and keep the my-page read at two statements.
- `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveRowMappers.kt`
  - Map `attendance_status` without collapsing it to a boolean.
- `server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt`
  - Carry the additive read-model field through the application boundary.
- `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt`
  - Expose the additive JSON field.
- `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt`
  - Map the application result to the web DTO.
- `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt`
  - Prove membership eligibility, status preservation, club isolation, ordering, compatibility, and query count.

### Frontend ownership

- `front/features/archive/api/archive-contracts.ts`
  - Define the API attendance-status union.
- `front/features/archive/model/archive-model.ts`
  - Define the UI-facing profile row with the additive status.
- `front/features/archive/model/my-reading-shelf-model.ts`
  - Own all date, summary, streak, row-label, supporting-stat, and nudge calculations.
- `front/features/archive/model/my-reading-shelf-model.test.ts`
  - Prove the pure model across empty, partial, mid-join, unknown, and membership states.
- `front/features/archive/ui/my-page/participation-timeline.tsx`
  - Render the semantic recent-session list.
- `front/features/archive/ui/my-page/participation-timeline.test.tsx`
  - Prove visible status text and non-duplicated semantics.
- `front/features/archive/ui/my-page/participation-achievement.tsx`
  - Render the whole-journey count and valid membership-duration label.
- `front/features/archive/ui/my-page/participation-nudge.tsx`
  - Render only the already-authorized, model-provided current-session action.
- `front/features/archive/ui/my-page/supporting-reading-stats.tsx`
  - Render completion, question, and review totals as semantic descriptive data.
- `front/features/archive/ui/my-page/participation-journey.tsx`
  - Compose achievement, timeline, nudge, supporting stats, and full-record link.
- `front/features/archive/ui/my-page/participation-journey.test.tsx`
  - Prove hierarchy, empty state, CTA, and supporting-stat behavior.
- `front/features/archive/ui/my-page/member-space-account-actions.tsx`
  - Place the injected logout control in the approved low-hierarchy account section.
- `front/features/archive/ui/my-page/my-reading-shelf.tsx`
  - Compose participation journey and account actions only.
- `front/features/archive/ui/my-page.tsx`
  - Remain a thin presentation shell.
- `front/features/archive/route/my-page-data.ts`
  - Load profile plus journey summary with `limit: 1`.
- `front/features/archive/route/my-page-data.test.ts`
  - Lock the loader contract.
- `front/features/archive/route/my-page-route.tsx`
  - Build the pure view model and inject the route-owned logout control.
- `front/features/archive/route/my-page-route.test.tsx`
  - Prove route composition and member-space logout success, 401, failure, and deduplication.
- `front/tests/unit/my-page.test.tsx`
  - Prove the integrated presentation hierarchy.
- `front/src/styles/globals.css`
  - Replace recent-preview and metric-dashboard styling with the responsive participation journey.
- Delete `front/features/archive/ui/my-page/recent-book-records.tsx`.
- Delete `front/features/archive/ui/my-page/recent-book-records.test.tsx`.
- Delete `front/features/archive/ui/my-page/my-reading-summary.tsx`.

### Browser evidence and active docs

- `front/tests/e2e/my-reading-shelf-fixtures.ts`
  - Add public-safe profile modes for participation, mid-join, unknown, and empty states.
- `front/tests/e2e/member-space-information-architecture.spec.ts`
  - Replace recent-book assertions with participation journey, responsive, navigation, and logout evidence.
- `front/tests/e2e/member-profile-permissions.spec.ts`
  - Keep empty and read-only member behavior aligned with the new page.
- `docs/development/architecture.md`
  - Describe the active projection and route ownership after implementation.
- `CHANGELOG.md`
  - Replace the stale Unreleased recent-three-books and global-only-logout claims.

## Acceptance-Matrix Selection

Selected rows from `docs/development/acceptance-matrix.md`:

- **Actor or authorization:** `ACTIVE` can receive the current-session nudge; `INVITED`, `VIEWER`, `SUSPENDED`, `LEFT`, and `INACTIVE` cannot receive a write-oriented nudge. Logout must retain existing authenticated behavior.
- **Club context:** recent rows must be restricted by both `club_id` and current `membership_id`; focused DB evidence must exclude another club and another membership.
- **Session lifecycle:** only `PUBLISHED` rows enter the recent timeline; the CTA depends on a separate current `OPEN` session.
- **Persistence or migration:** JDBC join/filter semantics change and require Testcontainers evidence, while query count remains fixed and no migration is added.
- **UI or runtime state:** cover full history, fewer than six rows, no history, unknown attendance, denied CTA, logout failure, wrapping, desktop, and mobile.

Adjacent high-risk rows excluded:

- **Publication visibility:** the response contains personal participation metadata behind the existing member endpoint and does not expose publication content or change `PUBLIC`/`MEMBER`/`HOST_ONLY` rules.
- **BFF or OAuth:** endpoint paths, cookies, trusted headers, proxy behavior, and return-path validation do not change.
- **Cursor collection:** `/api/app/me` returns a fixed six-row list; the cursor contract remains owned by `/api/archive/me/journey` and `/app/me/records`.
- **Async, cache, or provider:** no outbox, Kafka, Redis, provider, retry, or cache policy changes.

---

### Task 1: Make Recent Attendance Membership-Eligible and Status-Preserving

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt:1249-1376`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt:1413-1622`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveListQueries.kt:193-224`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveRowMappers.kt:74-79`
- Modify: `server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt:157-176`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt:145-164`
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt:174-195`

**Interfaces:**
- Consumes: existing `CurrentMember.clubId`, `CurrentMember.membershipId`, `session_participants.attendance_status`, and `session_participants.participation_status`.
- Produces:

```kotlin
data class MyRecentAttendanceResult(
    val sessionNumber: Int,
    val attended: Boolean,
    val attendanceStatus: String,
    val readingProgress: Int,
)

data class MyRecentAttendanceItem(
    val sessionNumber: Int,
    val attended: Boolean,
    val attendanceStatus: String,
    val readingProgress: Int,
)
```

- Invariant: `attended == (attendanceStatus == "ATTENDED")`.

- [ ] **Step 1: Add a failing DB/API test for mid-join, unknown, and removed participation**

Add a focused test using a dedicated public-safe `midjoin-member@example.com` sample-club membership and four high-numbered sessions:

```kotlin
@Test
@Sql(
    statements = [
        CLEANUP_MY_PAGE_PARTICIPATION_TIMELINE_SQL,
        INSERT_MY_PAGE_PARTICIPATION_TIMELINE_SQL,
    ],
    executionPhase = Sql.ExecutionPhase.BEFORE_TEST_METHOD,
)
@Sql(
    statements = [CLEANUP_MY_PAGE_PARTICIPATION_TIMELINE_SQL],
    executionPhase = Sql.ExecutionPhase.AFTER_TEST_METHOD,
)
fun `my page recent attendance includes only active participation and preserves unknown`() {
    mockMvc
        .get("/api/app/me") {
            header("X-Readmates-Club-Slug", "sample-book-club")
            with(user("midjoin-member@example.com"))
        }.andExpect {
            status { isOk() }
            jsonPath("$.recentAttendances.length()") { value(2) }
            jsonPath("$.recentAttendances[0].sessionNumber") { value(1202) }
            jsonPath("$.recentAttendances[0].attendanceStatus") { value("ATTENDED") }
            jsonPath("$.recentAttendances[0].attended") { value(true) }
            jsonPath("$.recentAttendances[0].readingProgress") { value(100) }
            jsonPath("$.recentAttendances[1].sessionNumber") { value(1203) }
            jsonPath("$.recentAttendances[1].attendanceStatus") { value("UNKNOWN") }
            jsonPath("$.recentAttendances[1].attended") { value(false) }
            jsonPath("$.recentAttendances[1].readingProgress") { value(40) }
            jsonPath("$.recentAttendances[*].sessionNumber") { value(not(hasItems(1201, 1204))) }
        }
}
```

Use exact fixture semantics:

```sql
-- 1201: before membership participation; no participant row
-- 1202: ACTIVE + ATTENDED + reading_progress 100
-- 1203: ACTIVE + UNKNOWN + reading_progress 40
-- 1204: REMOVED + ATTENDED; must be excluded
```

The fixture must insert one sample-club membership for `midjoin-member@example.com`, four `PUBLISHED` sessions with numbers `1201` through `1204`, active participant rows only for `1202` and `1203`, a removed participant row for `1204`, and checkins for `1202` and `1203`. It must also insert one higher-numbered active row for another membership and one for another club, then prove neither appears. Cleanup order is `reading_checkins` → `session_participants` → `sessions` → `memberships`.

- [ ] **Step 2: Update the seeded profile characterization to the corrected six rows**

Change the existing seeded expectation from sessions `2..7` to the six sessions where member5 has active participant rows:

```kotlin
jsonPath("$.recentAttendances.length()") { value(6) }
jsonPath("$.recentAttendances[*].sessionNumber") { value(listOf(1, 2, 3, 4, 5, 6)) }
jsonPath("$.recentAttendances[*].attendanceStatus") {
    value(listOf("ATTENDED", "ATTENDED", "ATTENDED", "ABSENT", "ABSENT", "ATTENDED"))
}
jsonPath("$.recentAttendances[*].attended") {
    value(listOf(true, true, true, false, false, true))
}
```

This explicitly proves that seeded session 7, which has no current-membership participant row in the MySQL fixture, is no longer manufactured as an absence.

- [ ] **Step 3: Run the focused integration test to verify RED**

Run:

```bash
./server/gradlew -p server integrationTest \
  --tests 'com.readmates.archive.api.ArchiveAndNotesDbTest'
```

Expected: FAIL because `attendanceStatus` is absent and the current left join still emits a row for sessions without a participant.

- [ ] **Step 4: Add the additive application and web fields**

Before editing, scan all repository consumers so compatibility is evidence-backed:

```bash
rg -n "recentAttendances|MyRecentAttendance|\\.attended\\b" \
  front server docs --glob '!**/build/**' --glob '!**/node_modules/**'
```

Record every consumer outside the profile contract and update only consumers that need the additive field. Do not remove or reinterpret `attended`.

Add `attendanceStatus: String` to `MyRecentAttendanceResult` and `MyRecentAttendanceItem`, then map it:

```kotlin
internal fun ResultSet.toMyRecentAttendanceResult() =
    MyRecentAttendanceResult(
        sessionNumber = getInt("session_number"),
        attended = getBoolean("attended"),
        attendanceStatus = getString("attendance_status"),
        readingProgress = getInt("reading_progress"),
    )

fun MyRecentAttendanceResult.toWebDto() =
    MyRecentAttendanceItem(
        sessionNumber = sessionNumber,
        attended = attended,
        attendanceStatus = attendanceStatus,
        readingProgress = readingProgress,
    )
```

- [ ] **Step 5: Replace the lossy left join with an eligible-participant query**

Use an inner join constrained by the current membership and `ACTIVE` participation:

```kotlin
val recentAttendances =
    jdbcTemplate.query(
        """
        select session_number, attendance_status, attended, reading_progress
        from (
          select
            sessions.number as session_number,
            session_participants.attendance_status as attendance_status,
            session_participants.attendance_status = 'ATTENDED' as attended,
            coalesce(reading_checkins.reading_progress, 0) as reading_progress
          from sessions
          join session_participants on session_participants.session_id = sessions.id
            and session_participants.club_id = sessions.club_id
            and session_participants.membership_id = ?
            and session_participants.participation_status = 'ACTIVE'
          left join reading_checkins on reading_checkins.session_id = sessions.id
            and reading_checkins.club_id = sessions.club_id
            and reading_checkins.membership_id = session_participants.membership_id
          where sessions.club_id = ?
            and sessions.state = 'PUBLISHED'
          order by sessions.number desc
          limit 6
        ) recent
        order by session_number asc
        """.trimIndent(),
        { resultSet, _ -> resultSet.toMyRecentAttendanceResult() },
        currentMember.membershipId.dbString(),
        currentMember.clubId.dbString(),
    )
```

Do not add a third query. Keep the existing profile summary query unchanged.

- [ ] **Step 6: Run the focused integration test to verify GREEN**

Run the same focused command from Step 3.

Expected: PASS, including the existing `QueryCounter.count() == 2` assertion.

- [ ] **Step 7: Run server architecture and formatting checks**

Run:

```bash
./server/gradlew -p server ktlintCheck detekt architectureTest
```

Expected: PASS.

- [ ] **Step 8: Commit the server contract**

```bash
git add \
  server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveListQueries.kt \
  server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveRowMappers.kt \
  server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt \
  server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt \
  server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt \
  server/src/test/kotlin/com/readmates/archive/api/ArchiveAndNotesDbTest.kt
git commit -m "fix(server): scope recent attendance to eligible sessions"
```

### Task 2: Build the Pure Participation Journey Model

**Files:**
- Modify: `front/features/archive/api/archive-contracts.ts:175-192`
- Modify: `front/features/archive/model/archive-model.ts:76-109`
- Modify: `front/features/archive/model/my-reading-shelf-model.ts:1-139`
- Modify: `front/features/archive/model/my-reading-shelf-model.test.ts:1-100`

**Interfaces:**
- Consumes:

```ts
export type MyRecentAttendanceStatus = "ATTENDED" | "ABSENT" | "UNKNOWN";

export type MyRecentAttendance = {
  sessionNumber: number;
  attended: boolean;
  attendanceStatus: MyRecentAttendanceStatus;
  readingProgress: number;
};
```

- Produces:

```ts
export type ParticipationTimelineItem = {
  sessionNumber: number;
  attendanceStatus: MyRecentAttendanceStatus;
  statusLabel: "참여" | "불참" | "미확인";
  readingLabel: string | null;
};

export type ParticipationJourneyViewModel = {
  hasParticipationHistory: boolean;
  achievementLabel: string;
  membershipDurationLabel: string | null;
  recentSummaryLabel: string | null;
  streakLabel: string | null;
  timelineItems: ParticipationTimelineItem[];
  nudge: {
    body: string;
    label: "이번 세션 보기";
    href: "/app/session/current";
  } | null;
  supportingStats: Array<{
    label: "완독" | "질문" | "서평";
    value: string;
  }>;
};

export function buildParticipationJourneyViewModel(input: {
  profile: Pick<
    MyPageProfile,
    "joinedAt" | "membershipStatus" | "currentSessionId" | "recentAttendances"
  >;
  summary: MyJourneySummary;
  today: Date;
}): ParticipationJourneyViewModel;
```

- [ ] **Step 1: Add the API and model status unions**

Add the same string union and row shape to `archive-contracts.ts` and `archive-model.ts`, then change each `recentAttendances` property to use that named row type. Keep `attended` required.

- [ ] **Step 2: Write failing duration and timeline-label tests**

Add exact cases:

```ts
it("formats membership duration and rejects invalid or future months", () => {
  const today = new Date(2026, 6, 15);

  expect(membershipDurationLabel("2026-07", today)).toBe("이번 달부터 함께");
  expect(membershipDurationLabel("2025-11", today)).toBe("함께한 지 8개월");
  expect(membershipDurationLabel("2024-11", today)).toBe("함께한 지 1년 8개월");
  expect(membershipDurationLabel("not-a-month", today)).toBeNull();
  expect(membershipDurationLabel("2026-08", today)).toBeNull();
});

it("maps attendance and reading progress without treating absence as progress", () => {
  expect(participationTimelineItem({
    sessionNumber: 7,
    attended: true,
    attendanceStatus: "ATTENDED",
    readingProgress: 100,
  })).toMatchObject({ statusLabel: "참여", readingLabel: "완독" });

  expect(participationTimelineItem({
    sessionNumber: 8,
    attended: false,
    attendanceStatus: "ABSENT",
    readingProgress: 40,
  })).toMatchObject({ statusLabel: "불참", readingLabel: null });

  expect(participationTimelineItem({
    sessionNumber: 9,
    attended: false,
    attendanceStatus: "UNKNOWN",
    readingProgress: 80,
  })).toMatchObject({ statusLabel: "미확인", readingLabel: null });
});
```

- [ ] **Step 3: Write failing summary, streak, empty, and nudge tests**

Use a six-row fixture with statuses:

```ts
const recentAttendances: MyRecentAttendance[] = [
  { sessionNumber: 4, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
  { sessionNumber: 5, attended: true, attendanceStatus: "ATTENDED", readingProgress: 80 },
  { sessionNumber: 6, attended: false, attendanceStatus: "ABSENT", readingProgress: 0 },
  { sessionNumber: 7, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
  { sessionNumber: 8, attended: true, attendanceStatus: "ATTENDED", readingProgress: 70 },
  { sessionNumber: 9, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
];
```

Assert:

```ts
expect(viewModel.recentSummaryLabel).toBe("최근 6회 중 5회 함께했어요");
expect(viewModel.streakLabel).toBe("현재 3회 연속 참여");
expect(viewModel.nudge).toEqual({
  body: "다음 모임에도 함께하면 4회 연속 참여가 됩니다.",
  label: "이번 세션 보기",
  href: "/app/session/current",
});
expect(viewModel.supportingStats).toEqual([
  { label: "완독", value: "7 / 9" },
  { label: "질문", value: "28" },
  { label: "서평", value: "3" },
]);
```

Also assert:

- the whole achievement remains `함께한 모임 9회` even though only five of the recent six rows are attended;
- parameterized recent lists of one through five rows retain exactly their provided length and are never padded;
- newest `UNKNOWN` produces `최근 확인된 5회 중 4회 함께했어요` and `streakLabel === null`;
- all `UNKNOWN` produces `출석 확인을 기다리고 있어요`;
- newest `ABSENT` produces no streak;
- one attended row produces no streak;
- an `UNKNOWN` between older history and two newest `ATTENDED` rows stops the backward scan and produces `현재 2회 연속 참여`;
- empty history plus zero summary sets `hasParticipationHistory === false`;
- empty participation with a nonzero question or review retains that nonzero supporting stat;
- `INVITED`, `VIEWER`, `SUSPENDED`, `LEFT`, `INACTIVE`, or no current session produces `nudge === null`;
- `ACTIVE` with a current session and no streak uses `다음 모임부터 새로운 참여 흐름을 이어가 보세요.`;
- only the provided two mid-join rows produce `최근 2회 중 2회 함께했어요`.

- [ ] **Step 4: Run the model test to verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/model/my-reading-shelf-model.test.ts
```

Expected: FAIL because the new types and functions do not exist.

- [ ] **Step 5: Implement the minimal pure model**

Implement month-difference validation with numeric year/month parsing and `today.getFullYear()` / `today.getMonth()`. Build the view model with these exact rules:

```ts
const confirmed = rows.filter((row) => row.attendanceStatus !== "UNKNOWN");
const recentAttended = confirmed.filter((row) => row.attendanceStatus === "ATTENDED").length;
const hasUnknown = rows.some((row) => row.attendanceStatus === "UNKNOWN");

const recentSummaryLabel =
  rows.length === 0
    ? null
    : confirmed.length === 0
      ? "출석 확인을 기다리고 있어요"
      : hasUnknown
        ? `최근 확인된 ${confirmed.length}회 중 ${recentAttended}회 함께했어요`
        : `최근 ${confirmed.length}회 중 ${recentAttended}회 함께했어요`;
```

Compute the streak from the newest row backward. Stop at the first non-`ATTENDED` row and expose a label only when the count is at least 2.

Set `hasParticipationHistory` when either the whole summary reports at least one attended session or at least one eligible recent row exists. Set `achievementLabel` only from `summary.attendedSessionCount`; never derive the whole achievement from the six-row window.

For each timeline row, map reading progress exactly as follows: only `ATTENDED` may show it; `>= 100` is `완독`, `1..99` is `${readingProgress}%`, and `<= 0`, `ABSENT`, or `UNKNOWN` yields no reading label. Add focused assertions for attended values `0`, `40`, and `100`.

Build supporting stats as:

```ts
const allSupportingStats = [
  {
    label: "완독" as const,
    value: `${summary.completedReadingCount} / ${summary.attendedSessionCount}`,
    count: summary.attendedSessionCount,
  },
  { label: "질문" as const, value: String(summary.questionCount), count: summary.questionCount },
  { label: "서평" as const, value: String(summary.reviewCount), count: summary.reviewCount },
];

const supportingStats = hasParticipationHistory
  ? allSupportingStats.map(({ label, value }) => ({ label, value }))
  : allSupportingStats
      .filter(({ count }) => count > 0)
      .map(({ label, value }) => ({ label, value }));
```

- [ ] **Step 6: Run the model test to verify GREEN**

Run the same focused Vitest command from Step 4.

Expected: PASS.

- [ ] **Step 7: Run the frontend boundary test**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  tests/unit/frontend-boundaries.test.ts
```

Expected: PASS; the pure model imports no React, router, API client, or query module.

- [ ] **Step 8: Commit the contract and model**

```bash
git add \
  front/features/archive/api/archive-contracts.ts \
  front/features/archive/model/archive-model.ts \
  front/features/archive/model/my-reading-shelf-model.ts \
  front/features/archive/model/my-reading-shelf-model.test.ts
git commit -m "feat(front): model member participation journey"
```

### Task 3: Add the Presentational Participation Components

**Files:**
- Create: `front/features/archive/ui/my-page/participation-timeline.tsx`
- Create: `front/features/archive/ui/my-page/participation-timeline.test.tsx`
- Create: `front/features/archive/ui/my-page/participation-achievement.tsx`
- Create: `front/features/archive/ui/my-page/participation-nudge.tsx`
- Create: `front/features/archive/ui/my-page/supporting-reading-stats.tsx`
- Create: `front/features/archive/ui/my-page/participation-journey.tsx`
- Create: `front/features/archive/ui/my-page/participation-journey.test.tsx`
- Create: `front/features/archive/ui/my-page/member-space-account-actions.tsx`
- Modify: `front/src/styles/globals.css:5729-5839`
- Modify: `front/src/styles/globals.css:6378-6467`

**Interfaces:**
- Consumes: `ParticipationJourneyViewModel` and a route-injected `ReactNode`.
- Produces:

```ts
export function ParticipationTimeline(props: {
  summaryLabel: string;
  streakLabel: string | null;
  items: ParticipationTimelineItem[];
}): ReactElement;

export function ParticipationAchievement(props: {
  achievementLabel: string;
  membershipDurationLabel: string | null;
}): ReactElement;

export function ParticipationNudge(props: {
  nudge: NonNullable<ParticipationJourneyViewModel["nudge"]>;
}): ReactElement;

export function SupportingReadingStats(props: {
  stats: ParticipationJourneyViewModel["supportingStats"];
}): ReactElement;

export function ParticipationJourney(props: {
  viewModel: ParticipationJourneyViewModel;
}): ReactElement;

export function MemberSpaceAccountActions(props: {
  logoutControl: ReactNode;
}): ReactElement;
```

- [ ] **Step 1: Write the failing timeline component test**

Render three rows and assert visible, non-color-only states:

```tsx
render(
  <ParticipationTimeline
    summaryLabel="최근 확인된 2회 중 1회 함께했어요"
    streakLabel={null}
    items={[
      {
        sessionNumber: 7,
        attendanceStatus: "ATTENDED",
        statusLabel: "참여",
        readingLabel: "완독",
      },
      {
        sessionNumber: 8,
        attendanceStatus: "ABSENT",
        statusLabel: "불참",
        readingLabel: null,
      },
      {
        sessionNumber: 9,
        attendanceStatus: "UNKNOWN",
        statusLabel: "미확인",
        readingLabel: null,
      },
    ]}
  />,
);

expect(screen.getByRole("list", { name: "최근 참여 대상 회차" })).toBeVisible();
expect(screen.getByText("7차")).toBeVisible();
expect(screen.getByText("참여")).toBeVisible();
expect(screen.getByText("완독")).toBeVisible();
expect(screen.getByText("불참")).toBeVisible();
expect(screen.getByText("미확인")).toBeVisible();
```

- [ ] **Step 2: Write the failing journey hierarchy and empty-state tests**

For history, assert the order and actions:

```tsx
expect(screen.getByText("함께한 모임 9회")).toBeVisible();
expect(screen.getByText("함께한 지 1년 8개월")).toBeVisible();
expect(screen.getByRole("list", { name: "최근 참여 대상 회차" })).toBeVisible();
expect(screen.getByText("완독")).toBeVisible();
expect(screen.getByText("질문")).toBeVisible();
expect(screen.getByText("서평")).toBeVisible();
expect(screen.getByRole("link", { name: "이번 세션 보기" })).toHaveAttribute(
  "href",
  "/app/session/current",
);
expect(screen.getByRole("link", { name: "내 책별 기록 전체 보기" })).toHaveAttribute(
  "href",
  "/app/me/records",
);
```

For no history, assert `첫 참여부터 이곳에 흐름이 쌓여요`, no zero-filled timeline, and retention of any nonzero question or review supporting stat.

- [ ] **Step 3: Run the focused component tests to verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/participation-timeline.test.tsx \
  features/archive/ui/my-page/participation-journey.test.tsx
```

Expected: FAIL because the components do not exist.

- [ ] **Step 4: Implement the semantic timeline**

Use a section, heading, and ordered list. Each row must contain visible session number, status text, and optional reading text:

```tsx
<section className="rm-participation-timeline" aria-labelledby="participation-timeline-heading">
  <div className="rm-participation-timeline__heading">
    <div>
      <p className="rm-participation-overline">최근 참여 흐름</p>
      <h2 id="participation-timeline-heading">{summaryLabel}</h2>
    </div>
    {streakLabel ? <p className="rm-participation-streak">{streakLabel}</p> : null}
  </div>
  <ol className="rm-participation-timeline__list" aria-label="최근 참여 대상 회차">
    {items.map((item) => (
      <li key={item.sessionNumber} data-attendance-status={item.attendanceStatus}>
        <span className="rm-participation-timeline__marker" aria-hidden>
          {item.attendanceStatus === "ATTENDED" ? "✓" : item.attendanceStatus === "ABSENT" ? "–" : "?"}
        </span>
        <span className="rm-participation-timeline__session">{item.sessionNumber}차</span>
        <span className="rm-participation-timeline__status">{item.statusLabel}</span>
        {item.readingLabel ? (
          <span className="rm-participation-timeline__reading">{item.readingLabel}</span>
        ) : null}
      </li>
    ))}
  </ol>
</section>
```

- [ ] **Step 5: Implement the journey and account sections**

The journey must render this order:

```tsx
<section className="rm-participation-achievement" aria-labelledby="participation-achievement-heading">
  <p className="rm-participation-overline">전체 기록</p>
  <h2 id="participation-achievement-heading">{viewModel.achievementLabel}</h2>
  {viewModel.membershipDurationLabel ? <p>{viewModel.membershipDurationLabel}</p> : null}
</section>
```

Implement `ParticipationAchievement`, `ParticipationNudge`, and `SupportingReadingStats` in their named files, then have `ParticipationJourney` render achievement, timeline, nudge, supporting `dl`, and the scoped `Link` to `/app/me/records` in that order. The nudge component receives only the non-null, already-authorized model value and does not reimplement membership rules. When `hasParticipationHistory` is false, render the approved empty heading instead of the achievement and timeline. Render `MemberSpaceAccountActions` as:

```tsx
<section className="rm-member-space-account-actions" aria-labelledby="member-space-account-heading">
  <div>
    <h2 id="member-space-account-heading">계정</h2>
    <p>현재 기기에서 ReadMates 사용을 마칩니다.</p>
  </div>
  <div className="rm-member-space-account-actions__control">{logoutControl}</div>
</section>
```

- [ ] **Step 6: Add desktop and mobile CSS**

Replace the old summary/recent-preview declarations with:

- centered `820px` single-column page;
- achievement separated by editorial rules, not a card;
- six-column timeline grid on desktop and mobile;
- visible status text under each marker;
- unknown and absent selectors that remain distinguishable without color;
- nudge with a quiet paper surface and 44px link;
- three-column supporting `dl`;
- desktop account row and mobile stacked full-width logout control;
- `overflow-wrap: anywhere`, `min-width: 0`, and no horizontal scrolling at 320px;
- visible `:focus-visible` for the record, session, and logout controls.

Do not add gradients, glass, glow, or motion.

- [ ] **Step 7: Run focused component tests to verify GREEN**

Run the same command from Step 3.

Expected: PASS.

- [ ] **Step 8: Commit the presentational units**

```bash
git add \
  front/features/archive/ui/my-page/participation-timeline.tsx \
  front/features/archive/ui/my-page/participation-timeline.test.tsx \
  front/features/archive/ui/my-page/participation-achievement.tsx \
  front/features/archive/ui/my-page/participation-nudge.tsx \
  front/features/archive/ui/my-page/supporting-reading-stats.tsx \
  front/features/archive/ui/my-page/participation-journey.tsx \
  front/features/archive/ui/my-page/participation-journey.test.tsx \
  front/features/archive/ui/my-page/member-space-account-actions.tsx \
  front/src/styles/globals.css
git commit -m "feat(front): add participation journey presentation"
```

### Task 4: Integrate the Route, Limit Summary Loading, and Add Logout

**Files:**
- Modify: `front/features/archive/route/my-page-data.ts:20-36`
- Modify: `front/features/archive/route/my-page-data.test.ts:77-128`
- Modify: `front/features/archive/route/my-page-route.tsx:1-9`
- Create: `front/features/archive/route/my-page-route.test.tsx`
- Modify: `front/features/archive/ui/my-page.tsx:1-12`
- Modify: `front/features/archive/ui/my-page/my-reading-shelf.tsx:1-47`
- Modify: `front/tests/unit/my-page.test.tsx:1-97`
- Delete: `front/features/archive/ui/my-page/recent-book-records.tsx`
- Delete: `front/features/archive/ui/my-page/recent-book-records.test.tsx`
- Delete: `front/features/archive/ui/my-page/my-reading-summary.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: `buildParticipationJourneyViewModel`, `ParticipationJourney`, `MemberSpaceAccountActions`, and `LogoutButton`.
- Produces:

```ts
type MyPageProps = {
  viewModel: ParticipationJourneyViewModel;
  logoutControl: ReactNode;
};
```

- [ ] **Step 1: Change the loader test to require a summary-only first page**

Rename the loader test and require:

```ts
it("loads the profile and one journey item only to obtain the exact summary", async () => {
  await expect(myPageLoader()).resolves.toEqual({ profile, journey });
  expect(api.fetchMyPage).toHaveBeenCalledWith({ clubSlug: undefined });
  expect(api.fetchMyJourney).toHaveBeenCalledWith(
    { clubSlug: undefined },
    { limit: 1 },
  );
});
```

- [ ] **Step 2: Write a failing route integration test**

Create a co-located route test that mocks only `useLoaderData`, the auth API, and the clock. Render `MyPageRoute` inside `MemoryRouter`.

Assert:

```tsx
expect(screen.getByText("함께한 모임 9회")).toBeVisible();
expect(screen.getByRole("button", { name: "로그아웃" })).toBeVisible();
expect(screen.queryByRole("heading", { name: "최근 책별 기록" })).toBeNull();
```

Add logout cases:

```ts
it.each([204, 401])("redirects member-space logout to public home for %s", async (status) => {
  vi.mocked(logout).mockResolvedValue(new Response(null, { status }));
  const location = { href: "" };
  vi.stubGlobal("location", location);

  await user.click(screen.getByRole("button", { name: "로그아웃" }));

  await waitFor(() => expect(location.href).toBe("/"));
});
```

For status 500, assert the inline alert and unchanged `location.href`. For a pending promise, double-click and assert one auth request plus a disabled `로그아웃 중` button.

- [ ] **Step 3: Run focused route/page tests to verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/route/my-page-data.test.ts \
  features/archive/route/my-page-route.test.tsx \
  tests/unit/my-page.test.tsx
```

Expected: FAIL because the loader still requests three items and the route does not build the view model or inject logout.

- [ ] **Step 4: Change the loader to `limit: 1`**

Implement:

```ts
const [profile, journey] = await Promise.all([
  fetchMyPage(context),
  fetchMyJourney(context, { limit: 1 }),
]);
```

Keep profile and journey required. Preserve the inactive path and its zeroed `recentAttendances`.

- [ ] **Step 5: Compose the view model and existing logout at the route boundary**

Implement:

```tsx
export function MyPageRoute() {
  const { profile, journey } = useLoaderData() as MyPageRouteData;
  const viewModel = buildParticipationJourneyViewModel({
    profile,
    summary: journey.summary,
    today: new Date(),
  });

  return (
    <MyPage
      viewModel={viewModel}
      logoutControl={
        <LogoutButton className="rm-member-space-logout" redirectHref="/">
          로그아웃
        </LogoutButton>
      }
    />
  );
}
```

`MyPage` and `MyReadingShelf` must accept only the computed view model and the injected control. Neither presentation file may import an API, query, route, or auth module.

- [ ] **Step 6: Replace the old shelf integration and remove obsolete files**

`MyReadingShelf` renders:

```tsx
<main className="rm-my-shelf">
  <header className="rm-my-shelf-header">
    <div>
      <p className="rm-my-shelf-kicker">내 공간</p>
      <h1>나의 서재</h1>
      <p>함께 읽어 온 시간과 나의 참여 흐름을 돌아보세요.</p>
    </div>
  </header>
  <ParticipationJourney viewModel={viewModel} />
  <MemberSpaceAccountActions logoutControl={logoutControl} />
</main>
```

Delete `RecentBookRecords`, its test, and `MyReadingSummary`. Remove their obsolete CSS selectors while retaining shared record-row CSS used by `/app/me/records`.

- [ ] **Step 7: Run the focused tests to verify GREEN**

Run the command from Step 3 plus:

```bash
corepack pnpm --dir front exec vitest run \
  features/archive/ui/my-page/participation-timeline.test.tsx \
  features/archive/ui/my-page/participation-journey.test.tsx \
  features/auth/route/account-menu-controller.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run frontend lint and boundary checks**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit the route integration**

```bash
git add -A \
  front/features/archive/route \
  front/features/archive/ui/my-page.tsx \
  front/features/archive/ui/my-page \
  front/tests/unit/my-page.test.tsx \
  front/src/styles/globals.css
git commit -m "feat(front): replace recent books with participation journey"
```

### Task 5: Prove Mid-Join, Responsive, Navigation, and Logout Behavior in the Browser

**Files:**
- Modify: `front/tests/e2e/my-reading-shelf-fixtures.ts:1-166`
- Modify: `front/tests/e2e/member-space-information-architecture.spec.ts:1-163`
- Modify: `front/tests/e2e/member-profile-permissions.spec.ts:98-108`

**Interfaces:**
- Consumes: `/api/bff/api/app/me`, `/api/bff/api/archive/me/journey`, `/app/session/current`, `/app/me/records`, and `/api/bff/api/auth/logout`.
- Produces:

```ts
type ParticipationProfileMode = "history" | "mid-join" | "unknown" | "empty";

export async function mockMemberParticipationProfile(
  page: Page,
  mode: ParticipationProfileMode,
): Promise<void>;
```

- [ ] **Step 1: Add deterministic public-safe profile fixtures**

Route `**/api/bff/api/app/me**` and return a common profile with mode-specific recent rows.

`history`:

```ts
recentAttendances: [
  { sessionNumber: 4, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
  { sessionNumber: 5, attended: true, attendanceStatus: "ATTENDED", readingProgress: 80 },
  { sessionNumber: 6, attended: false, attendanceStatus: "ABSENT", readingProgress: 0 },
  { sessionNumber: 7, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
  { sessionNumber: 8, attended: true, attendanceStatus: "ATTENDED", readingProgress: 70 },
  { sessionNumber: 9, attended: true, attendanceStatus: "ATTENDED", readingProgress: 100 },
]
```

`mid-join` contains only sessions 8 and 9, both attended. `unknown` ends with session 9 as `UNKNOWN`. `empty` has no rows, zero session count, and retains the caller-selected current-session ID.

- [ ] **Step 2: Replace the recent-book E2E assertions**

Update the first test to:

```ts
test("member shelf shows participation journey and opens the full personal history", async ({ page }) => {
  await mockMemberParticipationProfile(page, "history");
  await mockMyReadingShelfJourney(page, "fifteen-records");
  await loginWithGoogleFixture(page, memberEmail);
  await page.goto("/app/me");

  await expect(page.getByRole("heading", { level: 1, name: "나의 서재" })).toBeVisible();
  await expect(page.getByText("최근 6회 중 5회 함께했어요")).toBeVisible();
  await expect(page.getByText("현재 3회 연속 참여")).toBeVisible();
  await expect(page.getByRole("heading", { name: "최근 책별 기록" })).toHaveCount(0);

  await page.getByRole("link", { name: "내 책별 기록 전체 보기" }).click();
  await expect(page).toHaveURL(/\/app\/me\/records$/);
});
```

Keep the existing `/app/me/records` 12-row first page and 15-row load-more assertions after navigation.

- [ ] **Step 3: Replace row-geometry coverage with responsive participation coverage**

For `1280x900`, `390x844`, and `320x700`:

- assert exactly one `최근 참여 대상 회차` list;
- assert the page has no horizontal overflow;
- assert all six session numbers and visible status text;
- assert `이번 세션 보기`, `내 책별 기록 전체 보기`, and `로그아웃` have practical 44px targets;
- tab to each action and assert `document.activeElement`;
- add a 200% zoom-equivalent Chromium check at a 640px viewport and assert semantic order plus no horizontal overflow;
- save screenshots with `testInfo.outputPath(...)`, not tracked repository paths.

- [ ] **Step 4: Add mid-join and unknown browser cases**

Mid-join:

```ts
await expect(page.getByText("최근 2회 중 2회 함께했어요")).toBeVisible();
await expect(page.getByText("8차")).toBeVisible();
await expect(page.getByText("9차")).toBeVisible();
await expect(page.getByText("7차")).toHaveCount(0);
```

Unknown:

```ts
await expect(page.getByText("최근 확인된 5회 중 4회 함께했어요")).toBeVisible();
await expect(page.getByText("미확인")).toBeVisible();
await expect(page.getByText(/현재 \\d+회 연속 참여/)).toHaveCount(0);
```

- [ ] **Step 5: Update empty and permission coverage**

In `member-profile-permissions.spec.ts`, mock both the empty journey summary and the empty profile. Assert:

- `첫 참여부터 이곳에 흐름이 쌓여요`;
- active member/host with current session sees `이번 세션 보기`;
- viewer does not see the participation CTA;
- zero-filled timeline and zero metric grid do not render.

In an active-current-session case, click `이번 세션 보기` and assert navigation to `/app/session/current`. This keeps the approved member-space-to-current-session user flow in browser evidence without duplicating the home page's RSVP or progress assertions.

- [ ] **Step 6: Add member-space logout browser evidence**

From `/app/me`, click the bottom `로그아웃` button, wait for the logout response, and assert URL `/` plus an unauthenticated public-home landmark. Do not call a live mail, AI, provider, or production endpoint.

- [ ] **Step 7: Run focused Playwright tests**

Run:

```bash
corepack pnpm --dir front exec playwright test \
  tests/e2e/member-space-information-architecture.spec.ts \
  tests/e2e/member-profile-permissions.spec.ts
```

Expected: PASS at desktop and mobile projects configured by the repository.

- [ ] **Step 8: Commit browser evidence**

```bash
git add \
  front/tests/e2e/my-reading-shelf-fixtures.ts \
  front/tests/e2e/member-space-information-architecture.spec.ts \
  front/tests/e2e/member-profile-permissions.spec.ts
git commit -m "test(front): prove member participation journey"
```

Do not add `test-results`, screenshots, traces, videos, reports, `.tmp`, or `.superpowers` artifacts.

### Task 6: Synchronize Active Docs and Run Canonical Gates

**Files:**
- Modify: `docs/development/architecture.md:337-345`
- Modify: `CHANGELOG.md:7-20`

**Interfaces:**
- Consumes: final implementation and test behavior from Tasks 1-5.
- Produces: current active documentation and final HEAD evidence.

- [ ] **Step 1: Update active architecture**

Replace the stale `/app/me` and logout paragraphs with facts matching the final code:

- `/app/me` loads profile plus `limit=1` journey for the exact whole-summary;
- recent attendance rows are current-club/current-membership active-participant `PUBLISHED` sessions, maximum six;
- `attendanceStatus` preserves `ATTENDED`/`ABSENT`/`UNKNOWN` while `attended` remains compatible;
- the page renders whole achievement, participation timeline, nudge, supporting stats, full-record link, and bottom logout;
- `/app/me/records` remains the only full personal book list;
- `/app/me/settings` and `/app/notifications/settings` retain their existing responsibilities;
- global account-menu logout remains available, and `/app/me` now also provides the approved bottom logout.

- [ ] **Step 2: Update Unreleased CHANGELOG**

Change the Highlights entry from “recent three books” to the participation journey. Change the route-split entry so it no longer claims logout exists only in the global account menu. Add the mid-join/unknown correctness fix under `### Fixed`.

- [ ] **Step 3: Run docs formatting and public-safety scans**

Run:

```bash
git diff --check -- CHANGELOG.md docs/development/architecture.md
if rg -n \
  '(^|[^A-Za-z0-9_])([o]cid1\\.|/[U]sers/|/[Hh]ome/[^[:space:]]+|[s]k-[A-Za-z0-9]|[g]hp_[A-Za-z0-9]|[g]ithub_pat_|BEGIN (RSA|OPENSSH|PRIVATE) [K]EY)' \
  CHANGELOG.md docs/development/architecture.md
then
  exit 1
fi
```

Expected: no findings.

- [ ] **Step 4: Commit the active docs**

```bash
git add CHANGELOG.md docs/development/architecture.md
git commit -m "docs: document member participation journey"
```

- [ ] **Step 5: Run canonical server gates at final HEAD**

Run:

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest
```

Expected: PASS.

- [ ] **Step 6: Run canonical frontend gates at final HEAD**

Run:

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
corepack pnpm --dir front test:e2e
```

Expected: PASS. Record exact test counts and any existing non-blocking build warning separately from failures.

- [ ] **Step 7: Run final boundary, diff, and repository checks**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
git diff --check HEAD~6..HEAD
git status --short --branch --untracked-files=all
```

Expected:

- frontend boundary test passes;
- no whitespace errors;
- no tracked or untracked implementation artifacts;
- only the intended feature commits are ahead of the execution base.

- [ ] **Step 8: Record final evidence and residual risk**

The handoff must state:

- changed surfaces: server archive read projection, frontend member-space route/model/UI, E2E, active docs;
- exact commands and results actually run;
- repository-only/local Testcontainers/browser evidence, not live production evidence;
- no migration, BFF, deploy, provider, email, or production mutation;
- whether the existing `attended` compatibility field has any repository consumer outside the updated profile contract;
- any skipped command with its reason;
- no push, PR, tag, deploy, or production smoke unless separately authorized.
