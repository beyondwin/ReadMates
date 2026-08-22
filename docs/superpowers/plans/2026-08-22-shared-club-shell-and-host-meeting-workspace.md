# Shared Club Shell and Host Meeting Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 멤버이면서 호스트인 사용자가 같은 ReadMates 셸에서 역할과 현재 클럽을 잃지 않고 전환하고, 호스트가 `모임` 목록·생성·준비·출석·기록·알림·변경 내역을 반응형 작업공간에서 직관적으로 처리하게 한다.

**Architecture:** `src/app`이 canonical pathname과 loader authority로 global shell/workspace를 결정한다. `features/host/model`은 canonical language, local task mapping, lifecycle/action을 순수 함수로 제공하고, route가 URL·lazy query·draft·mutation을 조립한다. UI는 props/callback만 받는 Meeting Folio/Active Desk/Publication Desk composition으로 분해한다. 기존 record/import/history components는 재사용하지만 1,500줄대 editor와 1,300줄대 route에 새 책임을 추가하지 않는다.

**Tech Stack:** React 19, React Router 8, TanStack Query v5, TypeScript 6, Zod, Vite, Vitest, Testing Library, Component Testing, Playwright, existing ReadMates design system.

**Spec:** `docs/superpowers/specs/2026-08-22-host-meeting-workspace-redesign-design.md`

ADR impact: new — ADR-0018, ADR-0019, ADR-0020, ADR-0026, ADR-0027, ADR-0034, ADR-0035, ADR-0038

## Global Constraints

- Use `모임` in new visible copy, aria-label, current templates, browser-visible errors, and selectors. Preserve internal `session`, saved text, filenames, parser markers, and technical login-session copy.
- Global hierarchy is `account → club → member/host workspace → role primary nav → current-meeting task nav`.
- Desktop/tablet primary role nav is top horizontal; mobile uses the same four bottom positions. Current-meeting local navigation may be left only on wide/compact desktop.
- Club switcher and workspace selector are separate named controls. Mobile workspace selector is at least 44px and displays `멤버 공간` or `호스트 공간`.
- Workspace render authority is pathname plus authoritative loader auth. Stored last route may select a target but never select chrome.
- Role switch preserves a corresponding same-club object only when the target loader authorizes it. Club switch never carries source entity IDs, cursors, edit state, or unsafe hash/query.
- Host `/sessions`, `/records`, and `/` have distinct route ownership. `오늘` never embeds the current editor.
- Current meeting task navigation is unordered `개요 / 참석 응답 / 실제 출석 / 모임 기록 / 알림 / 변경 내역`; do not render steps, progress lines, ordinal positions, or fake completion.
- Loader fetches only auth/scope/session identity and base detail. Heavy record/history/dispatch queries are panel-driven and independent.
- Local input survives recoverable `REVISION_CONFLICT` and authorized `NETWORK_RESPONSE_LOST`; it is purged for authority revoke, suspension, or cross-club scope failure.
- Use server-provided revisions, receipt, projection, and reconciliation. Never infer commit from optimistic UI or retry blindly after response loss.
- `HostSessionEditor` and `host-session-editor-route.tsx` are migration sources, not destinations for additional orchestration. Delete compatibility branches after their call sites move.
- Visual language uses existing warm paper, ink hierarchy, ink-blue accent, 4pt spacing, small radii, border-first hierarchy, and shared light/dark tokens. No host palette, giant nested card, gradient, glow, glass, decorative paper texture, or generic KPI tile.
- Breakpoints are content viewport based: wide ≥1120, compact 1024–1119, tablet 768–1023, mobile 320–767. Remove any overlapping `max-width: 768px` behavior that gives 768px two layouts.
- One `h1`, named global/role/context navs, `aria-current`, status/alert distinction, focus trap/restore, reduced motion, 44px targets, scroll padding, and keyboard completion are release requirements.

## Requirement Handoff

| Requirement | Tasks |
| --- | --- |
| Canonical terminology and publication language | 1 |
| URL workspace authority and safe continuity | 2 |
| Four host destinations and distinct ownership | 3 |
| Common member/host shell | 4 |
| Current-meeting semantic navigation | 5 |
| v3 revisions/idempotency/receipt frontend contract | 6 |
| Club-scoped host cache and authority-loss purge | 7 |
| Lazy independent panels and route decomposition | 8 |
| Dedicated create route | 9 |
| Meeting Folio/adaptive/a11y visual implementation | 10 |

## Dependency Order

Tasks 1 and 2 can start independently. `1 + 2 + server-safety Task 2 multi-state query → 3 → 4`; `1 → 5`; `server v3 support + server safety plan → 6`; `2 + 4 + 6 → 7`; `5 + 6 + 7 → 8`; `1 + 4 + 6 + 7 → 9`; `3 + 4 + 5 + 8 + 9 → 10`. Task 4 is the only owner that integrates the shared shell into `app-route-layout.tsx`; Task 7 mounts its controller through the Task 4 extension point rather than editing the shell layout concurrently.

## File Responsibility Map

| Responsibility | Files |
| --- | --- |
| Product language | shared meeting-language/readmates-copy plus member/public/host formatters |
| URL and continuity | app workspace route model, layouts, route-continuity, member/host routes |
| Host IA | host route registry; meeting list and record list route/model/UI |
| Common shell | app club shell, workspace selector, top/mobile nav components |
| Local navigation | pure host meeting workspace/navigation models |
| v3 API | shared client generation plus host contracts/API/queries |
| Authority purge | host query-key inventory, sensitive storage registry, app controller |
| Route decomposition | host meeting workspace data/route and panel queries |
| Create | new-meeting model/route/UI |
| Visual workspace | meeting-workspace UI folder and existing shared style/token files |

---

### Task 1: Centralize canonical meeting language

**Files:**
- Create: `front/shared/model/meeting-language.ts`
- Create: `front/shared/model/meeting-language.test.ts`
- Create: `front/shared/model/meeting-language-allowlist.ts`
- Create: `front/shared/model/meeting-language-inventory.test.ts`
- Modify: `front/shared/ui/readmates-copy.ts`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/shared/ui/mobile-header.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/features/current-session/model/current-session-view-model.ts`
- Modify: `front/features/archive/model/archive-model.ts`
- Modify: `front/features/archive/ui/member-session-detail-page.tsx`
- Modify: `front/features/public/ui/public-session.tsx`
- Modify: `front/features/host/model/host-session-workspace-model.ts`
- Modify: `front/features/host/model/host-session-editor-view-model.ts`
- Modify: `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/features/host/ui/host-session-ledger.tsx`

**Interfaces:**

```ts
export type MeetingAudience = "host" | "member" | "guest" | "public";
export type MeetingPublicationAction =
  | "publishMemberNotes"
  | "removeMemberNotes"
  | "publishPublicRecord"
  | "removePublicRecord";
export function formatMeetingOrdinal(value: number, mode: "folio" | "sentence"): string;
export function formatMeetingLifecycle(state: SessionState, audience: MeetingAudience): string;
export function formatMeetingProjection(
  input: { state: SessionState; accessScope: AccessScope; siteVisibility: SiteVisibility },
  surface: "host" | "memberGuest" | "publicRecord",
): string;
export function formatPublicationAction(action: MeetingPublicationAction): string;
```

- [ ] **Step 1: Write RED dictionary tests.** Assert exact `모임`, `No.7`, `7번째 모임`, lifecycle labels, `참석 응답`, `실제 출석`, `기록에 반영`, and audience-specific publication actions. Assert projection labels consume lifecycle, access scope, and site visibility independently; no formatter derives public visibility from lifecycle alone. Include `세션` only for technical login-session fixtures.
- [ ] **Step 2: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run shared/model/meeting-language.test.ts`

  Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement pure formatters and migrate visible/ARIA call sites.** Do not rename API types, routes, DB fields, import markers, or stored notification rows.
- [ ] **Step 4: Run GREEN and targeted view-model tests.**

  Run: `corepack pnpm --dir front exec vitest run shared/model/meeting-language.test.ts features/current-session/model/current-session-view-model.test.ts features/host/model/host-session-workspace-model.test.ts`

  Expected: PASS.

- [ ] **Step 5: Run the executable frontend copy inventory.** `meeting-language-allowlist.ts` records only technical login-session identifiers, wire/storage compatibility strings, and immutable historical fixtures with owner and removal condition. The inventory test scans browser-visible copy, ARIA text, notification templates, and route labels; an unclassified `세션|회차|RSVP|기록 공개|공개 완료|공개 취소` hit fails. Server error/template migration is owned by server-safety Task 8 and must pass before product closeout.

  Run: `corepack pnpm --dir front exec vitest run shared/model/meeting-language-inventory.test.ts`

  Expected: PASS with every remaining hit tied to a version-controlled allowlist entry; no new user-facing mismatch.

- [ ] **Step 6: Check and commit.**

  Run: `git diff --check`

  Commit: `refactor(front): unify meeting product language`

---

### Task 2: Make canonical URLs authoritative for workspace continuity

**Files:**
- Create: `front/src/app/workspace-route-model.ts`
- Create: `front/src/app/workspace-route-model.test.ts`
- Modify: `front/src/app/layouts/app-route-layout.tsx`
- Modify: `front/src/app/layouts/app-route-layout.test.tsx`
- Modify: `front/src/app/layouts/club-app-route-layout.tsx`
- Modify: `front/src/app/route-continuity.ts`
- Modify: `front/tests/unit/route-continuity.test.ts`
- Modify: `front/src/app/routes/member.tsx`
- Modify: `front/src/app/routes/host.tsx`

**Interfaces:**

```ts
export type ClubWorkspace = "member" | "host";
export type SafeRouteFamily =
  | "today"
  | "notes-list"
  | "note-detail"
  | "records-list"
  | "record-detail"
  | "profile"
  | "meeting-detail"
  | "notification-list"
  | "account";
export function workspaceFromCanonicalPath(pathname: string): ClubWorkspace;
export function candidateRoleSwitchTarget(input: RoleSwitchCandidateInput): RoleSwitchCandidate;
export function resolveAuthorizedRoleSwitchTarget(input: {
  candidate: RoleSwitchCandidate;
  authorizedWorkspaces: ReadonlyArray<ClubWorkspace>;
  correspondence: "authorized" | "unavailable" | "unknown";
  lastSafeTarget: string | null;
}): string;
export function buildClubSwitchTarget(input: ClubSwitchInput): string;
export function canonicalizeCompatibilityEntry(input: CompatibilityEntryInput): string;
```

- [ ] **Step 1: Write RED pure-model tests.** Define the full member/host route-family correspondence table. Cover `/app/**` replace, same-object candidates, unsafe DRAFT/HOST_ONLY fallback, loader correspondence `authorized|unavailable|unknown`, authorized workspace list, last-safe fallback, explicit role-switch history push, authority-loss replace, and club switch allowlist.
- [ ] **Step 2: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run src/app/workspace-route-model.test.ts tests/unit/route-continuity.test.ts`

  Expected: FAIL because chrome still reads stored workspace state and the pure model does not exist.

- [ ] **Step 3: Implement pathname authority.** Delete `readStoredReadmatesMobileWorkspace` and `rememberReadmatesMobileWorkspace` after call-site migration. Last route memory may influence navigation target only.
- [ ] **Step 4: Implement safe club/role targets.** Strip source `sessionId`, cursor, edit route, one-time modal, invitation, query, and hash unless the target family explicitly owns an equivalent safe value.
- [ ] **Step 5: Run GREEN and route tests.**

  Run: `corepack pnpm --dir front exec vitest run src/app/workspace-route-model.test.ts src/app/layouts/app-route-layout.test.tsx tests/unit/route-continuity.test.ts src/app/routes/host.test.tsx`

  Expected: PASS.

- [ ] **Step 6: Run focused browser continuity.** Add role continuity coverage for direct entry, reload, resize, Back/Forward, member-only destination, revoked host, and same-object loader authorization.

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/multi-club-flow.spec.ts tests/e2e/public-auth-member-host.spec.ts`

  Expected: PASS.

- [ ] **Step 7: Check and commit.**

  Run: `git diff --check`

  Commit: `refactor(front): derive club workspace from canonical routes`

---

### Task 3: Separate host today, meeting list, and record list ownership

**Files:**
- Modify: `front/src/app/routes/host.tsx`
- Create: `front/src/app/host-routes/meeting-list-route-element.tsx`
- Create: `front/features/host/route/host-meeting-list-data.ts`
- Create: `front/features/host/route/host-meeting-list-route.tsx`
- Create: `front/features/host/model/host-meeting-list-model.ts`
- Create: `front/features/host/model/host-meeting-list-model.test.ts`
- Create: `front/features/host/ui/meeting-list/host-meeting-list.tsx`
- Create: `front/features/host/ui/meeting-list/host-meeting-list.test.tsx`
- Create: `front/src/app/host-route-destination-inventory.test.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/api/host-api.test.ts`
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/tests/unit/host-contract-zod.test.ts`
- Modify: `front/src/app/host-routes/session-ledger-route-element.tsx`
- Modify: `front/features/host/route/host-session-ledger-data.ts`
- Modify: `front/features/host/route/host-session-ledger-route.tsx`
- Modify: `front/features/host/model/host-session-ledger-model.ts`
- Modify: `front/features/host/ui/host-session-ledger.tsx`
- Modify: `front/features/host/route/host-dashboard-route.tsx`
- Modify: `front/features/host/ui/meeting-ledger/host-meeting-ledger.tsx`
- Modify: `front/features/host/route/host-session-editor-route.tsx`
- Modify: `front/src/app/route-continuity.ts`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/shared/ui/mobile-header.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/shared/observability/route-patterns.ts`
- Modify: `front/shared/observability/route-patterns.test.ts`

**Interfaces:**

```ts
export type HostMeetingListRow = {
  id: string;
  ordinal: number;
  title: string;
  meetingDate: string;
  lifecycleLabel: string;
  nextAction: { label: string; href: string };
  readerProjection: string;
  attention: ReadonlyArray<string>;
};
export type HostListMode = "meeting" | "record";
export type HostListCursorFailure = {
  code: "LIST_CURSOR_STALE";
  restartHref: string;
};
```

`/host` owns cross-meeting attention, `/host/sessions` owns DRAFT/OPEN/next-meeting list and create entry, `/host/records` owns CLOSED/PUBLISHED record work. `/host/sessions?view=trash` remains the compatibility trash URL and redirects/replaces to the named trash view owned by the meeting list; it never becomes a record-list filter. Both lists hard-depend on server-safety Task 2: meeting sends only `mode=meeting`, record sends only `mode=record`, and both treat the server cursor as opaque. The client never sends `state|states` with mode, never merges per-state cursors, and never re-sorts rows across pages. `LIST_CURSOR_STALE` discards accumulated page data, replaces to the canonical no-cursor URL, announces that the list changed, and restores list-heading focus. Zero/one/many behavior follows spec §9.

- [ ] **Step 1: Write RED route ownership, executable destination inventory, API mode/cursor, and list-model tests.** Assert four distinct host primary targets, zero-state single CTA, one active meeting direct work link, server-order preservation, and no editor body on `오늘`. Assert exact meeting/record modes, no mixed state parameters, opaque cursors, opposite-state DTO rejection, and `LIST_CURSOR_STALE → clear pages → canonical replace → announcement/focus`. Inventory every member/host/public destination and fail when CLOSED/PUBLISHED links target `/host/sessions`, or DRAFT/OPEN links target `/host/records`, unless a named compatibility redirect owns the entry.
- [ ] **Step 2: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run src/app/routes/host.test.tsx src/app/host-route-destination-inventory.test.ts features/host/api/host-api.test.ts tests/unit/host-contract-zod.test.ts features/host/model/host-meeting-list-model.test.ts features/host/ui/meeting-list/host-meeting-list.test.tsx`

  Expected: FAIL because `/sessions` and record ownership are currently conflated.

- [ ] **Step 3: Implement distinct route/data/model/UI boundaries.** Consume the server-owned meeting and record modes and their opaque epoch-guarded cursors; do not fetch/merge per-state pages or locally reorder cross-page rows. Handle typed cursor staleness with canonical replace, announcement, and focus rather than silently retrying the old cursor. Reuse existing queries only after their lifecycle filter, deterministic order, and projection fields match the new owner. Do not duplicate current-meeting editor or invent KPI cards.
- [ ] **Step 4: Run GREEN and existing ledger regressions.**

  Run: `corepack pnpm --dir front exec vitest run src/app/routes/host.test.tsx src/app/host-route-destination-inventory.test.ts features/host/api/host-api.test.ts tests/unit/host-contract-zod.test.ts features/host/model/host-meeting-list-model.test.ts features/host/ui/meeting-list/host-meeting-list.test.tsx features/host/model/host-session-ledger-model.test.ts features/host/ui/host-session-ledger.test.tsx`

  Expected: PASS.

- [ ] **Step 5: Check and commit.** The version-controlled destination inventory is the acceptance gate; ad-hoc search is diagnostic only.

  Run: `corepack pnpm --dir front exec vitest run src/app/host-route-destination-inventory.test.ts`

  Expected: every CLOSED/PUBLISHED record-list destination points to `/host/records`; remaining `/host/sessions` hits are create, DRAFT/OPEN meeting list/detail, or the documented trash compatibility entry.

  Run: `git diff --check`

  Commit: `feat(front): separate host meeting and record routes`

---

### Task 4: Compose one shared global club shell

**Files:**
- Create: `front/shared/ui/app-club-shell.tsx`
- Create: `front/shared/ui/app-club-shell.test.tsx`
- Create: `front/shared/ui/workspace-selector.tsx`
- Create: `front/shared/ui/workspace-selector.test.tsx`
- Create: `front/shared/model/app-club-shell.ts`
- Create: `front/src/app/app-route-security-controller.tsx`
- Create: `front/src/app/app-route-security-controller.test.tsx`
- Modify: `front/src/app/layouts/app-route-layout.tsx`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/shared/ui/mobile-header.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/tests/unit/responsive-navigation.test.tsx`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Modify: `front/tests/e2e/public-auth-member-host.spec.ts`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`
- Create: `front/shared/ui/app-club-shell.ct.tsx`

**Interfaces:**

```ts
export type AppClubShellProps = {
  clubs: ReadonlyArray<{ slug: string; name: string; href: string }>;
  currentClubSlug: string;
  workspace: "member" | "host";
  workspaceItems: ReadonlyArray<{ id: "member" | "host"; label: string; href: string }>;
  primaryItems: ReadonlyArray<PrimaryNavigationItem>;
  account: AccountMenuModel;
  children: React.ReactNode;
};
```

Platform admin reuses brand/account spine only and retains its cross-club system navigation.

- [ ] **Step 1: Write RED shell tests.** Assert presentation types live in shared and never import `src/app` or router models. Assert member/host share DOM regions and breakpoint interaction model; only items/targets differ. Assert `clubs[]`, `currentClubSlug`, separate named club/workspace links, authorized options only, 44px mobile selector, current workspace semantics, and platform-admin separation.
- [ ] **Step 2: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run shared/ui/app-club-shell.test.tsx shared/ui/workspace-selector.test.tsx src/app/layouts/app-route-layout.test.tsx tests/unit/responsive-navigation.test.tsx`

  Expected: FAIL because host/member chrome variants are separate.

- [ ] **Step 3: Implement the shared shell, a single security-controller extension point, and move ClubSwitcher into the global spine.** `app-route-layout.tsx` mounts `AppRouteSecurityController` exactly once; later security controllers compose through that named extension without editing the shell layout. `src/app` computes every href/history decision; shared UI only renders links and emits presentation events. Keep account/settings/logout feedback and update document title/focus/status after role switch.
- [ ] **Step 4: Normalize global shell breakpoints now.** Make 767px mobile and 768px tablet non-overlapping in `globals.css` and `mobile.css`; assert desktop/mobile visibility helpers, primary nav, workspace selector, and safe-area layout at both exact widths. Task 10 may add meeting-specific recipes but may not redefine the global boundary.
- [ ] **Step 5: Run GREEN, component, and browser tests.**

  Run: `corepack pnpm --dir front exec vitest run shared/ui/app-club-shell.test.tsx shared/ui/workspace-selector.test.tsx src/app/layouts/app-route-layout.test.tsx tests/unit/responsive-navigation.test.tsx`

  Run: `corepack pnpm --dir front test:ct`

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/responsive-navigation-chrome.spec.ts tests/e2e/public-auth-member-host.spec.ts`

  Expected: PASS.

- [ ] **Step 6: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(front): share the member and host club shell`

---

### Task 5: Replace progress navigation with a semantic local task model

**Files:**
- Modify or rename: `front/features/host/model/host-session-workspace-model.ts`
- Modify or rename: `front/features/host/model/host-session-workspace-model.test.ts`
- Modify or rename: `front/features/host/model/host-session-workspace-navigation.ts`
- Modify or rename: `front/features/host/model/host-session-workspace-navigation.test.ts`

**Interfaces:**

```ts
export type HostMeetingTask =
  | "overview"
  | "responses"
  | "attendance"
  | "records"
  | "notifications"
  | "history";
export type HostMeetingTaskLink = {
  task: HostMeetingTask;
  label: string;
  href: string;
  badge?: string;
};
export type HostMeetingLocation = {
  task: HostMeetingTask;
  overviewEditOpen: boolean;
  recordSource: "manual" | "ai" | "json";
};
```

- [ ] **Step 1: Write RED mapping tests.** Assert `section=basic` maps to overview edit, legacy JSON/AI links map to records, invalid values map to overview without mutation, unrelated query/hash is preserved, and Back/Forward produces the same semantic target.
- [ ] **Step 2: Write RED semantic tests.** Assert no ordinal/progress fields exist; badges only use stored counts/states; lifecycle/date changes the recommended primary action but never changes lifecycle itself.
- [ ] **Step 3: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run features/host/model/host-session-workspace-model.test.ts features/host/model/host-session-workspace-navigation.test.ts`

  Expected: FAIL because the current model includes progress semantics and lacks all six task targets.

- [ ] **Step 4: Implement pure parser/builder/view model.** Keep internal compatibility export names only until Task 8 migrates every import, then remove them.
- [ ] **Step 5: Run GREEN and commit.**

  Run: `corepack pnpm --dir front exec vitest run features/host/model/host-session-workspace-model.test.ts features/host/model/host-session-workspace-navigation.test.ts`

  Run: `git diff --check`

  Expected: PASS.

  Commit: `refactor(front): model meeting tasks as local navigation`

---

### Task 6: Adopt the v3 host mutation envelope and reconciliation

**Hard dependency:** backend and BFF are already deployed/configured in `SUPPORT_V2_V3`; server safety plan Tasks 1–7 expose stable DTOs. Do not flip the browser header before this condition is verified.

**Files:**
- Create: `front/shared/api/host-client-contract.ts`
- Modify: `front/shared/api/client.ts`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/api/host-contracts.ts`
- Modify: `front/features/host/api/host-session-record-api.ts`
- Modify: `front/features/host/api/host-session-record-contracts.ts`
- Modify: `front/features/host/api/host-session-recovery-api.ts`
- Modify: `front/features/host/api/host-session-recovery-contracts.ts`
- Modify: `front/features/host/queries/host-session-queries.ts`
- Modify: `front/features/host/queries/host-session-record-queries.ts`
- Modify: `front/tests/unit/readmates-fetch.test.ts`
- Modify: `front/tests/unit/host-contract-zod.test.ts`

**Interfaces:**

```ts
export type HostVersionVector = {
  sessionRevision: number;
  exposureRevision: number;
  participantSetRevision: number;
  recordDraftRevision: number | null;
  liveRecordRevision: number | null;
  publicationRevision: number;
};
export type HostMutationEnvelope<TCommand, TExpected> = {
  idempotencyKey: string;
  expected: TExpected;
  command: TCommand;
};
export type HostMutationReceipt = {
  receiptId: string;
  operation: string;
  resourceId: string;
  resultingVersions: HostVersionVector;
  notificationDecision: "NOT_SENT" | "DISPATCH_REFERENCED";
  projection: HostProjectionSnapshot;
};
export type HostClientCapability = {
  supportedHostClientContracts: ReadonlyArray<"v2" | "v3">;
  schemaVersion: 1;
};
```

Use `HostMutationEnvelope<TCommand, TExpected>` with exact, action-specific schemas: `ExpectedSessionRevision`, `AttendanceVersion[]`, close vector plus attendance snapshot ID, `ExpectedExposureRevision`, `ExpectedPublicationRevision`, `PublicationVersionVector`, and `CorrectionPublicationVersionVector`. Zod objects are strict; missing, extra, or wrong-domain revision fields fail before network submission.

`front/shared/api/host-client-contract.ts` fetches only `GET /api/bff/__internal/client-contract-status`, parses the exact no-store capability schema above, and fails closed on missing/unknown generations or schema versions. It never calls or reuses the secret-status endpoint because that surface intentionally exposes different operational metadata.

- [ ] **Step 1: Write RED schema/API tests.** For every adopted mutation, prove missing/extra/wrong-domain expected revision is rejected. Cover participant attendance versions, close attendance snapshot identity, publication/correction vectors, exact receipt `resourceId`, receipt/projection, same idempotency key reuse for reconciliation, explicit API context, no-store capability parsing, and all mutating `/api/host/**` receiving v3 while reads do not require it.
- [ ] **Step 2: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run tests/unit/readmates-fetch.test.ts features/host/api/host-api.test.ts features/host/api/host-session-record-api.test.ts tests/unit/host-contract-zod.test.ts`

  Expected: FAIL because the frontend is v2 and session writes lack the envelope.

- [ ] **Step 3: Implement schemas, exact capability preflight, and API methods from server DTOs.** Before the first host write in a document, fetch `/api/bff/__internal/client-contract-status`; if v3 is absent or its schema is unknown, block writes with `CLIENT_UPDATE_REQUIRED` while safe reads remain. Every host mutation receives explicit club/API context; do not infer club from `window.location` inside feature API modules.
- [ ] **Step 4: Implement reconciliation query/mutation helpers.** Response loss transitions to `checking`, fetches receipt/current state, and retries with the same key only after authoritative `NOT_EXECUTED`.
- [ ] **Step 5: Run GREEN and hook tests.**

  Run: `corepack pnpm --dir front exec vitest run tests/unit/readmates-fetch.test.ts features/host/api/host-api.test.ts features/host/api/host-session-record-api.test.ts tests/unit/host-contract-zod.test.ts features/host/queries/host-session-queries.hooks.test.tsx features/host/queries/host-session-record-queries.test.tsx`

  Expected: PASS.

- [ ] **Step 6: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(front): adopt host mutation contract v3`

---

### Task 7: Purge club-scoped host state on authority loss

**Files:**
- Create: `front/features/host/model/host-authority-loss.ts`
- Create: `front/features/host/model/host-authority-loss.test.ts`
- Create: `front/features/host/queries/host-state-purge.ts`
- Create: `front/features/host/queries/host-state-purge.test.ts`
- Create: `front/features/host/storage/host-sensitive-storage.ts`
- Create: `front/features/host/storage/host-sensitive-storage.test.ts`
- Create: `front/src/app/host-authority-loss-controller.tsx`
- Create: `front/src/app/host-authority-loss-controller.test.tsx`
- Create: `front/features/host/queries/host-query-key-inventory.test.ts`
- Modify: all host query-key factories under `front/features/host/queries/`
- Create: `front/features/host/queries/host-members-queries.test.ts`
- Create: `front/features/host/queries/host-invitation-queries.test.ts`
- Modify: `front/features/host/route/host-members-data.ts`
- Modify: `front/features/host/route/host-invitations-data.ts`
- Modify: `front/features/host/route/host-operations-route.tsx`
- Modify: `front/features/host/route/host-operations-route.test.tsx`
- Modify: `front/features/host/club/ui/ClubAiDefaultsSection.tsx`
- Modify: `front/features/host/club/ui/ClubAiDefaultsSection.test.tsx`
- Modify: `front/features/host/aigen/queries/aigen-job-queries.ts`
- Modify: `front/features/host/aigen/queries/aigen-job-queries.test.tsx`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.ts`
- Modify: `front/features/host/aigen/hooks/useAiGenerationJob.test.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.test.tsx`
- Modify: `front/features/host/aigen/ui/AiGenerateTab.draft-restoration.test.tsx`
- Modify: `front/features/host/aigen/storage/aigen-draft-storage.ts`
- Modify: `front/features/host/aigen/storage/aigen-draft-storage.test.tsx`
- Modify: `front/features/host/api/host-api.ts`
- Modify: `front/features/host/api/host-api.test.ts`
- Modify: `front/features/host/api/host-session-record-api.ts`
- Modify: `front/features/host/api/host-session-record-api.test.ts`
- Modify: `front/features/host/api/host-session-recovery-api.ts`
- Modify: `front/features/host/api/host-session-recovery-api.test.ts`
- Modify: `front/features/host/aigen/api/aigen-api.ts`
- Modify: `front/features/host/aigen/api/aigen-api.test.ts`
- Modify: `front/features/host/route/host-session-lifecycle-result.ts`
- Modify: `front/features/host/route/host-session-lifecycle-result.test.ts`
- Modify: `front/features/host/route/host-session-editor-route.test.tsx`
- Modify: `front/shared/api/errors.ts`
- Create: `front/shared/api/host-authority-event.ts`
- Create: `front/shared/api/host-authority-event.test.ts`
- Modify: `front/shared/api/client.ts`
- Modify: `front/src/app/query-client.ts`
- Modify: `front/src/app/route-continuity.ts`
- Modify: `front/src/app/app-route-security-controller.tsx`
- Modify: `front/src/app/app-route-security-controller.test.tsx`

**Interfaces:**

```ts
export type HostSecurityPurgeCode =
  | "HOST_AUTHORITY_REVOKED"
  | "MEMBERSHIP_SUSPENDED"
  | "CROSS_CLUB_SCOPE";
export async function purgeClubHostState(input: {
  clubSlug: string;
  queryClient: QueryClient;
  storage: HostSensitiveStorage;
}): Promise<void>;
```

`apiErrorFromResponse(response)` remains a pure generic parser for public/member/archive/feedback callers. Host code uses a separate `hostApiErrorFromResponse(response, { clubSlug, requestKind })` boundary that delegates to the generic parser and emits one typed authority event after the body is safely parsed. `readmatesFetch` does the same only when an explicit host context is supplied; it never fabricates club context for non-host requests. Every listed manual host caller migrates atomically with its test. An executable inventory rejects direct generic-parser imports/usages anywhere under `front/features/host/**`. The Task 4 `AppRouteSecurityController` subscribes once and performs `cancel → exact-club query/storage purge → safe replace → reason alert/focus`. Query/mutation code never infers club from the current pathname after the error.

Every host query key begins with a shared club-scoped prefix. The sensitive-storage registry owns meeting form drafts, record drafts, AI drafts, receipts/reconciliation, history, notification preview, and host-only return state.

- [ ] **Step 1: Write RED executable query-key/parser inventory and purge tests.** Standardize client scope on canonical `clubSlug`. Statically scan all `front/features/host/**`, including route/UI/hook code: reject literal `queryKey: ["host", ...]`, exported host key factories without mandatory clubSlug, and direct generic `apiErrorFromResponse` imports/usages. Inventory session/record/recovery/trash, member approval/invitation, notifications, AI jobs, and club operations. Assert exact-club cancel/remove, other-club isolation, storage deletion, no persisted cache resurrection, and in-flight response ignored after purge.
- [ ] **Step 2: Write RED signal/controller tests.** Inject every security code from both normal query helpers and manual response-parsing mutation callers with owning clubSlug. Assert one event, cancel → exact-club purge → replace with alert/focus; other club untouched. `REVISION_CONFLICT` and authorized `NETWORK_RESPONSE_LOST` emit no purge event and preserve draft.
- [ ] **Step 3: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run features/host/model/host-authority-loss.test.ts features/host/queries/host-query-key-inventory.test.ts features/host/queries/host-state-purge.test.ts features/host/queries/host-members-queries.test.ts features/host/queries/host-invitation-queries.test.ts features/host/storage/host-sensitive-storage.test.ts shared/api/host-authority-event.test.ts src/app/host-authority-loss-controller.test.tsx src/app/app-route-security-controller.test.tsx features/host/api/host-api.test.ts features/host/api/host-session-record-api.test.ts features/host/api/host-session-recovery-api.test.ts features/host/aigen/api/aigen-api.test.ts features/host/route/host-session-lifecycle-result.test.ts features/host/route/host-session-editor-route.test.tsx features/host/route/host-operations-route.test.tsx features/host/club/ui/ClubAiDefaultsSection.test.tsx features/host/aigen/queries/aigen-job-queries.test.tsx features/host/aigen/hooks/useAiGenerationJob.test.tsx features/host/aigen/ui/AiGenerateTab.test.tsx features/host/aigen/ui/AiGenerateTab.draft-restoration.test.tsx features/host/aigen/storage/aigen-draft-storage.test.tsx`

  Expected: FAIL because query keys/storage are not centrally enumerable.

- [ ] **Step 4: Migrate every host key, persisted draft, and manual host response parser to the registries/context boundary.** Include route/UI literal keys, member/invitation data callers, AI hook callers, notifications, session/record/recovery/trash, and club operations. Expose mandatory `registerHostSensitiveState({ clubSlug, resourceKey, clear })`; any later route-owned draft/receipt/preview must register before use. Keep the generic parser pure and require `{clubSlug, requestKind}` only in `hostApiErrorFromResponse`/explicit host fetch context so non-host callers need no fake club.
- [ ] **Step 5: Integrate cancel → purge → replace → alert/focus through `AppRouteSecurityController`.** Do not edit `app-route-layout.tsx` in this task. Back/Forward, new tab, offline/service worker cannot replay removed host content.
- [ ] **Step 6: Run GREEN and query regressions.**

  Run: `corepack pnpm --dir front exec vitest run features/host/model/host-authority-loss.test.ts features/host/queries/host-query-key-inventory.test.ts features/host/queries/host-state-purge.test.ts features/host/queries/host-members-queries.test.ts features/host/queries/host-invitation-queries.test.ts features/host/storage/host-sensitive-storage.test.ts shared/api/host-authority-event.test.ts src/app/host-authority-loss-controller.test.tsx src/app/app-route-security-controller.test.tsx features/host/api/host-api.test.ts features/host/api/host-session-record-api.test.ts features/host/api/host-session-recovery-api.test.ts features/host/aigen/api/aigen-api.test.ts features/host/route/host-session-lifecycle-result.test.ts features/host/route/host-session-editor-route.test.tsx features/host/route/host-operations-route.test.tsx features/host/club/ui/ClubAiDefaultsSection.test.tsx features/host/aigen/queries/aigen-job-queries.test.tsx features/host/aigen/hooks/useAiGenerationJob.test.tsx features/host/aigen/ui/AiGenerateTab.test.tsx features/host/aigen/ui/AiGenerateTab.draft-restoration.test.tsx features/host/aigen/storage/aigen-draft-storage.test.tsx features/host/queries/host-session-queries.test.ts features/host/queries/host-session-record-queries.test.tsx features/host/queries/host-notification-queries.test.ts`

  Expected: PASS.

- [ ] **Step 7: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(front): purge host state on authority loss`

---

### Task 8: Decompose the meeting route into lazy independent panels

**Files:**
- Create: `front/features/host/route/host-meeting-workspace-data.ts`
- Create: `front/features/host/route/host-meeting-workspace-route.tsx`
- Create: `front/features/host/route/host-meeting-workspace-route.test.tsx`
- Create: `front/features/host/queries/host-meeting-panel-queries.ts`
- Create: `front/features/host/queries/host-meeting-panel-queries.test.tsx`
- Create: `front/features/host/ui/meeting-workspace/host-meeting-workspace-route-frame.tsx`
- Create: `front/features/host/ui/meeting-workspace/host-meeting-workspace-route-frame.test.tsx`
- Modify: `front/src/app/host-routes/meeting-route-element.tsx`
- Modify: `front/src/app/host-routes/meeting-route-element.test.tsx`
- Reduce/remove compatibility exports from `front/features/host/route/host-session-editor-data.ts`
- Reduce/remove compatibility exports from `front/features/host/route/host-session-editor-route.tsx`
- Decompose orchestration from `front/features/host/ui/host-session-editor.tsx`
- Modify: `front/tests/unit/frontend-boundaries.test.ts`
- Modify: `front/features/host/storage/host-sensitive-storage.ts`
- Modify: `front/features/host/storage/host-sensitive-storage.test.ts`

**Interfaces:**

```ts
export type PanelLoadState<T> =
  | { kind: "loading" }
  | { kind: "known-empty" }
  | { kind: "unavailable"; retry: () => void }
  | { kind: "stale-cached"; data: T; observedAt: string; retry: () => void }
  | { kind: "ready"; data: T };
```

Base loader owns auth, club/session scope, host capability, and base detail only. Record/history/notification dispatch queries are enabled by current task and retain independent state. Action freshness blocks only the action that consumes stale/unavailable data.

- [ ] **Step 1: Write RED loader/query tests.** Assert unopened heavy panels do not fetch; record failure does not block basic/attendance; history/dispatch failure does not turn into empty; invalid section falls back without mutation; stale cached data displays timestamp and blocks only freshness-sensitive action.
- [ ] **Step 2: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run features/host/route/host-meeting-workspace-route.test.tsx features/host/queries/host-meeting-panel-queries.test.tsx src/app/host-routes/meeting-route-element.test.tsx`

  Expected: FAIL because current loader eagerly fetches multiple domains and the new route is absent.

- [ ] **Step 3: Implement route-first orchestration.** Route reads URL, owns drafts/mutations, seeds base query, selects lazy panel hooks, and passes pure props/callbacks to a minimal prop-only `HostMeetingWorkspaceRouteFrame`. Register every record draft, receipt/reconciliation result, and notification preview with host-sensitive storage before use.
- [ ] **Step 4: Migrate existing record/import/history/notification components behind panel adapters.** Do not copy their domain logic.
- [ ] **Step 5: Delete old eager query imports once no caller remains, but retain the explicit route-frame adapter until Task 10 performs the final visual presenter swap.**
- [ ] **Step 6: Run GREEN and boundary tests.**

  Run: `corepack pnpm --dir front exec vitest run features/host/route/host-meeting-workspace-route.test.tsx features/host/queries/host-meeting-panel-queries.test.tsx src/app/host-routes/meeting-route-element.test.tsx tests/unit/frontend-boundaries.test.ts`

  Expected: PASS.

- [ ] **Step 7: Check and commit.**

  Run: `git diff --check`

  Commit: `refactor(front): split the host meeting workspace route`

---

### Task 9: Build the dedicated new-meeting route

**Files:**
- Create: `front/features/host/model/new-host-meeting-model.ts`
- Create: `front/features/host/model/new-host-meeting-model.test.ts`
- Create: `front/features/host/route/new-host-meeting-route.tsx`
- Create: `front/features/host/route/new-host-meeting-route.test.tsx`
- Create: `front/features/host/ui/new-meeting/new-host-meeting-page.tsx`
- Create: `front/features/host/ui/new-meeting/new-host-meeting-page.test.tsx`
- Create: `front/features/host/ui/new-meeting/new-meeting-section-index.tsx`
- Modify: `front/src/app/host-routes/new-session-route-element.tsx`
- Reuse/refactor: `front/features/host/ui/session-editor/basic-session-panel.tsx`
- Modify: `front/features/host/storage/host-sensitive-storage.ts`
- Modify: `front/features/host/storage/host-sensitive-storage.test.ts`
- Create: `front/tests/e2e/host-new-meeting.spec.ts`

**Interfaces:**

```ts
export type NewMeetingDraft = {
  title: string;
  bookTitle: string;
  author: string;
  meetingDate: string;
  meetingTime: string;
  locationLabel: string;
  meetingUrl: string;
  meetingPasscode: string;
};
export type ScheduleSuggestionField<T> = {
  value: T;
  reason: string;
  sourceMeetingCount: number;
  sensitive: boolean;
};
```

Initial save result is explicitly `DRAFT + HOST_ONLY + HIDDEN`; `멤버와 준비 시작` is a separate confirmed transaction. Text limits use Unicode code points: 255 for title/book/author/location/passcode and 1000 for URL.

- [ ] **Step 1: Write RED model tests.** Cover max/max+1 with emoji/combining characters; per-field dirty/empty behavior; loading/error/no-history defaults; URL/passcode explicit opt-in; create success projection; server 400 field focus/input preservation.
- [ ] **Step 2: Write RED route/UI tests.** Assert dedicated page rather than modal/sheet, desktop index/form/judgment layout, mobile single column, one initial CTA, no notification, and separate prepare confirmation.
- [ ] **Step 3: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run features/host/model/new-host-meeting-model.test.ts features/host/route/new-host-meeting-route.test.tsx features/host/ui/new-meeting/new-host-meeting-page.test.tsx`

  Expected: FAIL because create is still owned by the current editor route.

- [ ] **Step 4: Implement model, route, and prop-only UI.** Defaults never overwrite touched or deliberately cleared fields; failure never blocks manual create. Register the full route-owned draft, including URL/passcode and create reconciliation, under canonical clubSlug and clear it on success/security purge.
- [ ] **Step 5: Run GREEN and focused 320px browser create flow.** `host-new-meeting.spec.ts` sets a 320px viewport, uses canonical `모임` labels/selectors, exercises mobile keyboard and safe-area layout, preserves max+1 field errors/focus, and proves create response-loss reconciliation does not duplicate the meeting.

  Run: `corepack pnpm --dir front exec vitest run features/host/model/new-host-meeting-model.test.ts features/host/route/new-host-meeting-route.test.tsx features/host/ui/new-meeting/new-host-meeting-page.test.tsx`

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/host-new-meeting.spec.ts`

  Expected: PASS.

- [ ] **Step 6: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(front): create meetings in a dedicated workspace`

---

### Task 10: Implement Meeting Folio, adaptive navigation, and complete UI states

**Pre-edit requirement:** invoke the available `$impeccable` skill immediately before UI edits and follow its current craft-floor guidance. Treat `docs/agents/design.md`, existing design-system tokens, and the approved spec as incumbent visual authority; do not persist machine-specific skill paths in repository docs.

**Files:**
- Create: `front/features/host/ui/meeting-workspace/host-meeting-workspace.tsx`
- Create: `front/features/host/ui/meeting-workspace/host-meeting-workspace.test.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-masthead.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-local-navigation.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-local-navigation.test.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-judgment-rail.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-response-ledger.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-response-ledger.test.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-notification-workspace.tsx`
- Create: `front/features/host/ui/meeting-workspace/host-meeting-workspace.ct.tsx`
- Create: `front/features/host/ui/meeting-workspace/meeting-local-navigation.ct.tsx`
- Create: `front/features/host/ui/new-meeting/new-host-meeting-page.ct.tsx`
- Modify: `front/features/host/route/host-meeting-workspace-route.tsx`
- Delete after final swap: `front/features/host/ui/meeting-workspace/host-meeting-workspace-route-frame.tsx`
- Delete after final swap: `front/features/host/ui/meeting-workspace/host-meeting-workspace-route-frame.test.tsx`
- Replace/remove: `front/features/host/ui/session-workspace/host-session-workspace.tsx`
- Replace/remove: `front/features/host/ui/session-workspace/workspace-focus-card.tsx`
- Replace/remove: `front/features/host/ui/session-workspace/workspace-progress-list.tsx`
- Reuse: existing attendance, record draft/apply, history, import, and notification components under `front/features/host/ui/`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`
- Modify only shared token defects: `design/system/src/styles/tokens.css`
- Create: `front/tests/e2e/host-meeting-workspace.spec.ts`
- Modify: `front/tests/e2e/host-session-hardening.spec.ts`
- Modify: `front/tests/e2e/host-session-record-preview.spec.ts`
- Modify: `front/tests/e2e/host-session-record-revisions.spec.ts`
- Modify: `front/tests/e2e/session-closing-flywheel.spec.ts`

**Interfaces:**

```ts
export type HostMeetingWorkspaceProps = {
  identity: MeetingIdentityModel;
  tasks: ReadonlyArray<HostMeetingTaskLink>;
  activeTask: HostMeetingTask;
  primaryAction: MeetingPrimaryActionModel;
  panel: MeetingPanelViewModel;
  judgment: MeetingJudgmentModel;
  announcements: ReadonlyArray<MeetingAnnouncement>;
  LinkComponent: React.ComponentType<{ to: string; children: React.ReactNode }>;
  onTaskLinkActivated: (task: HostMeetingTask) => void;
  onPrimaryAction: () => void;
  onRetryPanel: () => void;
};
```

Every task entry renders its canonical `href` as a real link inside named `<nav>`. The callback only closes/restores focus and never substitutes for navigation. Tablet overflow is measured with `ResizeObserver` against the actual content container; overflow or unreadable wrapping selects the named non-modal popover, while mobile always uses the modal sheet.

- [ ] **Step 1: Write RED semantic/UI tests.** Assert one h1; distinct accessible names for global/role/context nav; aria-current; no stepper/tablist; task sheet focus trap/Escape/backdrop/trigger restore; route-heading focus after selection; status versus alert; current action placement; and all load states.
- [ ] **Step 2: Write RED responsive component fixtures.** Cover 320/390/768/1024/1440, 200% zoom, long Korean/English, light/dark, reduced motion, mobile keyboard/safe area, and 0/1/50/500 member rows.
- [ ] **Step 3: Run RED.**

  Run: `corepack pnpm --dir front exec vitest run features/host/ui/meeting-workspace`

  Run: `corepack pnpm --dir front test:ct`

  Expected: FAIL because Meeting Folio components and adaptive local navigation do not exist.

- [ ] **Step 4: Implement responsive composition.** Wide: masthead + local index + work surface + judgment rail. Compact: judgment below. Tablet: unordered strip, with measured overflow/200% zoom/long-label fallback to a named anchored non-modal popover. Mobile: full-width named trigger and modal bottom sheet, labeled records, bottom-safe actions. Test 768px exact boundary, popover keyboard/dismiss, sheet focus trap/restore, link activation, and route-heading focus.
- [ ] **Step 5: Implement workflow panels and final route swap.** Preparation first viewport, response ledger with search/filter/sticky totals, actual attendance row states, Publication Desk draft/current switch and validation, projection preview, atomic correction, notification workspace, history/recovery. Wire `host-meeting-workspace-route.tsx` to the final presenter, then delete the Task 8 frame and old compatibility presenter exports. Keep each domain component prop-only.
- [ ] **Step 6: Remove obsolete focus/progress/nested-card CSS and components.** Preserve shared design tokens and existing member/public visual language.
- [ ] **Step 7: Run GREEN unit/component/boundary gates.**

  Run: `corepack pnpm --dir front exec vitest run features/host/ui/meeting-workspace tests/unit/frontend-boundaries.test.ts`

  Run: `corepack pnpm --dir front test:ct`

  Expected: PASS.

- [ ] **Step 8: Run lifecycle and responsive browser tests.**

  Run: `corepack pnpm --dir front exec playwright test tests/e2e/host-meeting-workspace.spec.ts tests/e2e/host-session-hardening.spec.ts tests/e2e/host-session-record-preview.spec.ts tests/e2e/host-session-record-revisions.spec.ts tests/e2e/session-closing-flywheel.spec.ts tests/e2e/responsive-navigation-chrome.spec.ts`

  Expected: PASS.

- [ ] **Step 9: Perform one batched visual review and one consolidated polish pass.** Capture synthetic fixtures at every required viewport plus 200% zoom; check hierarchy, density, wrapping, focus, dialogs, keyboard, and safe areas. Do not add new visual direction after approval.
- [ ] **Step 10: Check and commit.**

  Run: `git diff --check`

  Commit: `feat(front): deliver the host meeting folio workspace`

## Workstream Completion Gate

- [ ] Run `corepack pnpm --dir front lint`.
- [ ] Run `corepack pnpm --dir front test`.
- [ ] Run `corepack pnpm --dir front build`.
- [ ] Run `corepack pnpm --dir front test:ct`.
- [ ] Run `corepack pnpm --dir front test:e2e` only after server/BFF integration is available.
- [ ] Run the Impeccable detector once on the changed frontend targets and fix any concrete regressions it reports.
- [ ] Verify no `sessionStorage` value or route state controls member/host chrome.
- [ ] Verify no host query key or persisted sensitive draft lacks club scope.
- [ ] Verify `HostSessionEditor` and the former editor route decreased in responsibility and no new monolith replaced them.
- [ ] Leave frontend-related Proposed ADRs Proposed until full browser, rollout, and active-doc evidence exists.
