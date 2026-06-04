# Member Reading Experience (M-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add current-session reading pace (frontend-only pure model) and an honest my-page reading journey (cumulative summary, real reading-completion rate, per-book history, recent timeline) by extending the existing my-page read path.

**Architecture:** Slice 1 is a pure-function pace derivation in `shared/model` (reuses `reading-loop`'s date pattern; no server change). Slice 2 extends `MyPageResponse` with honest per-session reading completion (server LEFT JOIN to `reading_checkins`) and derives the four journey views in pure frontend models from data my-page already fetches. Member-only; no host/admin surface or new server slice.

**Tech Stack:** React 18 + Vite + TypeScript (frontend), Vitest, Kotlin/Spring Boot + JdbcTemplate (server), MySQL, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-06-04-readmates-member-reading-experience-design.md`

---

## Background facts (verified against current code)

- `reading-loop.ts` already derives loop state and a next action; `member-home-view-model.ts` surfaces it. Pace augments, not replaces.
- Current session contract (`front/shared/model/current-session-contracts.ts`) exposes `currentSession.myCheckin.readingProgress` (0–100) and `currentSession.date` (`YYYY-MM-DD`). No reading-start anchor exists, so pace is a function of `(daysRemaining, progress)` only.
- `MyPageResponse` (front `features/archive/api/archive-contracts.ts`) and `MyPageProfile` (front `features/archive/model/archive-model.ts`) are structurally identical; `my-page-route.tsx` passes `routeData.data` straight into `<MyPage data=...>`. Extending both types threads through automatically.
- `my-page-data.ts` already fetches `MyArchiveQuestionPage` and `MyArchiveReviewPage` (each item has `sessionNumber`, `bookTitle`, `date`, `text`) but only passes their **counts** to the UI. The journey per-book/timeline views need the **items** threaded through.
- **Honesty bug to fix:** `RhythmSection` (`front/features/archive/ui/my-page/my-page-sections.tsx`) labels `attendanceSummary(data).rate` (= `sessionCount/totalSessionCount`, an *attendance* rate) as "완독률". This is the dishonest proxy the spec forbids. We add a real completion rate and correct the labels.
- Server chain for my-page: `MyPageController` → `GetMyPageSummaryUseCase` → `ArchiveQueryService.getMyPageSummary` → `LoadArchiveDataPort.loadMyPage` → `JdbcArchiveQueryAdapter` → `ArchiveListQueries.loadMyPage` (builds `MyPageResult`/`MyRecentAttendanceResult` via JdbcTemplate). Web DTOs in `ArchiveWebDtos.kt`, mapper in `ArchiveWebMapper.kt`.
- `reading_checkins` table has `reading_progress` (Int 0–100), keyed by session + membership (confirmed by `JdbcArchiveDetailBatchReadAdapter` which selects `reading_checkins.reading_progress`).

---

## Phase A — Slice 1: Current-session reading pace (frontend only)

### Task A1: `reading-pace.ts` pure model + tests

**Files:**
- Create: `front/shared/model/reading-pace.ts`
- Test: `front/shared/model/reading-pace.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// front/shared/model/reading-pace.test.ts
import { describe, expect, it } from "vitest";
import { deriveReadingPace } from "./reading-pace";

const today = new Date(2026, 5, 4); // 2026-06-04 local

describe("deriveReadingPace", () => {
  it("returns COMPLETED when progress is 100 regardless of date", () => {
    const pace = deriveReadingPace({ readingProgress: 100, sessionDate: "2026-06-05", today });
    expect(pace.tier).toBe("COMPLETED");
    expect(pace.daysRemaining).toBe(1);
  });

  it("returns ON_TRACK (neutral) with no/invalid date", () => {
    expect(deriveReadingPace({ readingProgress: 40, sessionDate: null, today }).tier).toBe("ON_TRACK");
    expect(deriveReadingPace({ readingProgress: 40, sessionDate: "nope", today }).daysRemaining).toBeNull();
  });

  it("returns AMPLE when deadline is far (> 5 days)", () => {
    expect(deriveReadingPace({ readingProgress: 5, sessionDate: "2026-06-12", today }).tier).toBe("AMPLE");
  });

  it("returns ON_TRACK for a moderate window (4-5 days)", () => {
    expect(deriveReadingPace({ readingProgress: 10, sessionDate: "2026-06-08", today }).tier).toBe("ON_TRACK");
  });

  it("near deadline (<= 3 days) splits by progress", () => {
    expect(deriveReadingPace({ readingProgress: 30, sessionDate: "2026-06-06", today }).tier).toBe("URGENT");
    expect(deriveReadingPace({ readingProgress: 60, sessionDate: "2026-06-06", today }).tier).toBe("TIGHT");
    expect(deriveReadingPace({ readingProgress: 90, sessionDate: "2026-06-06", today }).tier).toBe("ON_TRACK");
  });

  it("treats a passed deadline as near-deadline bucket", () => {
    expect(deriveReadingPace({ readingProgress: 30, sessionDate: "2026-06-01", today }).tier).toBe("URGENT");
  });

  it("provides a label and message for every tier", () => {
    for (const date of ["2026-06-12", "2026-06-08", "2026-06-06", null]) {
      const pace = deriveReadingPace({ readingProgress: 30, sessionDate: date, today });
      expect(pace.label.length).toBeGreaterThan(0);
      expect(pace.message.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir front test -- reading-pace`
Expected: FAIL ("Cannot find module './reading-pace'").

- [ ] **Step 3: Write minimal implementation**

```ts
// front/shared/model/reading-pace.ts
export type ReadingPaceTier = "COMPLETED" | "ON_TRACK" | "TIGHT" | "URGENT" | "AMPLE";

export type ReadingPaceInput = {
  readingProgress: number; // 0..100
  sessionDate: string | null | undefined; // YYYY-MM-DD (deadline = meeting day)
  today?: Date;
};

export type ReadingPace = {
  tier: ReadingPaceTier;
  daysRemaining: number | null;
  label: string;
  message: string;
};

const NEAR_DEADLINE_DAYS = 3;
const AMPLE_DAYS = 5;
const URGENT_PROGRESS = 50;
const TIGHT_PROGRESS = 80;

const PACE_LABELS: Record<ReadingPaceTier, string> = {
  COMPLETED: "완독",
  ON_TRACK: "순조",
  TIGHT: "촉박",
  URGENT: "서둘러요",
  AMPLE: "여유",
};

const PACE_MESSAGES: Record<ReadingPaceTier, string> = {
  COMPLETED: "이번 책을 다 읽었어요. 모임을 기다리면 됩니다.",
  ON_TRACK: "지금 페이스면 모임 전까지 무리 없어요.",
  TIGHT: "모임이 가까워요. 남은 분량을 조금씩 당겨 읽어요.",
  URGENT: "모임이 곧이라 속도를 올려야 해요.",
  AMPLE: "아직 시간이 넉넉해요. 편하게 읽어 나가세요.",
};

function daysUntil(sessionDate: string | null | undefined, today: Date): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate ?? "");
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - current.getTime()) / 86_400_000);
}

function tierFor(progress: number, daysRemaining: number | null): ReadingPaceTier {
  if (progress >= 100) {
    return "COMPLETED";
  }
  if (daysRemaining === null) {
    return "ON_TRACK";
  }
  if (daysRemaining <= NEAR_DEADLINE_DAYS) {
    if (progress < URGENT_PROGRESS) return "URGENT";
    if (progress < TIGHT_PROGRESS) return "TIGHT";
    return "ON_TRACK";
  }
  if (daysRemaining > AMPLE_DAYS) {
    return "AMPLE";
  }
  return "ON_TRACK";
}

export function deriveReadingPace(input: ReadingPaceInput): ReadingPace {
  const today = input.today ?? new Date();
  const daysRemaining = daysUntil(input.sessionDate, today);
  const tier = tierFor(input.readingProgress, daysRemaining);
  return { tier, daysRemaining, label: PACE_LABELS[tier], message: PACE_MESSAGES[tier] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir front test -- reading-pace`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add front/shared/model/reading-pace.ts front/shared/model/reading-pace.test.ts
git commit -m "feat(front): add reading-pace pure model"
```

### Task A2: Surface pace in member-home next-action model

**Files:**
- Modify: `front/features/member-home/model/member-home-view-model.ts`
- Test: `front/features/member-home/model/member-home-view-model.test.ts`

- [ ] **Step 1: Add a failing test** that asserts pace is attached when the member can write and a checkin exists.

```ts
// append to member-home-view-model.test.ts
import { getMemberHomeNextReadingAction } from "./member-home-view-model";

it("attaches reading pace when member can write and has a checkin", () => {
  const session = {
    // reuse the existing test's session factory if present; otherwise minimal shape:
    date: "2026-06-06",
    myRsvpStatus: "GOING",
    myCheckin: { readingProgress: 30 },
    myQuestions: [{ priority: 1 }, { priority: 2 }],
    myOneLineReview: null,
    myLongReview: null,
  } as never;
  const action = getMemberHomeNextReadingAction({
    session,
    isViewer: false,
    canWrite: true,
    today: new Date(2026, 5, 4),
  });
  expect(action.pace?.tier).toBe("URGENT");
});

it("leaves pace null when there is no session", () => {
  const action = getMemberHomeNextReadingAction({ session: null, isViewer: false, canWrite: true });
  expect(action.pace).toBeNull();
});
```

(If the existing test file already builds a session fixture, reuse that factory instead of the inline `as never` object so the shape stays in sync.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir front test -- member-home-view-model`
Expected: FAIL (`pace` is not on the return type).

- [ ] **Step 3: Implement** — add a `pace` field to `MemberHomeNextReadingAction` and compute it.

In `member-home-view-model.ts`:
- Add import: `import { deriveReadingPace, type ReadingPace } from "@/shared/model/reading-pace";`
- Add `pace: ReadingPace | null;` to the `MemberHomeNextReadingAction` type.
- Compute once near the top of `getMemberHomeNextReadingAction`, after deriving `state`:

```ts
const pace =
  session && canWrite && (state === "MEMBER_PREP_REQUIRED" || state === "SESSION_READY")
    ? deriveReadingPace({ readingProgress: session.myCheckin?.readingProgress ?? 0, sessionDate: session.date, today })
    : null;
```

- Add `pace` to **every** returned object in the function (the no-session early return and the viewer/prep/reflection/archive/default returns). For the no-session and viewer returns set `pace: null`; for the rest set `pace`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --dir front test -- member-home-view-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/member-home/model/member-home-view-model.ts front/features/member-home/model/member-home-view-model.test.ts
git commit -m "feat(front): attach reading pace to member-home next action"
```

### Task A3: Render pace in member-home and current-session UI

**Files:**
- Modify: `front/features/member-home/ui/member-home-current-session.tsx` (or `prep-card.tsx` — whichever renders the next-action message; confirm by reading the file)
- Modify: `front/features/current-session/ui/current-session-panels.tsx` (member checkin panel) and `front/features/current-session/ui/mobile/mobile-prep-segment.tsx`
- Test: co-located `*.test.tsx` for the member-home component that shows the action.

- [ ] **Step 1: Read** the member-home component that consumes `getMemberHomeNextReadingAction(...)` and the current-session checkin panels to find where `readingProgress` is shown. Identify the JSX insertion point near the progress control.

- [ ] **Step 2: Write a failing render test** for the member-home component asserting the pace message text appears when pace tier is URGENT.

```tsx
// in the member-home component's co-located test
import { render, screen } from "@testing-library/react";
// ...render the component with a view whose current session yields URGENT pace...
expect(screen.getByText(/속도를 올려야/)).toBeInTheDocument();
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --dir front test -- member-home-current-session` (adjust to the actual file name)
Expected: FAIL (text not rendered).

- [ ] **Step 4: Implement** — render a small pace badge + message.

Add a presentational helper (no new file needed) that renders `action.pace` when non-null: a badge showing `pace.label` and a one-line `pace.message`. Use existing tone classes (e.g., `tiny`, `small`, `surface-quiet`) consistent with the surrounding cards. Map tier → accent for color but **always include the text label** (never color-only; H baseline a11y rule). In current-session panels, render the same badge near the reading-progress input using `deriveReadingPace({ readingProgress: myCheckin?.readingProgress ?? 0, sessionDate: currentSession.date })`.

- [ ] **Step 5: Run to verify it passes + lint**

Run: `pnpm --dir front test -- member-home-current-session && pnpm --dir front lint`
Expected: PASS / no lint errors.

- [ ] **Step 6: Commit**

```bash
git add front/features/member-home front/features/current-session
git commit -m "feat(front): show reading pace on member-home and current session"
```

---

## Phase B — Slice 2 server: honest reading-completion in MyPageResponse

### Task B1: Extend application + web models with reading completion

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt` (`MyPageResult`, `MyRecentAttendanceResult`)
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt` (`MyPageResponse`, `MyRecentAttendanceItem`)
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt` (`MyPageResult.toWebDto`, `MyRecentAttendanceResult.toWebDto`)

- [ ] **Step 1: Add fields (no behavior yet).**

In `ArchiveResults.kt`:
- `MyRecentAttendanceResult`: add `val readingProgress: Int` (0 when no checkin).
- `MyPageResult`: add `val completedReadingCount: Int`.

In `ArchiveWebDtos.kt`:
- `MyRecentAttendanceItem`: add `val readingProgress: Int`.
- `MyPageResponse`: add `val completedReadingCount: Int`.

In `ArchiveWebMapper.kt`:
- `MyRecentAttendanceResult.toWebDto()`: add `readingProgress = readingProgress`.
- `MyPageResult.toWebDto()`: add `completedReadingCount = completedReadingCount`.

- [ ] **Step 2: Fix compile in query defaults.** In `ArchiveListQueries.kt` set `completedReadingCount = 0` in `defaultMyPageResult(...)` (real values come in B2). The compiler will also force `readingProgress` into the `toMyRecentAttendanceResult` mapper — handled in B2; for now make `ArchiveRowMappers.toMyRecentAttendanceResult` read `readingProgress = getInt("reading_progress")`.

- [ ] **Step 3: Compile.**

Run: `./server/gradlew -p server compileKotlin compileTestKotlin`
Expected: BUILD SUCCESSFUL (it may fail until the B2 SQL provides `reading_progress`; if so, proceed to B2 and compile after).

- [ ] **Step 4: Commit**

```bash
git add server/src/main/kotlin/com/readmates/archive/application/model/ArchiveResults.kt \
        server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebDtos.kt \
        server/src/main/kotlin/com/readmates/archive/adapter/in/web/ArchiveWebMapper.kt
git commit -m "feat(server): add reading-completion fields to my-page result/DTO"
```

### Task B2: Populate completion from `reading_checkins` in the query

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveListQueries.kt:193-280` (`loadMyPage`)
- Modify: `server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveRowMappers.kt:75-79` (`toMyRecentAttendanceResult`)

- [ ] **Step 1: Update the recent-attendances query** to LEFT JOIN `reading_checkins` and select progress. Replace the inner select in `loadMyPage` with:

```sql
select session_number, attended, reading_progress
from (
  select
    sessions.number as session_number,
    coalesce(session_participants.attendance_status = 'ATTENDED', false) as attended,
    coalesce(reading_checkins.reading_progress, 0) as reading_progress
  from sessions
  left join session_participants on session_participants.session_id = sessions.id
    and session_participants.club_id = sessions.club_id
    and session_participants.membership_id = ?
  left join reading_checkins on reading_checkins.session_id = sessions.id
    and reading_checkins.membership_id = ?
  where sessions.club_id = ?
    and sessions.state = 'PUBLISHED'
  order by sessions.number desc
  limit 6
) recent
order by session_number asc
```

Update the bound params to `(membershipId, membershipId, clubId)`. **Verify the `reading_checkins` join column names** against the table that `JdbcArchiveDetailBatchReadAdapter` queries (`reading_checkins.reading_progress`, `reading_checkins.membership_id`, `reading_checkins.session_id`); adjust if the schema differs (e.g., a `club_id` column also needs matching).

- [ ] **Step 2: Update `toMyRecentAttendanceResult`** in `ArchiveRowMappers.kt`:

```kotlin
internal fun ResultSet.toMyRecentAttendanceResult() =
    MyRecentAttendanceResult(
        sessionNumber = getInt("session_number"),
        attended = getBoolean("attended"),
        readingProgress = getInt("reading_progress"),
    )
```

- [ ] **Step 3: Add `completedReadingCount` to the main my-page query.** Add a correlated subquery column alongside `session_count`:

```sql
,
(
  select count(*)
  from reading_checkins
  join sessions on sessions.id = reading_checkins.session_id
    and sessions.club_id = reading_checkins.club_id
  where reading_checkins.club_id = memberships.club_id
    and reading_checkins.membership_id = memberships.id
    and reading_checkins.reading_progress >= 100
    and sessions.state = 'PUBLISHED'
) as completed_reading_count
```

Then in the `MyPageResult(...)` row mapper add `completedReadingCount = resultSet.getInt("completed_reading_count")`. **Confirm `reading_checkins` has a `club_id` column**; if not, drop the `and sessions.club_id = reading_checkins.club_id` / `reading_checkins.club_id` predicates and rely on the session join + membership filter.

- [ ] **Step 4: Compile.**

Run: `./server/gradlew -p server compileKotlin compileTestKotlin`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 5: Commit**

```bash
git add server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveListQueries.kt \
        server/src/main/kotlin/com/readmates/archive/adapter/out/persistence/ArchiveRowMappers.kt
git commit -m "feat(server): populate my-page reading completion from reading_checkins"
```

### Task B3: Integration test for my-page completion

**Files:**
- Find & modify the existing my-page integration test. Locate with: `grep -rln "api/app/me\|getMyPageSummary\|MyPageResponse\|completedReadingCount" server/src/test`

- [ ] **Step 1: Write a failing integration test** that seeds a member with: 2 published sessions, attendance on 1, a `reading_checkins` row at 100% on one session and a partial (e.g., 40%) on another, then GETs `/api/app/me` and asserts:
  - `completedReadingCount == 1`
  - the `recentAttendances` entry for the 100% session has `readingProgress == 100` and the partial has `readingProgress == 40`.

Follow the seeding pattern of the existing my-page / archive integration tests (same testcontainer + fixtures). If no my-page integration test exists, add one mirroring the closest archive list integration test's setup.

- [ ] **Step 2: Run to verify it fails**

Run: `./server/gradlew -p server test --tests "*MyPage*"` (adjust to the actual test class)
Expected: FAIL on the new assertions.

- [ ] **Step 3: Make it pass** — fix any column/predicate mismatches surfaced by the test (the B2 "verify schema" notes). No new production code beyond corrections.

- [ ] **Step 4: Run the server suite for the slice**

Run: `./server/gradlew -p server test --tests "*MyPage*" --tests "*Archive*"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/test
git commit -m "test(server): pin my-page reading completion aggregation"
```

---

## Phase C — Slice 2 frontend: journey types, model, UI

### Task C1: Extend frontend contracts + DEV parser

**Files:**
- Modify: `front/features/archive/api/archive-contracts.ts` (`MyPageResponse`, `recentAttendances` item)
- Modify: `front/features/archive/model/archive-model.ts` (`MyPageProfile`, `recentAttendances` item)
- Check: any DEV Zod parser for MyPage — `grep -rn "MyPageResponse" front/features/archive/api front/shared`. If a Zod schema/parse exists, extend it; if `fetchMyPage` returns the type unparsed (current state), no parser change is needed — note that in the commit.

- [ ] **Step 1:** In `archive-contracts.ts` `MyPageResponse`:
  - add `completedReadingCount: number;`
  - in `recentAttendances` item add `readingProgress: number;`

- [ ] **Step 2:** In `archive-model.ts` `MyPageProfile`: mirror both additions (`completedReadingCount: number;` and `readingProgress: number;` on the attendance item).

- [ ] **Step 3:** Update `inactiveMyPageData` in `my-page-data.ts` and any other `MyPageResponse` literal (e.g. test fixtures) to include `completedReadingCount: 0` and `readingProgress: 0` on attendance entries. Find them: `grep -rn "recentAttendances:" front`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --dir front build`
Expected: PASS (all literals satisfy the extended type).

- [ ] **Step 5: Commit**

```bash
git add front/features/archive
git commit -m "feat(front): extend my-page contract with reading completion"
```

### Task C2: `reading-journey-model.ts` pure model + tests

**Files:**
- Create: `front/features/archive/model/reading-journey-model.ts`
- Test: `front/features/archive/model/reading-journey-model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// front/features/archive/model/reading-journey-model.test.ts
import { describe, expect, it } from "vitest";
import { readingCompletionRate, groupHistoryByBook, mergeActivityTimeline } from "./reading-journey-model";

describe("readingCompletionRate", () => {
  it("is completed / total as a rounded percent", () => {
    expect(readingCompletionRate({ completedReadingCount: 3, totalSessionCount: 4 })).toBe(75);
  });
  it("is 0 when there are no sessions", () => {
    expect(readingCompletionRate({ completedReadingCount: 0, totalSessionCount: 0 })).toBe(0);
  });
});

describe("groupHistoryByBook", () => {
  it("groups my questions and reviews by session, newest session first", () => {
    const groups = groupHistoryByBook(
      [{ sessionId: "s2", sessionNumber: 2, bookTitle: "B", date: "2026-05-02", text: "q", priority: 1, draftThought: null },
       { sessionId: "s1", sessionNumber: 1, bookTitle: "A", date: "2026-04-01", text: "q0", priority: 1, draftThought: null }],
      [{ sessionId: "s2", sessionNumber: 2, bookTitle: "B", date: "2026-05-02", kind: "LONG_REVIEW", text: "r" }],
    );
    expect(groups.map((g) => g.sessionNumber)).toEqual([2, 1]);
    expect(groups[0].questionCount).toBe(1);
    expect(groups[0].reviewCount).toBe(1);
  });
});

describe("mergeActivityTimeline", () => {
  it("merges questions and reviews newest-first by date", () => {
    const items = mergeActivityTimeline(
      [{ sessionId: "s1", sessionNumber: 1, bookTitle: "A", date: "2026-04-01", text: "q", priority: 1, draftThought: null }],
      [{ sessionId: "s2", sessionNumber: 2, bookTitle: "B", date: "2026-05-02", kind: "LONG_REVIEW", text: "r" }],
    );
    expect(items.map((i) => i.kind)).toEqual(["REVIEW", "QUESTION"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir front test -- reading-journey-model`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// front/features/archive/model/reading-journey-model.ts
import type { MyArchiveQuestionItem, MyArchiveReviewItem } from "@/features/archive/api/archive-contracts";

export function readingCompletionRate({
  completedReadingCount,
  totalSessionCount,
}: {
  completedReadingCount: number;
  totalSessionCount: number;
}): number {
  return totalSessionCount > 0 ? Math.round((completedReadingCount / totalSessionCount) * 100) : 0;
}

export type BookHistoryGroup = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  questionCount: number;
  reviewCount: number;
};

export function groupHistoryByBook(
  questions: MyArchiveQuestionItem[],
  reviews: MyArchiveReviewItem[],
): BookHistoryGroup[] {
  const map = new Map<string, BookHistoryGroup>();
  const ensure = (sessionId: string, sessionNumber: number, bookTitle: string, date: string) => {
    const existing = map.get(sessionId);
    if (existing) return existing;
    const created: BookHistoryGroup = { sessionId, sessionNumber, bookTitle, date, questionCount: 0, reviewCount: 0 };
    map.set(sessionId, created);
    return created;
  };
  for (const q of questions) ensure(q.sessionId, q.sessionNumber, q.bookTitle, q.date).questionCount += 1;
  for (const r of reviews) ensure(r.sessionId, r.sessionNumber, r.bookTitle, r.date).reviewCount += 1;
  return [...map.values()].sort((a, b) => b.sessionNumber - a.sessionNumber);
}

export type TimelineItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  kind: "QUESTION" | "REVIEW";
  text: string;
};

export function mergeActivityTimeline(
  questions: MyArchiveQuestionItem[],
  reviews: MyArchiveReviewItem[],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...questions.map((q) => ({ sessionId: q.sessionId, sessionNumber: q.sessionNumber, bookTitle: q.bookTitle, date: q.date, kind: "QUESTION" as const, text: q.text })),
    ...reviews.map((r) => ({ sessionId: r.sessionId, sessionNumber: r.sessionNumber, bookTitle: r.bookTitle, date: r.date, kind: "REVIEW" as const, text: r.text })),
  ];
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.sessionNumber - a.sessionNumber));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --dir front test -- reading-journey-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/archive/model/reading-journey-model.ts front/features/archive/model/reading-journey-model.test.ts
git commit -m "feat(front): add reading-journey derivations"
```

### Task C3: Fix the dishonest "완독률" label + add real completion stat

**Files:**
- Modify: `front/features/archive/ui/my-page/my-page-sections.tsx` (`RhythmSection`)
- Test: co-locate `front/features/archive/ui/my-page/my-page-sections.test.tsx` (create if absent)

- [ ] **Step 1: Write a failing test** asserting RhythmSection shows a true completion rate (from `completedReadingCount/totalSessionCount`) distinct from attendance.

```tsx
// my-page-sections.test.tsx
import { render, screen } from "@testing-library/react";
import { RhythmSection } from "./my-page-sections";

it("shows attendance and reading-completion as separate honest stats", () => {
  render(
    <RhythmSection
      data={{ sessionCount: 2, totalSessionCount: 4, completedReadingCount: 1,
              recentAttendances: [{ sessionNumber: 1, attended: true, readingProgress: 100 }] } as never}
      reviewCount="3"
      questionCount="5"
    />,
  );
  expect(screen.getByText("참석률")).toBeInTheDocument();
  expect(screen.getByText("완독률")).toBeInTheDocument();
  // attendance 2/4 = 50, completion 1/4 = 25 — distinct values rendered
  expect(screen.getByText("50")).toBeInTheDocument();
  expect(screen.getByText("25")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir front test -- my-page-sections`
Expected: FAIL (only one rate present; "참석률" label absent).

- [ ] **Step 3: Implement** — in `RhythmSection` import `readingCompletionRate` and build the stats array honestly:

```ts
import { readingCompletionRate } from "@/features/archive/model/reading-journey-model";
// ...
const summary = attendanceSummary(data);
const completionRate = readingCompletionRate({
  completedReadingCount: data.completedReadingCount ?? 0,
  totalSessionCount: data.totalSessionCount,
});
const stats = [
  { key: "참석률", value: String(summary.rate), sub: "%" },
  { key: "완독률", value: String(completionRate), sub: "%" },
  { key: "질문", value: String(questionCount), sub: "개" },
  { key: "서평", value: String(reviewCount), sub: "편" },
];
```

(The recent-attendance bar block stays; optionally tint bars that reached `readingProgress >= 100` differently, but keep a text label per H a11y — out of scope if it complicates; the stat correction is the required honesty fix.)

- [ ] **Step 4: Run to verify it passes + the existing my-page tests**

Run: `pnpm --dir front test -- my-page-sections && pnpm --dir front test -- archive-model`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add front/features/archive/ui/my-page/my-page-sections.tsx front/features/archive/ui/my-page/my-page-sections.test.tsx
git commit -m "fix(front): show honest reading-completion rate on my-page"
```

### Task C4: Thread question/review items to my-page and render journey section

**Files:**
- Modify: `front/features/archive/route/my-page-data.ts` (return `questions.items` / `reviews.items` or pass the pages through)
- Modify: `front/features/archive/route/my-page-route.tsx` (pass items to `<MyPage>`)
- Modify: `front/features/archive/ui/my-page.tsx` (`MyPageProps`, forward to desktop/mobile)
- Modify: `front/features/archive/ui/my-page/my-desktop.tsx`, `my-mobile.tsx` (render new section)
- Create: `front/features/archive/ui/my-page/reading-journey-section.tsx`
- Test: `front/features/archive/ui/my-page/reading-journey-section.test.tsx`

- [ ] **Step 1: Read** `my-desktop.tsx` and `my-mobile.tsx` to see how sections compose and where to insert the journey section (after `RhythmSection`/`WritingSection`).

- [ ] **Step 2: Write a failing test** for `ReadingJourneySection`:

```tsx
// reading-journey-section.test.tsx
import { render, screen } from "@testing-library/react";
import { ReadingJourneySection } from "./reading-journey-section";

it("renders per-book groups and a recent timeline", () => {
  render(
    <ReadingJourneySection
      questions={[{ sessionId: "s1", sessionNumber: 1, bookTitle: "책A", date: "2026-04-01", text: "질문", priority: 1, draftThought: null }]}
      reviews={[{ sessionId: "s2", sessionNumber: 2, bookTitle: "책B", date: "2026-05-02", kind: "LONG_REVIEW", text: "서평" }]}
    />,
  );
  expect(screen.getByText("책A")).toBeInTheDocument();
  expect(screen.getByText("책B")).toBeInTheDocument();
});

it("shows an honest empty state when there is no activity", () => {
  render(<ReadingJourneySection questions={[]} reviews={[]} />);
  expect(screen.getByText(/아직.*기록/)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --dir front test -- reading-journey-section`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `ReadingJourneySection`** using `groupHistoryByBook` + `mergeActivityTimeline`:

```tsx
// front/features/archive/ui/my-page/reading-journey-section.tsx
import type { MyArchiveQuestionItem, MyArchiveReviewItem } from "@/features/archive/api/archive-contracts";
import { groupHistoryByBook, mergeActivityTimeline } from "@/features/archive/model/reading-journey-model";
import { Link } from "@/features/archive/ui/archive-link";

export function ReadingJourneySection({
  questions,
  reviews,
}: {
  questions: MyArchiveQuestionItem[];
  reviews: MyArchiveReviewItem[];
}) {
  const books = groupHistoryByBook(questions, reviews);
  const timeline = mergeActivityTimeline(questions, reviews).slice(0, 8);

  if (books.length === 0) {
    return (
      <section>
        <div className="surface-quiet" style={{ padding: "16px 18px" }}>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>아직 남긴 독서 기록이 없어요.</p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="eyebrow" style={{ marginBottom: 12 }}>독서 여정</div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
        {books.map((b) => (
          <li key={b.sessionId} className="surface" style={{ padding: "14px 16px" }}>
            <Link to={`/app/archive/${b.sessionId}`} className="row-between">
              <span className="small">No.{b.sessionNumber} · {b.bookTitle}</span>
              <span className="tiny mono" style={{ color: "var(--text-3)" }}>질문 {b.questionCount} · 서평 {b.reviewCount}</span>
            </Link>
          </li>
        ))}
      </ul>
      {timeline.length > 0 && (
        <ol style={{ listStyle: "none", margin: "16px 0 0", padding: 0, display: "grid", gap: 6 }}>
          {timeline.map((t, i) => (
            <li key={`${t.sessionId}-${t.kind}-${i}`} className="tiny" style={{ color: "var(--text-2)" }}>
              <span className="mono" style={{ color: "var(--text-3)" }}>{t.date}</span> · {t.kind === "QUESTION" ? "질문" : "서평"} · {t.bookTitle}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

(Confirm the archive detail route path `/app/archive/:sessionId` against `member-session-detail-route.tsx`; adjust the `to=` if the real path differs.)

- [ ] **Step 5: Thread the data.** In `my-page-data.ts`, expand `MyPageRouteData` to include the items (the loader already fetches them). Pass `questions.items` and `reviews.items` through `my-page-route.tsx` → `MyPage` props → `MyDesktop`/`MyMobile`, and render `<ReadingJourneySection questions={...} reviews={...} />` after the existing rhythm/writing sections in both desktop and mobile. Keep the count props as-is (used elsewhere).

- [ ] **Step 6: Run tests, typecheck, lint**

Run: `pnpm --dir front test -- reading-journey-section my-page && pnpm --dir front build && pnpm --dir front lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add front/features/archive
git commit -m "feat(front): add reading-journey section to my-page"
```

---

## Phase D — Verification, docs, release readiness

### Task D1: Full slice verification

- [ ] **Step 1: Frontend gates**

Run: `pnpm --dir front lint && pnpm --dir front test && pnpm --dir front build`
Expected: all PASS.

- [ ] **Step 2: Server gates**

Run: `./server/gradlew -p server clean test`
Expected: BUILD SUCCESSFUL.

- [ ] **Step 3: E2E (my-page loader shape changed)**

Run: `pnpm --dir front test:e2e`
Expected: PASS. If a my-page e2e fixture encodes `MyPageResponse`, update it to include `completedReadingCount` and per-attendance `readingProgress` first.

### Task D2: CHANGELOG + release readiness

**Files:**
- Modify: `CHANGELOG.md` (`## Unreleased`)

- [ ] **Step 1:** Add an `Unreleased` entry under the appropriate categories:
  - **Changed / member:** current-session and member-home now show reading pace (마감까지 남은 일수 × 진행률 기반, 시작 앵커 불필요).
  - **Fixed / member:** my-page "완독률"이 실제로는 출석률이던 오라벨을 바로잡고, `reading_checkins` 100% 도달 기준의 정직한 완독률과 참석률을 분리 표기.
  - **Added / member:** my-page 독서 여정(책별 히스토리 + 최근 활동 타임라인).
  - Note: no DB migration; `MyPageResponse` gained `completedReadingCount` + per-attendance `readingProgress`; no auth/BFF token change.

- [ ] **Step 2:** Run the release-readiness review per `docs/development/release-readiness-review.md` for `origin/main..HEAD`: confirm no public-release safety regressions (my-page is self-only), architecture tests still pass, and the CHANGELOG `Unreleased` guard would accept the entry.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: changelog for member reading pace and journey"
```

---

## Self-review notes (author)

- **Spec coverage:** Slice 1 pace → A1–A3. Journey 4 views → cumulative summary (existing counts + C3), honest completion/consistency (B1–B3 + C3), per-book history (C2/C4), timeline (C2/C4). Server approach-C extension → B1–B3. Hardening gate (a11y text labels, empty states) → A3 (color+text), C3/C4 (empty states). Verification → D1; CHANGELOG/release-readiness → D2.
- **Honesty fix** (attendance mislabeled as 완독률) was discovered in current code and is explicitly corrected in C3 — this strengthens the spec's §6.3 honesty requirement.
- **Schema verification steps** are embedded in B2 because exact `reading_checkins` column names (esp. whether a `club_id` column exists) must be confirmed against the live schema before the SQL is final; B3's integration test will catch mismatches.
- **No new server slice / no host/admin change / member-only** — boundary per spec §4.3 preserved.
