# ReadMates Language, UX, And Data Consistency Implementation Plan

작성일: 2026-04-22
기준 설계 문서: `docs/superpowers/specs/2026-04-22-readmates-language-ux-data-consistency-design.md`

> **For agentic workers:** Implement task-by-task. Keep data/API behavior changes isolated from copy-only changes. Update checkboxes as work completes and record any e2e blocker exactly.

## Goal

Make the mobile and desktop ReadMates web app use one Korean-first product language, remove misleading static UI, connect existing host data flows that are currently not wired, and make host/member workspace switching explicit.

Primary outcomes:

1. Korean-first UI copy with only approved product abbreviations left in English.
2. Same feature names across mobile and desktop.
3. Host session start time persists through save/reload.
4. Host publication summary uses the existing publication API.
5. Public club pages prefer API data over hardcoded constants.
6. Static settings/checklist UI no longer looks like working real-time state.
7. HOST users can move between member and host workspaces in both desktop and mobile paths.

## Scope Guardrails

- Do not introduce i18n or translation infrastructure.
- Do not create new notification, calendar, theme, profile edit, or withdrawal APIs.
- Do not redesign the visual system.
- Do not change the public/member/host route structure beyond existing route links.
- Do not add CMS-style club profile database tables.
- Do not remove legacy internal route names or API field names unless a task explicitly says so.
- Do not show sample fallback content when API data is empty.
- Preserve unrelated existing worktree changes.

## Current Baseline To Capture Before Implementation

- [x] Run `git status --short` and record any unrelated dirty files before editing.
  - 2026-04-22: clean worktree before implementation.
- [x] Run focused baseline tests if practical:

```bash
pnpm --dir front exec vitest run tests/unit/public-home.test.tsx tests/unit/public-club.test.tsx tests/unit/my-page.test.tsx tests/unit/host-dashboard.test.tsx tests/unit/host-session-editor.test.tsx tests/unit/responsive-navigation.test.tsx
```

If a baseline test fails before edits, record the failure in this plan and avoid mixing that fix into unrelated tasks.

Baseline result: `pnpm --dir front exec vitest run tests/unit/public-home.test.tsx tests/unit/public-club.test.tsx tests/unit/my-page.test.tsx tests/unit/host-dashboard.test.tsx tests/unit/host-session-editor.test.tsx tests/unit/responsive-navigation.test.tsx tests/unit/spa-layout.test.tsx tests/unit/member-home.test.tsx` passed (8 files, 77 tests).

---

## Task 1 - Normalize Navigation Labels And Host Workspace Switching

**Files:**

- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/shared/ui/mobile-header.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/features/member-home/components/member-home.tsx`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify affected tests:
  - `front/tests/unit/responsive-navigation.test.tsx`
  - `front/tests/unit/spa-layout.test.tsx`
  - `front/tests/unit/member-home.test.tsx`
  - `front/tests/unit/host-dashboard.test.tsx`
  - `front/tests/e2e/responsive-navigation-chrome.spec.ts`
  - `front/tests/e2e/dev-login-session-flow.spec.ts`

- [x] Rename member "마이" surfaces to "내 공간" where user-facing.
- [x] Keep member nav order as `홈`, `이번 세션`, `클럽 노트`, `아카이브`, `내 공간`.
- [x] Keep host workspace labels as `운영`, `세션 편집`, `멤버 초대`, `멤버 승인`.
- [x] Ensure HOST users see a member-side entry point to `/app/host` on desktop.
- [x] Ensure HOST users see a member-side entry point to `/app/host` on mobile without crowding the tab bar.
- [x] Ensure host workspace screens always expose `멤버 화면으로` or equivalent return action to `/app`.
- [x] Ensure MEMBER users do not see host workspace switching actions.
- [x] Keep route guards as the authority for blocking non-host access to host routes.
- [x] Update unit tests for changed nav labels and role-specific actions.
- [x] Update e2e smoke so a host can move `/app` -> `/app/host` -> `/app`.

Expected result: host/member workspace switching is explicit and role-aware across mobile and desktop.

---

## Task 2 - Add A Small Copy/Vocabulary Helper Where It Reduces Drift

**Files:**

- Create or modify: `front/shared/ui/readmates-copy.ts` if it keeps call sites clearer.
- Modify: `front/shared/ui/readmates-display.ts` only if an existing display helper is the right home.
- Modify tests only for helpers that contain behavior.

- [x] Decide whether a shared copy helper is worthwhile after touching the first navigation/copy files.
- [x] If created, keep it small: approved nav labels, workspace labels, and common empty-state/action labels only.
- [x] Do not centralize long editorial copy or page-specific sentences.
- [x] Do not introduce runtime locale handling.
- [x] Add focused unit tests only for logic-bearing helpers, not for static string maps.

Expected result: common short labels have one source when that prevents repeated drift, without creating a generic copy framework.

---

## Task 3 - Fix Host Session Start Time Persistence

**Files:**

- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/features/host/components/host-session-schedule.ts`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify backend tests only if existing API coverage needs assertion updates:
  - `server/src/test/kotlin/com/readmates/session/api/HostSessionControllerDbTest.kt`
  - `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`

- [x] Initialize the host editor `time` state from `session?.startTime ?? "20:00"`.
- [x] Add `startTime` to `HostSessionFormValues`.
- [x] Pass `time` into `buildHostSessionRequest`.
- [x] Include `startTime` in the request payload.
- [x] Keep `endTime` behavior unchanged: create uses server default, edit preserves existing value when not provided.
- [x] Verify changing the start time does not alter question deadline date logic.
- [x] Add/update frontend tests for new session payload start time.
- [x] Add/update frontend tests for editing an existing session with a non-20:00 start time.
- [x] Add/update backend test assertions only if current tests do not already cover persisted `startTime`.
- [x] Run focused host editor tests.

Expected result: the visible "시작 시간" input is not a dead field; saved sessions reload with the selected start time.

---

## Task 4 - Connect Host Publication Settings To The Existing API

**Files:**

- Modify: `front/features/host/components/host-session-editor.tsx`
- Create if useful: `front/features/host/components/host-publication-settings.tsx`
- Modify: `front/shared/api/readmates.ts` only if a request/response type is missing.
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify or add focused action tests if extracted.

- [x] Initialize publication summary from `session?.publication?.publicSummary ?? ""`.
- [x] Initialize publication mode from `session?.publication?.isPublic`:
  - no publication: internal/default state
  - publication with `isPublic=false`: summary draft saved
  - publication with `isPublic=true`: public record published
- [x] Replace the old `요약만 공개` wording with `요약 초안 저장`.
- [x] Provide two API-backed actions:
  - save summary draft: `PUT /api/host/sessions/{sessionId}/publication` with `isPublic=false`
  - publish public record: same endpoint with `isPublic=true`
- [x] Do not make `내부 공개` look like an API save action.
- [x] Disable publication actions for unsaved new sessions and explain that the session must be created first.
- [x] Show validation errors inside the publication section when summary is blank or the API rejects the request.
- [x] Keep publication success/error feedback distinct from general session save feedback.
- [x] Avoid redirecting away from the editor after publication save.
- [x] Add tests that publication draft save calls the correct endpoint/body.
- [x] Add tests that public record publish calls the correct endpoint/body.
- [x] Add tests for unsaved-session disabled publication actions.
- [x] Add tests for API failure/validation feedback.

Expected result: host publication UI no longer stores local-only state; it uses the server publication model without implying unsupported unpublish behavior.

---

## Task 5 - Prefer Public Club API Data Over Hardcoded Constants

**Files:**

- Modify: `front/features/public/components/public-club.tsx`
- Modify: `front/features/public/components/public-home.tsx` if shared wording needs alignment.
- Create if useful: `front/features/public/components/public-club-copy.ts`
- Modify: `front/tests/unit/public-club.test.tsx`
- Modify: `front/tests/unit/public-home.test.tsx`

- [x] Use `data.about` as the primary public club about copy.
- [x] Use `data.tagline` where a tagline is displayed.
- [x] Keep `data.stats` and `data.recentSessions` as existing source of truth.
- [x] Remove `CLUB_ABOUT` as a value that can override API data.
- [x] Keep host/cadence/recording/host note as static operational introduction only because no API exists for them.
- [x] Rename static constants so they read as static intro copy, not live club records.
- [x] Remove or translate English eyebrow labels on public club/home surfaces.
- [x] If API `about` is blank, show an empty/neutral public-introduction fallback rather than seeded-looking content.
- [x] Add tests proving API `about` and `tagline` win over static fallback copy.
- [x] Add tests for empty public introduction fallback.

Expected result: public pages do not mask real API data with hardcoded club copy.

---

## Task 6 - Make My Page Settings Read-Only Or Explicitly Pending

**Files:**

- Modify: `front/features/archive/components/my-page.tsx`
- Modify: `front/tests/unit/my-page.test.tsx`

- [x] Rename desktop `My` / `내 서가 · 계정` surfaces to the approved `내 공간` concept.
- [x] Convert notification switches to read-only status rows or clearly disabled pending controls.
- [x] Disable or remove action styling from `프로필 수정`, `변경`, `탈퇴` if no API is wired.
- [x] Add visible reason text such as `준비 중` for non-working settings actions.
- [x] Make mobile `캘린더 연동` and `테마 · 표시` clearly pending/read-only.
- [x] Remove `fallbackRecentAttendances` from the rendered data path.
- [x] If `recentAttendances` is empty, render an empty state instead of inferred attendance bars.
- [x] Keep actual profile data from `MyPageResponse` intact.
- [x] Update tests for read-only/pending states.
- [x] Add test that no inferred recent attendance bars render when API data is empty.

Expected result: my page does not present unavailable settings as working product features and does not invent activity data.

---

## Task 7 - Reduce Static State In Host Dashboard

**Files:**

- Modify: `front/features/host/components/host-dashboard.tsx`
- Create if useful: `front/features/host/components/host-dashboard-status.ts`
- Modify: `front/tests/unit/host-dashboard.test.tsx`

- [x] Translate high-signal English labels: `Host operations`, `Needs attention`, `Upcoming`, `Operation timeline`, `Member status`, `Quick actions`.
- [x] Keep dashboard metrics from `HostDashboardResponse` as source of truth.
- [x] Derive checklist status only when it can be calculated from `current.currentSession` or dashboard metrics.
- [x] For checklist items that cannot be calculated, display them as guidance rather than completed/pending state.
- [x] Keep quick actions that navigate to the session editor as links.
- [x] Keep reminder/send actions disabled until an API exists, and explain why they are unavailable.
- [x] Remove or replace static save-state text such as `2분 전` and `저장됨`.
- [x] Ensure mobile and desktop dashboard labels use the same Korean concept names.
- [x] Add focused tests for disabled unavailable actions and Korean labels.
- [x] Add focused tests for no-current-session dashboard states.

Expected result: the host dashboard remains useful without pretending static arrays are live operational state.

---

## Task 8 - Align Mobile/Desktop Labels On Archive, Notes, Current Session, And Feedback Surfaces

**Files:**

- Modify: `front/features/archive/components/member-session-detail-page.tsx`
- Modify: `front/features/archive/components/archive-page.tsx`
- Modify: `front/features/archive/components/notes-feed-list.tsx`
- Modify: `front/features/archive/components/notes-session-filter.tsx`
- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/features/current-session/components/current-session-mobile.tsx`
- Modify: `front/features/current-session/components/current-session-panels.tsx`
- Modify: `front/features/feedback/components/feedback-document-page.tsx`
- Modify affected tests:
  - `front/tests/unit/member-session-detail-page.test.tsx`
  - `front/tests/unit/archive-page.test.tsx`
  - `front/tests/unit/notes-feed-page.test.tsx`
  - `front/tests/unit/current-session.test.tsx`
  - `front/tests/unit/feedback-document-page.test.tsx`

- [x] Change archive detail desktop segment labels from English to the same Korean concepts used on mobile.
- [x] Normalize `Summary`/`Public summary` to `요약`/`공개 요약` depending on context.
- [x] Normalize `Club records` to `클럽 기록`.
- [x] Normalize `My records` to `내 기록`.
- [x] Normalize notes feed English section eyebrows where they are visible as product chrome.
- [x] Keep `RSVP`, `PDF`, `Google`, `URL`, `Passcode`, `No.` unchanged.
- [x] Translate English accessibility labels such as `Notes filters` and `Selected session record counts`.
- [x] Ensure visible button labels and aria labels describe the same action.
- [x] Preserve existing empty-state behavior except where sample fallback is removed.
- [x] Update tests for new labels.

Expected result: users do not encounter different names for the same sections when switching device sizes.

---

## Task 9 - Final Copy Sweep And Regression Search

**Files:**

- Modify files found by search only if they are user-facing runtime surfaces.
- Do not modify tests just to hide legitimate test fixture names.

- [x] Run a user-facing English/Korean mixed-copy search:

```bash
rg -n "[가-힣].*[A-Za-z]|[A-Za-z].*[가-힣]" front/src front/shared front/features --glob '*.{tsx,ts}'
```

- [x] Classify each hit as allowed abbreviation, code-only, test-only, or needs copy cleanup.
- [x] Run targeted searches for known English UI labels:

```bash
rg -n "Member home|Operation timeline|Quick actions|Notifications|Preferences|Danger zone|Public sessions|Host note|Principles|The rhythm|App tabs|Notes filters|Selected session" front/src front/shared front/features --glob '*.{tsx,ts}'
```

- [x] Ensure no runtime UI uses `report` where the visible product term should be `피드백 문서`.
- [x] Ensure no user-facing screen uses `마이` when the approved label is `내 공간`.
- [x] Ensure static sample-looking fallbacks are not introduced.

Expected result: final search catches copy drift outside the main files.

---

## Task 10 - Focused Verification

- [x] Run focused unit tests for each changed area:

```bash
pnpm --dir front exec vitest run \
  tests/unit/public-home.test.tsx \
  tests/unit/public-club.test.tsx \
  tests/unit/my-page.test.tsx \
  tests/unit/host-dashboard.test.tsx \
  tests/unit/host-session-editor.test.tsx \
  tests/unit/responsive-navigation.test.tsx \
  tests/unit/spa-layout.test.tsx \
  tests/unit/member-session-detail-page.test.tsx \
  tests/unit/archive-page.test.tsx \
  tests/unit/notes-feed-page.test.tsx \
  tests/unit/current-session.test.tsx \
  tests/unit/feedback-document-page.test.tsx
```

  - 2026-04-22: passed.
    - Command: `pnpm --dir front exec vitest run tests/unit/public-home.test.tsx tests/unit/public-club.test.tsx tests/unit/my-page.test.tsx tests/unit/host-dashboard.test.tsx tests/unit/host-session-editor.test.tsx tests/unit/responsive-navigation.test.tsx tests/unit/spa-layout.test.tsx tests/unit/member-session-detail-page.test.tsx tests/unit/archive-page.test.tsx tests/unit/notes-feed-page.test.tsx tests/unit/current-session.test.tsx tests/unit/feedback-document-page.test.tsx`
    - Result: `12 passed (12)` files, `126` tests.
  - 2026-04-22: addon verification passed.
    - Command: `pnpm --dir front exec vitest run tests/unit/login-card.test.tsx tests/unit/public-session-page.test.tsx tests/unit/spa-router.test.tsx`
    - Result: `3` passed (3) files, `9` tests.
    - `git diff --check` passed with no issues.

- [x] Run focused e2e for host/member workspace switching and session editing if local dependencies are available:

```bash
pnpm --dir front test:e2e -- dev-login-session-flow
pnpm --dir front test:e2e -- responsive-navigation-chrome
```

  - 2026-04-22: both commands passed.
    - `pnpm --dir front test:e2e -- dev-login-session-flow`: `2` passed.
    - `pnpm --dir front test:e2e -- responsive-navigation-chrome`: `2` passed.

- [x] If e2e cannot run, record the exact missing dependency or environment blocker.
  - 2026-04-22: not blocked; Playwright/browser services and dependencies were available.

Expected result: the changed flows pass before broader checks.

---

## Task 11 - Full Verification And Closure

- [x] Run full frontend typecheck:

```bash
pnpm --dir front exec tsc --noEmit
```

  - 2026-04-22: passed.
    - Command: `pnpm --dir front exec tsc --noEmit`
    - Result: exit code `0`; no output.
  - 2026-04-22 rerun after blocker fixes: passed.
    - Command: `pnpm --dir front exec tsc --noEmit`
    - Result: exit code `0`; no output.

- [x] Run full frontend lint:

```bash
pnpm --dir front lint
```

  - 2026-04-22: passed.
    - Command: `pnpm --dir front lint`
    - Result: exit code `0`; `eslint .` completed with no reported issues.
  - 2026-04-22 rerun after blocker fixes: passed.
    - Command: `pnpm --dir front lint`
    - Result: exit code `0`; `eslint .` completed with no reported issues.

- [x] Run full frontend unit tests:

```bash
pnpm --dir front test
```

  - 2026-04-22: passed.
    - Command: `pnpm --dir front test`
    - Result: exit code `0`; `36` test files passed, `234` tests passed.
  - 2026-04-22 rerun after blocker fixes: passed.
    - Command: `pnpm --dir front test`
    - Result: exit code `0`; `36` test files passed, `234` tests passed.

- [x] Run frontend build:

```bash
pnpm --dir front build
```

  - 2026-04-22: passed with residual warning.
    - Command: `pnpm --dir front build`
    - Result: exit code `0`; Vite built `dist/index.html`, `dist/assets/index-BKFTjvIC.css` (`31.34 kB`, gzip `6.55 kB`), and `dist/assets/index-ryBRQTFs.js` (`529.75 kB`, gzip `141.93 kB`).
    - Warning: `[plugin builtin:vite-reporter] (!) Some chunks are larger than 500 kB after minification.`
  - 2026-04-22 rerun after blocker fixes: passed with the same residual warning.
    - Command: `pnpm --dir front build`
    - Result: exit code `0`; Vite built `dist/index.html`, `dist/assets/index-BKFTjvIC.css` (`31.34 kB`, gzip `6.55 kB`), and `dist/assets/index-ryBRQTFs.js` (`529.75 kB`, gzip `141.93 kB`).
    - Warning: `[plugin builtin:vite-reporter] (!) Some chunks are larger than 500 kB after minification.`

- [x] Run backend tests:

```bash
./server/gradlew -p server test
```

  - 2026-04-22: failed.
    - Command: `./server/gradlew -p server test`
    - Result: exit code `1`; `231 tests completed, 1 failed`; `BUILD FAILED in 31s`.
    - Failure: `GoogleOAuthLoginSessionTest > successful google invite login accepts invitation and issues readmates session()`.
    - Exact assertion: `org.opentest4j.AssertionFailedError: expected: <1> but was: <0>` at `server/src/test/kotlin/com/readmates/auth/api/GoogleOAuthLoginSessionTest.kt:191`.
    - Failing assertion checks participant count for `oauth.invited@example.com` in an `OPEN` session after Google invite acceptance.
    - Historical failed-run note: this initially blocked green verification and prompted the focused backend/auth-invite fix below.
  - 2026-04-22 fix applied and rerun passed.
    - Root cause: `InvitationService.addToCurrentOpenSessionIfSafe` intentionally requires `apply_to_current_session=true`, an `OPEN` session, future `question_deadline_at`, and a not-past Korea-local session date. The OAuth test fixture created `question_deadline_at = utc_timestamp(6)`, so the session was not safe by the time invitation acceptance ran.
    - Fix: updated `GoogleOAuthLoginSessionTest.createOpenSession()` to create a safe current session using Korea-local current date and `date_add(utc_timestamp(6), interval 1 day)` for the deadline. Production invite/session code was unchanged.
    - Command: `./server/gradlew -p server test`
    - Result: exit code `0`; `BUILD SUCCESSFUL in 30s`.
  - 2026-04-22 isolated reconciliation rerun passed.
    - Command: `./server/gradlew -p server test --rerun-tasks --stacktrace`
    - Result: exit code `0`; `BUILD SUCCESSFUL in 40s`; `6 actionable tasks: 6 executed`.
    - Conflicting reviewer report of two anonymization failures was not reproducible in this isolated rerun. This supports treating the earlier conflict as non-reproducible in isolation; concurrent Gradle/test-output interference remains a plausible explanation, but this run did not emit failure evidence to prove it directly.
    - Warnings: Kotlin compile emitted `MySQLContainer` deprecation warnings in `server/src/test/kotlin/com/readmates/support/MySqlTestContainer.kt`; JVM emitted class-sharing warning. Neither blocked tests.

- [x] Run full e2e if local MySQL/browser dependencies are available:

```bash
pnpm --dir front test:e2e
```

  - 2026-04-22: failed; local browser/test dependencies were available.
    - Command: `pnpm --dir front test:e2e`
    - Result: exit code `1`; `8` passed, `1` failed.
    - Failure: `tests/e2e/public-auth-member-host.spec.ts:15:5 › public to Google fixture login to host smoke flow`.
    - Exact failure: `expect(page.getByText("운영 대시보드")).toBeVisible()` failed with Playwright strict mode violation because `getByText('운영 대시보드')` resolved to `2` elements: desktop `<h1 class="h1 editorial">운영 대시보드</h1>` and mobile `<h1 class="h2 editorial rm-host-dashboard-mobile__title">운영 대시보드</h1>`.
    - Dependency status: not blocked by missing MySQL/browser dependencies.
    - Historical failed-run note: this initially blocked green verification and prompted the scoped e2e locator fix below.
  - 2026-04-22 fix applied and rerun passed.
    - Root cause: the e2e used a global text locator, but both desktop and mobile dashboard headings remain in the responsive DOM. Playwright strict mode fails before visibility is used to disambiguate.
    - Fix: scoped the assertion to `main.rm-host-dashboard-desktop` and the heading role, matching the tested desktop viewport without changing product UI.
    - Command: `pnpm --dir front test:e2e`
    - Result: exit code `0`; `9` passed.
  - 2026-04-22 isolated reconciliation rerun passed.
    - Command: `pnpm --dir front test:e2e`
    - Result: exit code `0`; `9` passed in `11.4s`.
    - Conflicting reviewer report of a Gradle `:bootRun` startup failure during e2e was not reproducible in this isolated rerun. Because this run started the Playwright web servers and completed all tests without a backend startup failure, concurrent backend startup/Gradle activity remains a plausible explanation for the earlier conflict, but this run did not emit failure evidence to prove it directly.
    - Warning: e2e emitted the known `NO_COLOR` ignored due to `FORCE_COLOR` warning; it did not block the run.

- [x] Record any pre-existing large chunk warning or unrelated warning without treating it as this task's regression.
  - 2026-04-22: Vite large chunk warning appeared for `dist/assets/index-ryBRQTFs.js` at `529.75 kB` after minification.
  - Classification: residual/pre-existing warning, not treated as a Task 11 regression. Prior plan evidence records the same Vite large chunk warning on 2026-04-21 in `docs/superpowers/plans/2026-04-21-readmates-consistency-maintenance-implementation-plan.md`.
  - E2E emitted repeated Node warnings: `The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.` Classification: unrelated test-runner environment warning; not the cause of the failed e2e assertion.
  - 2026-04-22 rerun after blocker fixes: same Vite large chunk warning appeared; classification remains residual/pre-existing.
  - 2026-04-22 rerun after blocker fixes: same `NO_COLOR`/`FORCE_COLOR` e2e warning appeared; classification remains unrelated test-runner environment warning.
- [x] Run `git status --short` and confirm only intended files changed.
  - 2026-04-22: command ran after verification.
  - Intended-files status for initial Task 11 verification subagent: only this plan file should be edited by that subagent.
  - Intended-files status after blocker fixes: this plan file plus the minimal backend test fixture and e2e locator files are intended.
  - Worktree status is not limited to Task 11 because it already contains implementation changes from earlier tasks and a separate dirty member-lifecycle plan. Preserve those unrelated changes.
  - Dirty summary after blocker fixes: `docs/superpowers/plans/2026-04-22-readmates-language-ux-data-consistency-implementation-plan.md`, `docs/superpowers/plans/2026-04-22-readmates-member-lifecycle-session-management-implementation-plan.md`, many modified `front/features`, `front/shared/ui`, `front/src/pages`, and `front/tests` files, modified `server/src/test/kotlin/com/readmates/auth/api/GoogleOAuthLoginSessionTest.kt`, plus untracked `front/features/public/components/public-club-copy.ts` and `front/shared/ui/readmates-copy.ts`.
- [x] Summarize completed tasks, tests, e2e status, and residual risks.
  - 2026-04-22 final status after blocker fixes: full verification is green.
  - Passed after fixes: `./server/gradlew -p server test`, `pnpm --dir front test:e2e`, `pnpm --dir front exec tsc --noEmit`, `pnpm --dir front lint`, `pnpm --dir front test`, `pnpm --dir front build`, and `git diff --check`.
  - Residual risk: Vite large chunk warning remains pre-existing/residual; no remaining verification blocker recorded.

Expected result: implementation is ready for review with clear evidence of behavior and copy consistency.
