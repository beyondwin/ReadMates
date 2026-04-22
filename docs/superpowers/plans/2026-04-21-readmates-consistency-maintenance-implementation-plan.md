# ReadMates Consistency And Maintenance Implementation Plan

작성일: 2026-04-21
기준 설계 문서: `docs/superpowers/specs/2026-04-21-readmates-consistency-maintenance-design.md`

> **For agentic workers:** Implement this plan task-by-task. Keep each task behavior-preserving unless the task explicitly changes product copy or display rules. Update checkboxes as work completes.

## Goal

Bring ReadMates into a consistent post-migration state after the Cloudflare/Vite, Google-only auth, MySQL, and session feedback document changes. The work is split into three phases:

1. Correctness and hygiene fixes that make the codebase checks reliable.
2. Product and UX consistency fixes for dates, auth legacy surfaces, feedback legacy wording, and default session dates.
3. Maintainability refactors for oversized frontend components, backend repositories, and frontend/backend API contract drift.

## Scope Guardrails

- Do not change the production deployment architecture.
- Do not delete database tables in this work. Legacy tables remain unless a future migration plan explicitly removes them.
- Do not introduce OpenAPI/codegen in this plan.
- Do not redesign the visual system. CSS work is limited to source-of-truth and variable consistency.
- Do not mix large behavior changes into structural refactors.
- Preserve existing public routes and API contracts unless a task explicitly documents a legacy route policy.

## Current Baseline

- `pnpm --dir front test`: passes 33 files / 205 tests.
- `pnpm --dir front lint`: passes with 6 Fast Refresh warnings.
- `pnpm --dir front build`: passes with an existing large chunk warning.
- `pnpm --dir front exec tsc --noEmit`: fails on e2e `window.__readmatesPrintCalls` casts.
- `./server/gradlew -p server test`: succeeds, up-to-date.

---

## Task 1 - Restore TypeScript No-Emit

**Files:**

- Modify: `front/tests/e2e/google-auth-pending-approval.spec.ts`
- Modify: `front/tests/e2e/public-auth-member-host.spec.ts`
- Create: `front/tests/e2e/print-spy.ts`

- [x] Create an e2e helper that installs a `window.print` spy and stores calls on `window.__readmatesPrintCalls`.
- [x] Add helper functions to read the print call count through `page.evaluate`.
- [x] Replace direct `Window & { __readmatesPrintCalls: number }` casts in both specs with the helper.
- [x] Verify pending approval feedback print route still redirects to `/app/pending` and has zero print calls.
- [x] Verify approved host feedback print route still calls print once.
- [x] Run `pnpm --dir front exec tsc --noEmit`.

Expected result: `tsc --noEmit` passes without changing e2e runtime behavior.

---

## Task 2 - Update Environment Documentation

**Files:**

- Modify: `.env.example`
- Modify: `README.md`
- Modify: `front/features/auth/components/login-card.tsx`

- [x] Replace stale "Next.js frontend and BFF" wording with Cloudflare Pages SPA and Functions wording.
- [x] Replace `replace-with-vercel-url` examples with Cloudflare/custom-domain example values.
- [x] Remove `NEXT_PUBLIC_APP_URL` from `.env.example`.
- [x] Add `VITE_ENABLE_DEV_LOGIN=false` as the frontend dev-login example.
- [x] Keep `NEXT_PUBLIC_ENABLE_DEV_LOGIN` compatibility in code, but document it as legacy compatibility instead of the preferred variable.
- [x] Confirm README and Cloudflare deploy guide list the same required production variables.
- [x] Run `rg -n "replace-with-vercel|Next.js frontend and BFF|NEXT_PUBLIC_APP_URL" .env.example README.md docs/deploy front/features/auth/components/login-card.tsx`.

Expected result: current docs point users toward Cloudflare/Vite variables while existing legacy local env users are not broken.

---

## Task 3 - Remove Fast Refresh Warnings

**Files:**

- Modify: `front/shared/ui/avatar-chip.tsx`
- Modify: `front/shared/ui/public-auth-action.tsx`
- Modify: `front/src/app/auth-context.tsx`
- Modify: `front/src/pages/readmates-page.tsx`
- Create: `front/shared/ui/avatar-chip-utils.ts`
- Create: `front/shared/ui/public-auth-action-state.ts`
- Create: `front/src/app/auth-state.ts`
- Create: `front/src/pages/readmates-page-data.ts`
- Modify tests that import moved helpers

- [x] Move `avatarInitial` and any other exported helper from `avatar-chip.tsx` into a non-component helper module.
- [x] Move `usePublicAuthAction` helper exports out of component-only files.
- [x] Move auth-context non-component exports into `auth-state.ts`.
- [x] Move `readmates-page.tsx` non-component exports out of the page component file.
- [x] Update affected unit tests/imports.
- [x] Run `pnpm --dir front lint` and verify the 6 Fast Refresh warnings are gone.
- [x] Run `pnpm --dir front test`.

Expected result: lint has zero warnings/errors for the touched files.

---

## Task 4 - Remove PostgreSQL Test Runtime Residue

**Files:**

- Modify: `server/build.gradle.kts`
- Delete: `server/src/test/kotlin/com/readmates/support/PostgreSqlTestContainer.kt`

- [x] Confirm no active test imports `PostgreSqlTestContainer`.
- [x] Remove PostgreSQL test runtime dependencies from `server/build.gradle.kts`.
- [x] Remove PostgreSQL Testcontainers dependency from `server/build.gradle.kts`.
- [x] Delete `PostgreSqlTestContainer.kt`.
- [x] Keep historical PostgreSQL Flyway SQL files untouched.
- [x] Run `./server/gradlew -p server test`.
- [x] Run `rg -n "PostgreSqlTestContainer|testcontainers-postgresql|flyway-database-postgresql|org.postgresql:postgresql" server`.

Expected result: server tests still pass and no active PostgreSQL test helper/dependency remains.

---

## Task 5 - Add Shared Date Display Helpers

**Files:**

- Modify: `front/shared/ui/readmates-display.ts`
- Modify: `front/tests/unit/readmates-display.test.ts`

- [x] Add `formatDateOnlyLabel(value, fallback?)` for ISO date or timestamp values rendered as `YYYY.MM.DD`.
- [x] Make invalid or blank values return the provided fallback.
- [x] Keep `formatDateLabel` behavior stable for existing date-only values.
- [x] Add tests for date-only strings, UTC timestamps, invalid strings, blank strings, and fallback behavior.
- [x] Run `pnpm --dir front vitest run tests/unit/readmates-display.test.ts`.

Expected result: date formatting rules are centralized before component updates.

---

## Task 6 - Apply Date Display Rules Across Screens

**Files:**

- Modify: `front/features/archive/components/archive-page.tsx`
- Modify: `front/features/archive/components/member-session-detail-page.tsx`
- Modify: `front/features/archive/components/my-page.tsx`
- Modify: `front/features/archive/components/notes-feed-page.tsx`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/features/host/components/host-invitations.tsx`
- Modify: `front/features/auth/components/invite-acceptance-card.tsx`
- Modify: `front/src/pages/host-members.tsx`
- Modify affected unit tests

- [x] Replace display-time `replaceAll("-", ".")` helpers with shared date helpers.
- [x] Replace visible `slice(0, 10)` timestamp formatting with `formatDateOnlyLabel`.
- [x] Change visible raw `YYYY-MM-DD` session dates to `YYYY.MM.DD` where this is app-facing copy.
- [x] Preserve machine values in inputs, API payloads, query strings, and tests that assert raw API data.
- [x] Update tests for archive, notes, host invitations, invite acceptance, host dashboard, member detail, and my page.
- [x] Run focused frontend tests for each touched feature.
- [x] Run `pnpm --dir front test`.

Expected result: user-facing date display follows one rule while API date strings remain unchanged.

---

## Task 7 - Clarify Google-Only Legacy Auth UX

**Files:**

- Modify: `front/features/auth/components/password-reset-card.tsx`
- Modify: `front/features/auth/components/invite-acceptance-card.tsx`
- Modify: `front/tests/unit/password-reset-card.test.tsx`
- Modify: `front/tests/unit/invite-acceptance-card.test.tsx`
- Modify: `front/tests/unit/spa-router.test.tsx`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PasswordAuthControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/PasswordResetControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/InvitationControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/DevInvitationControllerTest.kt`

- [x] Keep `/reset-password/:token` as a legacy 안내 page.
- [x] Rewrite reset-page copy so the primary action is "Google로 계속하기" and the legacy reason is secondary.
- [x] Keep password reset and password invitation API endpoints returning 410 Gone.
- [x] Clarify test descriptions to say "legacy password endpoint is gone" rather than implying a current password flow.
- [x] Ensure invitation acceptance copy directs the user to the invited Gmail account and Google OAuth.
- [x] Run affected frontend auth tests.
- [x] Run affected backend auth tests.

Expected result: users see Google-only next actions, and tests document that password flows are intentionally legacy.

---

## Task 8 - Clarify Feedback Legacy Surfaces

**Files:**

- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/features/archive/components/archive-page.tsx`
- Modify: `front/features/member-home/components/member-home.tsx`
- Modify: `front/features/feedback/components/feedback-document-page.tsx`
- Modify: `front/features/archive/components/my-page.tsx`
- Modify: `front/src/pages/pending-approval.tsx`
- Modify: `front/tests/unit/archive-page.test.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify: `front/tests/unit/member-home.test.tsx`
- Modify: `front/tests/unit/feedback-document-page.test.tsx`
- Modify: `front/tests/unit/my-page.test.tsx`
- Modify: `README.md`

- [x] Keep `feedback_reports` counts in deletion preview for safety.
- [x] Change user-facing deletion preview copy from "개인 피드백 리포트" to "레거시 개인 리포트".
- [x] Do not expose `feedback_reports` as a current product feature in member-facing pages.
- [x] Confirm my page and archive use session feedback document wording.
- [x] Update tests that assert deletion preview labels.
- [x] Run focused host session editor, host dashboard, archive page, my page, member home, and feedback document unit tests.

Expected result: legacy feedback rows remain safely counted without looking like the current feedback feature.

---

## Task 9 - Replace Hardcoded New Session Date

**Files:**

- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Create: `front/features/host/components/session-date-defaults.ts`

- [x] Extract default session date calculation into a pure helper.
- [x] Calculate the next third Wednesday on or after the current date.
- [x] If the current date is after this month’s third Wednesday, choose next month’s third Wednesday.
- [x] Keep host date input editable.
- [x] Add tests for `2026-04-21`, `2026-05-20`, `2026-05-21`, and year/month rollover.
- [x] Replace the `2026-05-20` constant in the editor with the helper.
- [x] Run `pnpm --dir front exec vitest run tests/unit/host-session-editor.test.tsx`.

Expected result: new session creation no longer goes stale after May 2026.

---

## Task 10 - Document CSS Source Of Truth

**Files:**

- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/tokens.css`
- Modify: `front/shared/styles/mobile.css`

- [x] Add a concise source-of-truth comment to runtime style files.
- [x] Ensure runtime-only aliases remain in `globals.css`.
- [x] Ensure new token definitions live in `front/shared/styles/tokens.css`.
- [x] Do not modify generated standalone design HTML files.
- [x] Run `pnpm --dir front build`.

Expected result: future style edits have a clear runtime source of truth without a visual redesign.

---

## Task 11 - Split Current Session Component

**Files:**

- Modify: `front/features/current-session/components/current-session.tsx`
- Create: `front/features/current-session/components/current-session-question-editor.tsx`
- Create: `front/features/current-session/components/current-session-question-editor-utils.ts`
- Create: `front/features/current-session/components/current-session-types.ts`
- Create: `front/features/current-session/components/current-session-primitives.tsx`
- Create: `front/features/current-session/components/current-session-panels.tsx`
- Create: `front/features/current-session/components/current-session-mobile.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`

- [x] Identify pure helper functions and move them into focused modules.
- [x] Extract question editor rendering into a child component.
- [x] Extract RSVP/checkin/review panels into leaf components.
- [x] Extract mobile render sections into `current-session-mobile.tsx`.
- [x] Keep API action imports and mutation orchestration behavior unchanged.
- [x] Run `pnpm --dir front exec vitest run tests/unit/current-session.test.tsx`.
- [x] Run `pnpm --dir front test`.

Expected result: `current-session.tsx` becomes an orchestration component rather than a 1500-line mixed renderer.

---

## Task 12 - Split Host Session Editor Component

**Files:**

- Modify: `front/features/host/components/host-session-editor.tsx`
- Create: `front/features/host/components/host-session-schedule.ts`
- Create: `front/features/host/components/host-session-attendance-editor.tsx`
- Create: `front/features/host/components/host-session-feedback-upload.tsx`
- Create: `front/features/host/components/host-session-deletion-preview.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify: `front/.gitignore`

- [x] Move schedule/date helpers into a pure helper module.
- [x] Extract form payload builder into a pure helper.
- [x] Extract attendance editor.
- [x] Extract feedback document upload section.
- [x] Extract deletion preview section.
- [x] Preserve create/update/delete/upload behavior.
- [x] Ignore generated frontend `dist/` build output.
- [x] Run `pnpm --dir front exec vitest run tests/unit/host-session-editor.test.tsx`.
- [x] Run `pnpm --dir front test`.

Expected result: host session editor responsibilities are separated without changing host workflows.

---

## Task 13 - Split Member Home And Notes Feed Components

**Files:**

- Modify: `front/features/member-home/components/member-home.tsx`
- Modify: `front/features/archive/components/notes-feed-page.tsx`
- Create: `front/features/member-home/components/member-home-current-session.tsx`
- Create: `front/features/member-home/components/member-home-records.tsx`
- Create: `front/features/member-home/components/member-home-records-utils.ts`
- Create: `front/features/archive/components/notes-session-filter.tsx`
- Create: `front/features/archive/components/notes-session-filter-utils.ts`
- Create: `front/features/archive/components/notes-feed-list.tsx`
- Modify: `front/tests/unit/member-home.test.tsx`
- Modify: `front/tests/unit/notes-feed-page.test.tsx`
- Modify: `front/tests/unit/notes-page.test.tsx`

- [x] Extract member home current session card and note feed preview.
- [x] Extract member stats/recent attendance display.
- [x] Extract notes session rail/filter components.
- [x] Extract notes feed grouping/filtering helpers.
- [x] Preserve URLs and selected-session behavior.
- [x] Run `pnpm --dir front exec vitest run tests/unit/member-home.test.tsx tests/unit/notes-feed-page.test.tsx tests/unit/notes-page.test.tsx`.
- [x] Run `pnpm --dir front test`.

Expected result: member home and notes feed are easier to change independently.

---

## Task 14 - Split SessionRepository Behind Thin Facade

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/session/application/SessionRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/CurrentSessionRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/HostSessionRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/SessionParticipationRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/session/application/HostSessionDeletionRepository.kt`
- Modify affected backend tests for bean wiring/import changes.

- [x] Keep `SessionRepository` as the public bean used by existing controllers.
- [x] Extract current session query logic into `CurrentSessionRepository`.
- [x] Extract host session create/update/find logic into `HostSessionRepository`.
- [x] Extract member participation commands into `SessionParticipationRepository`.
- [x] Extract deletion preview/count/delete logic into `HostSessionDeletionRepository`.
- [x] Extract shared row mapping/helpers only when used by more than one new repository.
- [x] Keep SQL behavior unchanged.
- [x] Run focused session, note, archive, and feedback-related backend tests.
- [x] Run `./server/gradlew -p server test`.

Expected result: controllers keep the same dependency while the oversized repository is decomposed.

---

## Task 15 - Split ArchiveRepository Behind Thin Facade

**Files:**

- Modify: `server/src/main/kotlin/com/readmates/archive/application/ArchiveRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/ArchiveShortNames.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/ArchiveSessionQueryRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/MyRecordsQueryRepository.kt`
- Create: `server/src/main/kotlin/com/readmates/archive/application/NotesFeedQueryRepository.kt`
- Modify affected backend tests for bean wiring/import changes.

- [x] Keep `ArchiveRepository` as the public bean used by existing controllers.
- [x] Extract archive session list/detail query logic.
- [x] Extract my page/my records query logic.
- [x] Extract notes feed/session filter query logic.
- [x] Keep SQL behavior unchanged.
- [x] Run `./server/gradlew -p server test --tests 'com.readmates.archive.*'`.
- [x] Run `./server/gradlew -p server test`.

Expected result: archive, my records, and notes feed changes can be made independently.

---

## Task 16 - Add Minimal API Contract Drift Coverage

**Files:**

- Create: `front/tests/unit/api-contract-fixtures.test.ts`
- Create: `front/tests/unit/api-contract-fixtures.ts`
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/tests/unit/auth-context.test.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`
- Modify: `front/tests/unit/member-session-detail-page.test.tsx`
- Modify: `front/tests/unit/host-session-editor.test.tsx`
- Modify: `front/tests/unit/feedback-document-page.test.tsx`
- Modify: `server/src/test/kotlin/com/readmates/auth/api/AuthMeControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/CurrentSessionControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/archive/api/ArchiveControllerDbTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/session/api/HostDashboardControllerTest.kt`
- Modify: `server/src/test/kotlin/com/readmates/feedback/api/FeedbackDocumentControllerTest.kt`

- [x] Identify 5 high-value contracts: auth me, current session, archive session detail, host session detail, feedback document.
- [x] Add frontend fixtures typed with `satisfies` so missing/extra critical fields surface during TypeScript checks.
- [x] Reuse fixtures in existing component tests where practical.
- [x] Add backend JSON assertions only for fields not already covered.
- [x] Do not introduce OpenAPI/codegen.
- [x] Run `pnpm --dir front exec tsc --noEmit`.
- [x] Run `pnpm --dir front test`.
- [x] Run targeted backend controller tests.

Expected result: future DTO drift is caught earlier without changing the build architecture.

---

## Task 17 - Final Regression And Documentation Closure

**Files:**

- Modify: this plan file checkboxes
- Modify: `README.md`
- Modify: `docs/deploy/cloudflare-pages-spa.md`

- [x] Ensure all task checkboxes reflect actual completion.
- [x] Run full frontend checks:

```bash
pnpm --dir front exec tsc --noEmit
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

- [x] Run full backend checks:

```bash
./server/gradlew -p server test
```

- [x] Run e2e if local MySQL and browser dependencies are available:

```bash
pnpm --dir front test:e2e
```

- [x] E2E ran locally; no MySQL/browser environment blocker to record.
- [x] Run `git status --short` and confirm only intended files changed.
- [x] Summarize completed phases, tests, and residual risks.

Task 17 verification notes (2026-04-21 KST):

- Existing completed checkboxes were reviewed against the current file layout and final regression checks; no earlier task checkbox needed to be reopened.
- `README.md` and `docs/deploy/cloudflare-pages-spa.md` already matched the Task 17 documentation closure needs, so they were left unchanged.
- Full frontend checks on the final tree:
  - `pnpm --dir front exec tsc --noEmit`: passed.
  - `pnpm --dir front lint`: passed.
  - `pnpm --dir front test`: passed, 35 files / 219 tests.
  - `pnpm --dir front build`: passed with the existing Vite chunk-size warning for a 520.50 kB JS bundle.
- Full backend checks:
  - `./server/gradlew -p server test`: passed, BUILD SUCCESSFUL.
- E2E:
  - First `pnpm --dir front test:e2e` attempt ran, proving local MySQL/browser dependencies were available, but failed because invite-page e2e assertions had drifted from the current Google-only legacy copy and strict text matching.
  - Updated only the affected e2e assertions to match the implemented invite copy and exact email element.
  - Final `pnpm --dir front test:e2e`: passed, 9 tests.
- Changed files are intended Task 17 closure files: this plan file plus two e2e specs needed to make the required e2e verification reflect current copy.
- Residual risk: Vite still reports the pre-existing large chunk warning; no functional regression remains from the required checks.

Expected result: the codebase has reliable checks, consistent product language/display rules, and clearer module boundaries.
