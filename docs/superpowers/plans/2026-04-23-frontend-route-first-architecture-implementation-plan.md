# ReadMates Frontend Route-First Architecture Implementation Plan

작성일: 2026-04-23
상태: READY FOR REVIEW

> **For agentic workers:** Implement task-by-task. Keep route behavior, auth behavior, visual design, and API response shapes intact unless a task explicitly says otherwise. Update checkboxes as work completes. Preserve unrelated worktree changes.

## Goal

Refactor the ReadMates frontend into a React Router 7 centered route-first feature architecture while preserving current product behavior.

Primary outcomes:

1. New frontend code has a clear home: `route`, `api`, `model`, `ui`, or `shared`.
2. Feature UI no longer fetches data directly.
3. Screen-specific derived logic moves out of large components into testable model functions.
4. Shared API code becomes a small HTTP primitive layer, not the whole application contract.
5. Import direction is automatically checked.
6. The existing user-visible design remains unchanged during the architecture migration.

## Source Documents

- Spec: `docs/superpowers/specs/2026-04-23-frontend-route-first-architecture-design.md`
- Frontend design context: `front/AGENTS.md`
- Current architecture context: `docs/development/architecture.md`
- Current React Router setup: `front/src/app/router.tsx`
- Current data compatibility hook: `front/src/pages/readmates-page-data.ts`

## Scope Guardrails

- Do not change backend API behavior or response shapes.
- Do not redesign UI while doing the architecture migration.
- Do not introduce TanStack Query or a new state-management library.
- Do not add a component library.
- Do not move every file in one commit.
- Do not remove compatibility exports until all imports have moved.
- Do not edit unrelated dirty files.
- Use React Router 7 loader/action APIs for route-scoped data once each route is converted.
- Keep Korean-first product copy unchanged unless a test requires a small accessibility label adjustment.

## Dirty Worktree Guardrails

At plan creation time, unrelated dirty files exist:

```text
 M front/src/app/route-continuity.ts
 M front/tests/e2e/google-auth-viewer.spec.ts
 M front/tests/unit/route-continuity.test.ts
 M front/tests/unit/spa-layout.test.tsx
```

Implementation workers must not revert those changes. If a task needs to edit one of those files, inspect it first:

```bash
git diff -- front/src/app/route-continuity.ts
git diff -- front/tests/e2e/google-auth-viewer.spec.ts
git diff -- front/tests/unit/route-continuity.test.ts
git diff -- front/tests/unit/spa-layout.test.tsx
```

Preserve unrelated edits in those files.

## Target Architecture

```text
front/
  src/
    app/
    pages/
  features/
    <feature>/
      api/
      model/
      route/
      ui/
      index.ts
  shared/
    api/
    lib/
    security/
    styles/
    ui/
```

Dependency direction:

```text
src/app -> src/pages -> features -> shared
```

Enforced restrictions:

- `shared` must not import `features`, `src/pages`, or `src/app`.
- One feature must not import another feature directly.
- `features/*/ui` must not import `shared/api`, feature API modules, `fetch`, or route modules.
- `features/*/model` must not import React, React DOM, React Router, or API client code.
- Route modules may call feature API and model functions, then pass plain props/callbacks to UI.

## Target File Map

### Boundary Tests

- Create: `front/tests/unit/frontend-boundaries.test.ts`

### Shared API

- Create: `front/shared/api/client.ts`
- Create: `front/shared/api/errors.ts`
- Create: `front/shared/api/response.ts`
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/tests/unit/readmates-fetch.test.ts`

### Current Session Feature

- Create: `front/features/current-session/api/current-session-api.ts`
- Create: `front/features/current-session/api/current-session-contracts.ts`
- Create: `front/features/current-session/model/current-session-form-model.ts`
- Create: `front/features/current-session/model/current-session-view-model.ts`
- Create: `front/features/current-session/route/current-session-route.tsx`
- Move existing current-session presentation code into: `front/features/current-session/ui/current-session-page.tsx`
- Extract from existing current-session presentation code: `front/features/current-session/ui/current-session-empty.tsx`
- Extract from existing current-session presentation code: `front/features/current-session/ui/current-session-board.tsx`
- Move existing current-session panels into: `front/features/current-session/ui/current-session-panels.tsx`
- Move existing current-session mobile board into: `front/features/current-session/ui/current-session-mobile.tsx`
- Create: `front/features/current-session/index.ts`
- Modify: `front/src/pages/current-session.tsx`
- Modify: `front/src/app/router.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`
- Modify: `front/tests/unit/current-session-actions.test.ts`

### Host Feature

- Create: `front/features/host/api/host-api.ts`
- Create: `front/features/host/api/host-contracts.ts`
- Create: `front/features/host/model/host-dashboard-model.ts`
- Create: `front/features/host/model/host-session-editor-model.ts`
- Create: `front/features/host/route/host-dashboard-route.tsx`
- Create: `front/features/host/route/host-session-editor-route.tsx`
- Create: `front/features/host/index.ts`
- Move existing host presentation components under `front/features/host/ui/` after host route/model boundaries are in place.
- Modify: `front/src/pages/host-dashboard.tsx`
- Modify: `front/src/pages/host-session-editor.tsx`
- Modify: `front/src/pages/host-members.tsx`
- Modify: `front/src/pages/host-invitations.tsx`
- Modify host unit tests under `front/tests/unit/`

### Remaining Features

- Add feature `api/model/route/ui` subsets for:
  - `front/features/archive`
  - `front/features/public`
  - `front/features/auth`
  - `front/features/feedback`
- Modify corresponding route shells in `front/src/pages/`
- Modify corresponding unit tests under `front/tests/unit/`

## Task 0: Capture Baseline And Confirm Plan Scope

**Files:** none expected.

- [x] **Step 1: Confirm dirty files**

Run:

```bash
git status --short --untracked-files=all
```

Expected: unrelated dirty files may match the dirty worktree guardrails above. Do not clean or revert them.

- [x] **Step 2: Run frontend baseline checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: PASS. If a check fails before architecture edits, add a `Baseline Failures` section to this plan with command output summary and continue only after the user confirms whether to fix baseline failures first.

- [x] **Step 3: Record current large-file targets**

Run:

```bash
wc -l front/features/host/components/host-dashboard.tsx \
  front/features/host/components/host-session-editor.tsx \
  front/features/archive/components/archive-page.tsx \
  front/features/current-session/components/current-session.tsx \
  front/shared/api/readmates.ts
```

Expected: output confirms the largest refactoring targets. Do not edit files in this step.

Output:

```text
  1425 front/features/host/components/host-dashboard.tsx
  1145 front/features/host/components/host-session-editor.tsx
  1014 front/features/archive/components/archive-page.tsx
   718 front/features/current-session/components/current-session.tsx
   590 front/shared/api/readmates.ts
  4892 total
```

### Baseline Failures

Captured on 2026-04-23 during Task 0 and resolved on rerun:

- Initial `pnpm --dir front lint`, `pnpm --dir front test`, and `pnpm --dir front build` failures were caused by missing frontend dependencies in `front/node_modules`.
- `pnpm --dir front install --frozen-lockfile` restored dependencies without lockfile changes.
- After installing dependencies, `pnpm --dir front lint`, `pnpm --dir front test`, and `pnpm --dir front build` all passed.

## Task 1: Add Frontend Dependency Boundary Test

**Files:**

- Create: `front/tests/unit/frontend-boundaries.test.ts`

- [x] **Step 1: Create recursive file collector**

Add a Vitest test that recursively reads `front/src`, `front/features`, and `front/shared` using Node `fs` and `path`. Keep it dependency-free; do not add a glob package.

- [x] **Step 2: Parse static import specifiers**

Detect static imports with a conservative regex covering:

```text
import ... from "..."
export ... from "..."
```

This test is a boundary guard, not a TypeScript parser. It should prefer clear error messages over clever parsing.

- [x] **Step 3: Enforce shared restrictions**

Fail when any file under `front/shared` imports:

```text
@/features/
@/src/pages/
@/src/app/
```

- [x] **Step 4: Enforce feature-to-feature restrictions**

Fail when a file under `front/features/<feature>` imports another feature directly:

```text
@/features/<other-feature>/
```

Allow same-feature imports.

- [x] **Step 5: Enforce model restrictions**

Fail when `front/features/*/model/*` imports:

```text
react
react-dom
react-router-dom
@/shared/api/
@/features/*/api/
```

- [x] **Step 6: Enforce UI restrictions**

Fail when `front/features/*/ui/*` imports:

```text
@/shared/api/
@/features/*/api/
@/features/*/route/
```

Also scan UI source text for direct `fetch(` calls and fail with a message pointing to the route/API boundary.

- [x] **Step 7: Run the new focused test**

Run:

```bash
pnpm --dir front test -- frontend-boundaries.test.ts
```

Expected: PASS. If current code violates future-only `ui` restrictions because files still live under `components`, keep the test scoped to new `ui` directories until the relevant feature is moved.

- [x] **Step 8: Commit Task 1**

Commit only the boundary test:

```bash
git add front/tests/unit/frontend-boundaries.test.ts
git commit -m "test: add frontend architecture boundaries"
```

## Task 2: Split Shared API Primitives With Compatibility Exports

**Files:**

- Create: `front/shared/api/client.ts`
- Create: `front/shared/api/errors.ts`
- Create: `front/shared/api/response.ts`
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/tests/unit/readmates-fetch.test.ts`

- [x] **Step 1: Move HTTP error model**

Create `front/shared/api/errors.ts` with:

- `ReadmatesApiError`
- `isReadmatesApiError(error)` type guard
- `apiErrorFromResponse(response)` helper for preserving status and response metadata

Do not change user-visible redirect behavior yet.

- [x] **Step 2: Move response helpers**

Create `front/shared/api/response.ts` for JSON parsing and 204 handling.

- [x] **Step 3: Move fetch primitives**

Create `front/shared/api/client.ts` and move:

- `readmatesFetchResponse`
- `readmatesFetch`

Keep signatures compatible.

- [x] **Step 4: Keep `readmates.ts` compatibility exports**

Leave API contract types in `front/shared/api/readmates.ts` for now. Re-export fetch primitives from the new files so existing imports continue to work:

```ts
export { readmatesFetch, readmatesFetchResponse } from "@/shared/api/client";
```

- [x] **Step 5: Update API tests**

Update direct primitive assertions in `front/tests/unit/readmates-fetch.test.ts` to import from the new primitive module. Keep one compatibility assertion that importing from `readmates.ts` still works.

- [x] **Step 6: Run focused checks**

Run:

```bash
pnpm --dir front test -- readmates-fetch.test.ts frontend-boundaries.test.ts
pnpm --dir front lint
```

Expected: PASS.

- [x] **Step 7: Commit Task 2**

```bash
git add front/shared/api front/tests/unit/readmates-fetch.test.ts
git commit -m "refactor: split frontend api primitives"
```

## Task 3: Extract Current Session API And Contracts

**Files:**

- Create: `front/features/current-session/api/current-session-contracts.ts`
- Create: `front/features/current-session/api/current-session-api.ts`
- Modify: `front/shared/api/readmates.ts`
- Modify: `front/tests/unit/current-session-actions.test.ts`

- [x] **Step 1: Move current-session contracts**

Move only current-session related types from `front/shared/api/readmates.ts` into `front/features/current-session/api/current-session-contracts.ts`:

- `RsvpStatus`
- `AttendanceStatus`
- `SessionParticipationStatus` if only current-session/host consumers need it
- `CurrentSessionResponse`
- `UpdateRsvpRequest`
- `UpdateRsvpResponse`
- `CheckinRequest`
- `CheckinResponse`
- `CreateQuestionRequest`
- `QuestionResponse`

If a type is shared by host/archive too, keep a compatibility export from `readmates.ts` until those features are migrated.

- [x] **Step 2: Create current-session API client**

Create `front/features/current-session/api/current-session-api.ts` with functions:

- `getCurrentSession()`
- `updateCurrentSessionRsvp(status)`
- `saveCurrentSessionCheckin(readingProgress, note)`
- `saveCurrentSessionQuestions(questions)`
- `saveCurrentSessionOneLineReview(text)`
- `saveCurrentSessionLongReview(body)`

Use `readmatesFetch` or `readmatesFetchResponse` from `shared/api/client`.

- [x] **Step 3: Update existing action modules to delegate**

Update current files under `front/features/current-session/actions/` to call the new API functions. This preserves existing component imports while moving endpoint knowledge into the new API layer.

- [x] **Step 4: Update tests**

Update `front/tests/unit/current-session-actions.test.ts` to assert endpoint behavior through the new API client or through compatibility action delegates.

- [x] **Step 5: Run focused checks**

```bash
pnpm --dir front test -- current-session-actions.test.ts readmates-fetch.test.ts frontend-boundaries.test.ts
pnpm --dir front lint
```

Expected: PASS.

- [x] **Step 6: Commit Task 3**

```bash
git add front/features/current-session front/shared/api/readmates.ts front/tests/unit/current-session-actions.test.ts
git commit -m "refactor: extract current session api"
```

## Task 4: Extract Current Session Model Functions

**Files:**

- Create: `front/features/current-session/model/current-session-form-model.ts`
- Create: `front/features/current-session/model/current-session-view-model.ts`
- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/features/current-session/components/current-session-question-editor-utils.ts`
- Create or modify: `front/tests/unit/current-session-model.test.ts`
- Modify: `front/tests/unit/current-session.test.tsx`

- [ ] **Step 1: Extract form model**

Move question form calculations into `current-session-form-model.ts`:

- initial question input normalization
- minimum question count rule
- maximum question count rule
- trimmed question payload
- validation messages

Keep Korean copy identical.

- [ ] **Step 2: Extract view model**

Move read-only derived values into `current-session-view-model.ts`:

- can write state
- viewer/suspended notice selection
- board tab counts
- feedback access state if currently embedded in panels
- save status labels if reusable

- [ ] **Step 3: Add model tests**

Create focused tests for form validation and permission-derived UI state. These tests must not render React.

- [ ] **Step 4: Replace inline logic in component**

Update `current-session.tsx` to call model functions. Keep JSX structure and CSS classes unchanged.

- [ ] **Step 5: Run focused checks**

```bash
pnpm --dir front test -- current-session-model.test.ts current-session.test.tsx current-session-actions.test.ts frontend-boundaries.test.ts
pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add front/features/current-session front/tests/unit/current-session-model.test.ts front/tests/unit/current-session.test.tsx
git commit -m "refactor: extract current session models"
```

## Task 5: Convert Current Session To Route Module

**Files:**

- Create: `front/features/current-session/route/current-session-route.tsx`
- Create: `front/features/current-session/index.ts`
- Modify: `front/src/pages/current-session.tsx`
- Modify: `front/src/app/router.tsx`
- Modify: `front/features/current-session/components/current-session.tsx`
- Modify: `front/tests/unit/current-session.test.tsx`
- Modify: `front/tests/unit/spa-router.test.tsx`

- [ ] **Step 1: Create route loader**

Create `currentSessionLoader` that loads:

- auth state through the existing auth endpoint
- current session through `getCurrentSession()`

The loader should return plain route data. Preserve the current loading/error behavior as closely as possible.

- [ ] **Step 2: Create route component**

Create a route component that reads loader data and renders the existing current-session UI.

- [ ] **Step 3: Introduce route action compatibility**

Add a route action shape for current-session mutations. Start with the simplest mutation path that does not require UI redesign. If full action conversion would make the task too large, keep existing action delegates and document the remaining action conversion as a checkbox inside this task before committing.

- [ ] **Step 4: Wire router**

Update `front/src/app/router.tsx` so `/app/session/current` uses the current-session route module. Keep route path unchanged.

- [ ] **Step 5: Shrink page shell**

Update `front/src/pages/current-session.tsx` to re-export or delegate to the route module. It should no longer contain direct data fetching.

- [ ] **Step 6: Update tests**

Update router/page tests so they exercise loader-backed rendering. Preserve existing behavioral assertions.

- [ ] **Step 7: Run checks**

```bash
pnpm --dir front test -- current-session.test.tsx current-session-actions.test.ts spa-router.test.tsx frontend-boundaries.test.ts
pnpm --dir front lint
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add front/features/current-session front/src/pages/current-session.tsx front/src/app/router.tsx front/tests/unit/current-session.test.tsx front/tests/unit/spa-router.test.tsx
git commit -m "refactor: route current session through loader"
```

## Task 6: Move Current Session UI Into `ui`

**Files:**

- Move: `front/features/current-session/components/current-session.tsx` -> `front/features/current-session/ui/current-session-page.tsx`
- Move or split existing current-session component files into `front/features/current-session/ui/`
- Modify: `front/features/current-session/index.ts`
- Modify imports in current-session tests and route files

- [ ] **Step 1: Move files without changing behavior**

Move current-session presentation files from `components` to `ui`. Keep compatibility exports if many imports still point to `components`.

- [ ] **Step 2: Split board and empty state**

Extract:

- `CurrentSessionEmpty`
- `CurrentSessionBoard`
- `CurrentSessionPage`

Keep CSS class names and markup behavior stable.

- [ ] **Step 3: Make UI fetch-free**

Ensure files under `front/features/current-session/ui` do not import shared API, feature API, or route modules. The boundary test must enforce this.

- [ ] **Step 4: Run checks**

```bash
pnpm --dir front test -- current-session.test.tsx current-session-model.test.ts frontend-boundaries.test.ts
pnpm --dir front lint
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add front/features/current-session front/tests/unit/current-session.test.tsx
git commit -m "refactor: move current session ui behind feature boundary"
```

## Task 7: Extract Host Dashboard And Session Editor Models

**Files:**

- Create: `front/features/host/model/host-dashboard-model.ts`
- Create: `front/features/host/model/host-session-editor-model.ts`
- Modify: `front/features/host/components/host-dashboard.tsx`
- Modify: `front/features/host/components/host-session-editor.tsx`
- Modify: `front/features/host/components/host-session-schedule.ts`
- Create: `front/tests/unit/host-dashboard-model.test.ts`
- Create: `front/tests/unit/host-session-editor-model.test.ts`
- Modify existing host tests

- [ ] **Step 1: Extract host dashboard derived state**

Move these calculations out of `host-dashboard.tsx`:

- session phase
- D-day label
- session metrics
- publication/feedback rows
- missing current-session members summary
- next operation action
- checklist rows

- [ ] **Step 2: Add host dashboard model tests**

Cover no-session, upcoming session, D-day, overdue session, pending publication, pending feedback, and missing member cases.

- [ ] **Step 3: Extract host session editor model**

Move these editor-only calculations out of `host-session-editor.tsx` and `host-session-schedule.ts`:

- default date/time/deadline values
- request normalization
- optional URL/passcode normalization
- feedback/publication state helpers
- destructive action availability

- [ ] **Step 4: Add editor model tests**

Cover new session defaults, edit-session hydration, optional field trimming, deadline defaults, and invalid schedule handling.

- [ ] **Step 5: Run checks**

```bash
pnpm --dir front test -- host-dashboard-model.test.ts host-session-editor-model.test.ts host-dashboard.test.tsx host-session-editor.test.tsx frontend-boundaries.test.ts
pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add front/features/host front/tests/unit/host-dashboard-model.test.ts front/tests/unit/host-session-editor-model.test.ts front/tests/unit/host-dashboard.test.tsx front/tests/unit/host-session-editor.test.tsx
git commit -m "refactor: extract host feature models"
```

## Task 8: Extract Host API And Route Modules

**Files:**

- Create: `front/features/host/api/host-contracts.ts`
- Create: `front/features/host/api/host-api.ts`
- Create: `front/features/host/route/host-dashboard-route.tsx`
- Create: `front/features/host/route/host-session-editor-route.tsx`
- Create: `front/features/host/route/host-members-route.tsx`
- Create: `front/features/host/route/host-invitations-route.tsx`
- Create: `front/features/host/index.ts`
- Modify: `front/src/pages/host-dashboard.tsx`
- Modify: `front/src/pages/host-session-editor.tsx`
- Modify: `front/src/pages/host-members.tsx`
- Modify: `front/src/pages/host-invitations.tsx`
- Modify: `front/src/app/router.tsx`
- Modify host unit tests

- [ ] **Step 1: Move host contracts**

Move host-specific contracts out of `front/shared/api/readmates.ts` into `host-contracts.ts`, leaving compatibility exports during migration.

- [ ] **Step 2: Create host API client**

Move host endpoint calls into `host-api.ts`:

- dashboard
- session detail
- create/update session
- delete preview/delete session
- attendance
- publication
- members
- invitations

- [ ] **Step 3: Create route modules**

Create route modules for host dashboard, session editor, members, and invitations. Route modules own loader/action calls and pass props/callbacks into UI.

- [ ] **Step 4: Shrink page shells**

Update `src/pages/host-*.tsx` files so they delegate to feature route modules and do not fetch directly.

- [ ] **Step 5: Run checks**

```bash
pnpm --dir front test -- host-dashboard.test.tsx host-session-editor.test.tsx host-members.test.tsx host-invitations.test.tsx frontend-boundaries.test.ts
pnpm --dir front lint
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 8**

```bash
git add front/features/host front/src/pages/host-dashboard.tsx front/src/pages/host-session-editor.tsx front/src/pages/host-members.tsx front/src/pages/host-invitations.tsx front/src/app/router.tsx front/tests/unit
git commit -m "refactor: route host feature data through feature modules"
```

## Task 9: Convert Archive Feature

**Files:**

- Create: `front/features/archive/api/archive-contracts.ts`
- Create: `front/features/archive/api/archive-api.ts`
- Create: `front/features/archive/model/archive-model.ts`
- Create: `front/features/archive/model/notes-feed-model.ts`
- Create route modules under `front/features/archive/route/`
- Move or split UI under `front/features/archive/ui/`
- Modify: `front/src/pages/archive.tsx`
- Modify: `front/src/pages/member-session.tsx`
- Modify: `front/src/pages/my-page.tsx`
- Modify: `front/src/pages/notes.tsx`
- Modify archive unit tests

- [ ] **Step 1: Move archive contracts and endpoint calls**

Move archive, member session, my page, feedback list, notes feed contracts and endpoint calls into archive feature API files.

- [ ] **Step 2: Extract archive models**

Move filter, sort, attendance summary, notes session selection, and display label logic into model files.

- [ ] **Step 3: Create route modules**

Create route modules for archive list, member session detail, notes feed, and my page.

- [ ] **Step 4: Move UI files**

Move archive presentation components into `ui` after route/model boundaries are in place.

- [ ] **Step 5: Run checks**

```bash
pnpm --dir front test -- archive-page.test.tsx member-session-detail-page.test.tsx my-page.test.tsx notes-page.test.tsx notes-feed-page.test.tsx frontend-boundaries.test.ts
pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 6: Commit Task 9**

```bash
git add front/features/archive front/src/pages/archive.tsx front/src/pages/member-session.tsx front/src/pages/my-page.tsx front/src/pages/notes.tsx front/tests/unit
git commit -m "refactor: route archive feature through feature modules"
```

## Task 10: Convert Public, Auth, And Feedback Features

**Files:**

- Public:
  - `front/features/public/api/*`
  - `front/features/public/model/*`
  - `front/features/public/route/*`
  - `front/features/public/ui/*`
  - `front/src/pages/public-home.tsx`
  - `front/src/pages/about.tsx`
  - `front/src/pages/public-records.tsx`
  - `front/src/pages/public-session.tsx`
- Auth:
  - `front/features/auth/api/*`
  - `front/features/auth/route/*`
  - `front/features/auth/ui/*`
  - `front/src/pages/login.tsx`
  - `front/src/pages/invite.tsx`
  - `front/src/pages/reset-password.tsx`
  - `front/src/pages/pending-approval.tsx`
- Feedback:
  - `front/features/feedback/api/*`
  - `front/features/feedback/model/*`
  - `front/features/feedback/route/*`
  - `front/features/feedback/ui/*`
  - `front/src/pages/feedback-document.tsx`
  - `front/src/pages/feedback-print.tsx`

- [ ] **Step 1: Convert public routes**

Move public contracts, endpoint calls, display fallbacks, and route data loading into public feature modules.

- [ ] **Step 2: Convert auth routes**

Move invite preview, login/dev-login, reset-password gone state, pending approval loader, and logout helpers into auth feature modules. Keep OAuth redirect URLs unchanged.

- [ ] **Step 3: Convert feedback routes**

Move feedback document contracts, endpoint calls, display model, and print route data into feedback feature modules.

- [ ] **Step 4: Run checks**

```bash
pnpm --dir front test -- public-home.test.tsx public-club.test.tsx public-records-page.test.tsx public-session-page.test.tsx login-card.test.tsx invite-acceptance-card.test.tsx pending-approval.test.tsx feedback-document-page.test.tsx feedback-document-route.test.tsx frontend-boundaries.test.ts
pnpm --dir front lint
```

Expected: PASS.

- [ ] **Step 5: Commit Task 10**

```bash
git add front/features/public front/features/auth front/features/feedback front/src/pages front/tests/unit
git commit -m "refactor: route remaining frontend features through feature modules"
```

## Task 11: Remove API Compatibility And Legacy Data Hook

**Files:**

- Modify: `front/shared/api/readmates.ts`
- Modify: `front/src/pages/readmates-page-data.ts`; delete it only after Task 11 Step 3 confirms no references remain.
- Modify imports across `front/src`, `front/features`, `front/shared`, `front/tests`
- Modify: `front/tests/unit/frontend-boundaries.test.ts`

- [ ] **Step 1: Find remaining compatibility imports**

Run:

```bash
rg "@/shared/api/readmates" front/src front/features front/shared front/tests
rg "useReadmatesData|requestReadmatesRouteRefresh|ReadmatesPageState" front/src front/features front/tests
```

Expected: remaining uses are understood before editing.

- [ ] **Step 2: Move remaining contracts**

Move remaining feature-specific contracts out of `shared/api/readmates.ts`. Keep only truly shared primitive types if any remain.

- [ ] **Step 3: Remove compatibility route hook**

Remove `useReadmatesData` and `requestReadmatesRouteRefresh` once route loaders/actions cover all pages. If `ReadmatesPageState` is still useful as a pure loading/error view, move it to a shared route UI module without data-loading behavior.

- [ ] **Step 4: Tighten boundary test**

Make the boundary test fail on old compatibility patterns:

- feature route/page direct import from `shared/api/readmates` when feature API exists
- `features/*/components` as a long-term public location if the feature has moved to `ui`

- [ ] **Step 5: Run checks**

```bash
pnpm --dir front test -- frontend-boundaries.test.ts readmates-fetch.test.ts spa-router.test.tsx
pnpm --dir front lint
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 11**

```bash
git add front/shared/api/readmates.ts front/src front/features front/tests
git commit -m "refactor: remove frontend api compatibility layer"
```

## Task 12: Full Frontend Verification

**Files:** none expected unless fixing issues discovered by checks.

- [ ] **Step 1: Run all unit and build checks**

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: PASS.

- [ ] **Step 2: Run targeted e2e flows**

Run the existing high-value flows:

```bash
pnpm --dir front test:e2e -- tests/e2e/dev-login-session-flow.spec.ts
pnpm --dir front test:e2e -- tests/e2e/public-auth-member-host.spec.ts
pnpm --dir front test:e2e -- tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected: PASS. If local backend or database prerequisites are missing, document the blocker in the implementation summary.

- [ ] **Step 3: Inspect final boundaries**

Run:

```bash
rg "@/shared/api/readmates" front/src front/features front/shared front/tests
rg "from \"@/features/.*/components" front/src front/features front/tests
rg "fetch\\(" front/features
```

Expected: remaining matches are either tests, allowed route/API modules, or explicitly justified.

- [ ] **Step 4: Update frontend architecture docs**

Update `docs/development/architecture.md` or a dedicated frontend architecture doc with the final route-first feature rules if the implementation changed any details from the spec.

- [ ] **Step 5: Final commit**

Commit documentation and any final cleanup:

```bash
git add docs/development/architecture.md front
git commit -m "docs: update frontend architecture after route-first refactor"
```

Only commit if files changed.

## Implementation Notes

- Prefer small commits matching the tasks above.
- When moving files, preserve git history where possible with `git mv`.
- Use `apply_patch` for manual edits.
- Do not use barrel exports to hide boundary violations. `index.ts` should expose a small public API, not every internal file.
- If a phase reveals that React Router action conversion would require UI redesign, stop at route loader conversion, document the remaining action work, and ask for approval before changing interaction design.
