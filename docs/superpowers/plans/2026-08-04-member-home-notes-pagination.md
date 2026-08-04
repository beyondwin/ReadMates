# Member Home And Guest Notes Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix member-home spacing and mobile card overlap while making guest notes pagination operate on the selected session instead of the club-wide feed.

**Architecture:** Preserve member-home component boundaries and adjust semantic classes plus mobile layout CSS. Extend the anonymous-safe guest browse read slice with an optional session filter bound into its opaque cursor, then thread that filter through the frontend API/query/loader/route layers.

**Tech Stack:** React 19, React Router 8, TanStack Query 5, Vitest/Testing Library, Kotlin/Spring Boot, JDBC/MySQL, JUnit 5, Gradle.

## Global Constraints

- Keep `PUBLISHED + GUEST_READABLE` as the guest notes visibility contract.
- Keep browser traffic on the same-origin `/api/bff/**` path.
- Preserve 44px minimum touch targets and existing Korean action copy.
- Do not add a migration, change member-only `/api/notes/**`, push, or deploy.
- Use `corepack pnpm` so the repository-pinned `pnpm@11.13.1` executes frontend commands.

---

### Task 1: Session-scoped guest notes API

**Files:**
- Modify: `server/src/main/kotlin/com/readmates/browse/adapter/in/web/GuestBrowseController.kt`
- Modify: `server/src/main/kotlin/com/readmates/browse/application/port/in/GuestBrowseUseCases.kt`
- Modify: `server/src/main/kotlin/com/readmates/browse/application/port/out/LoadGuestRecordBrowsePort.kt`
- Modify: `server/src/main/kotlin/com/readmates/browse/application/service/GuestBrowseQueryService.kt`
- Modify: `server/src/main/kotlin/com/readmates/browse/adapter/out/persistence/JdbcGuestRecordBrowseAdapter.kt`
- Test: `server/src/test/kotlin/com/readmates/browse/application/service/GuestBrowseQueryServiceTest.kt`
- Test: `server/src/test/kotlin/com/readmates/browse/api/GuestBrowseControllerDbTest.kt`

**Interfaces:**
- Consumes: optional HTTP `sessionId` plus existing `limit` and `cursor`.
- Produces: `listNotesFeed(clubSlug: String, sessionId: String?, requestedLimit: Int?, rawCursor: String?)` and `loadNotesFeed(clubSlug: String, sessionId: String?, cursor: GuestNoteFeedCursor?, limit: Int)`.

- [ ] **Step 1: Write failing service tests**

Create 21 fake feed rows and assert the cursor has literal `clubSlug`, `feedSessionId`, `sessionNumber`, `createdAt`, `sourceOrder`, `itemOrder`, and `itemId` entries. Assert the cursor is rejected for a different session and `not-a-uuid` is rejected before the port executes.

- [ ] **Step 2: Verify RED**

```bash
./server/gradlew -p server unitTest --tests com.readmates.browse.application.service.GuestBrowseQueryServiceTest
```

Expected: compilation or assertion failure because the service and cursor do not accept the session scope.

- [ ] **Step 3: Implement controller, service, port, and cursor scope**

Use these signatures and cursor field:

```kotlin
listNotesFeed(clubSlug, sessionId, limit, cursor)
loadNotesFeed(clubSlug, sessionId, parsedCursor, pageLimit + 1)
"feedSessionId" to sessionId.orEmpty()
```

Validate a non-null session ID with `UUID.fromString`. Require decoded `feedSessionId` to equal the current request's `sessionId.orEmpty()`.

- [ ] **Step 4: Implement JDBC session filtering**

Add `and sessions.id = ?` inside `eligible_sessions` only when `sessionId` is non-null and add its parameter immediately after `clubSlug`. Preserve all existing public-club, access-scope, publication-state, participant, visibility, and masking predicates.

- [ ] **Step 5: Verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 6: Add and run controller DB tests**

Test that selected-session responses contain only that published guest-readable session, one-item cursor pages have no duplicates, invalid UUID returns `400`, and unavailable/other-club/non-published IDs return an empty page.

```bash
./server/gradlew -p server integrationTest --tests com.readmates.browse.api.GuestBrowseControllerDbTest
```

Observe RED before completing production behavior and GREEN afterward.

- [ ] **Step 7: Commit**

```bash
git add server/src/main/kotlin/com/readmates/browse server/src/test/kotlin/com/readmates/browse
git commit -m "fix(server): scope guest notes pagination to session"
```

### Task 2: Selected-session guest notes route

**Files:**
- Modify: `front/features/guest-browse/api/guest-browse-api.ts`
- Modify: `front/features/guest-browse/queries/guest-browse-queries.ts`
- Modify: `front/features/guest-browse/route/guest-route-data.ts`
- Modify: `front/features/guest-browse/route/guest-scoped-app-route.tsx`
- Test: matching API, query, loader, and route `*.test.ts(x)` files.

**Interfaces:**
- Consumes: Task 1's optional public `sessionId` query parameter.
- Produces: `GuestNoteFeedPageRequest`, a session-aware query key, loader first page, and load-more callback.

- [ ] **Step 1: Write failing API/query tests**

Assert these literal boundaries:

```ts
"/api/bff/api/public/clubs/alpha/browse/notes/feed?limit=20&sessionId=session-3"
["guest-browse", "alpha", "note-feed", 20, "next", "session-3"]
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --dir front exec vitest run features/guest-browse/api/guest-browse-api.test.ts features/guest-browse/queries/guest-browse-queries.test.ts
```

- [ ] **Step 3: Implement request and query-key scoping**

Define `GuestNoteFeedPageRequest = GuestBrowsePage & { sessionId?: string | null }`, append `sessionId` only in `fetchGuestNoteFeed`, and include `page?.sessionId ?? null` in the note-feed key.

- [ ] **Step 4: Verify API/query GREEN**

Run Step 2. Expected: PASS.

- [ ] **Step 5: Write failing loader/route tests**

For `/clubs/alpha/app/notes?sessionId=session-3`, assert the first feed request carries `sessionId=session-3`. Click `더 보기`, assert the cursor request retains the same session ID, and assert its returned selected-session record appears.

- [ ] **Step 6: Verify route RED**

```bash
corepack pnpm --dir front exec vitest run features/guest-browse/route/guest-route-data.test.ts features/guest-browse/route/guest-scoped-app-route.test.tsx tests/unit/notes-feed-page.test.tsx
```

- [ ] **Step 7: Implement selected-session loader and pagination**

Read `sessionId` from `args.request.url`; when absent choose `selectNoteSession(guestNoteSessionsReadPage(sessions).items, null)?.sessionId`. Resolve the same active session in `GuestNotesRoute` and request:

```ts
guestNoteFeedQuery(clubSlug, { limit: 20, cursor, sessionId: activeSessionId })
```

- [ ] **Step 8: Verify route GREEN and commit**

Run Step 6, then:

```bash
git add front/features/guest-browse front/tests/unit/notes-feed-page.test.tsx
git commit -m "fix(front): paginate guest notes by selected session"
```

### Task 3: Member-home spacing and mobile card density

**Files:**
- Modify: `front/features/member-home/ui/member-home-current-session.tsx`
- Modify: `front/features/member-home/ui/member-home-records.tsx`
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/src/styles/globals.css`
- Test: matching member-home component and page tests.

**Interfaces:**
- Produces: `.rm-club-pulse`, `.rm-member-session-card__prep-heading`, `.rm-member-session-card__deadline`, and `MobileIconName` support for `chevron-right`.

- [ ] **Step 1: Write failing semantic structure tests**

Assert `ClubPulse` has `.rm-club-pulse`, preparation heading/deadline classes exist, and `세션 열기` contains a chevron icon while retaining its accessible link name and href.

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm --dir front exec vitest run features/member-home/ui/member-home-current-session.test.tsx features/member-home/ui/member-home-records.test.tsx tests/unit/member-home.test.tsx
```

- [ ] **Step 3: Implement JSX and CSS**

Add SVG path `M9 5l7 7-7 7`. Give `.rm-club-pulse` a 32px desktop top margin. Use a one-column prep heading with 4px gap and left-aligned deadline. Keep CTA minimum height 44px, reduce its top margin from 16px to 10px, and reduce body bottom padding from 22px to 14px.

- [ ] **Step 4: Verify GREEN and run detector**

Run Step 2, then:

```bash
impeccable_skill_root="${IMPECCABLE_SKILL_ROOT:?set IMPECCABLE_SKILL_ROOT to the loaded Impeccable skill directory}"
node "$impeccable_skill_root/scripts/detect.mjs" --json --scope layout front/features/member-home/ui/member-home-current-session.tsx front/features/member-home/ui/member-home-records.tsx front/shared/styles/mobile.css front/src/styles/globals.css
```

- [ ] **Step 5: Commit**

```bash
git add front/features/member-home/ui front/shared/styles/mobile.css front/src/styles/globals.css
git commit -m "fix(front): refine member home spacing"
```

### Task 4: Verification and local main integration

- [ ] **Step 1: Run canonical frontend gates**

```bash
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
```

- [ ] **Step 2: Run server and boundary gates**

```bash
./scripts/server-ci-check.sh
./server/gradlew -p server integrationTest --tests com.readmates.browse.api.GuestBrowseControllerDbTest
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
git diff --check main...HEAD
```

- [ ] **Step 3: Inspect browser states**

At desktop and mobile widths, inspect home section rhythm, deadline/cover separation, CTA density, and notes content/empty/multi-page states without restarting unrelated local processes.

- [ ] **Step 4: Merge and reverify**

Fast-forward `codex/fix-member-home-notes-pagination` into local `main`, then rerun focused frontend, service unit, controller integration, and diff checks on merged `main`.
