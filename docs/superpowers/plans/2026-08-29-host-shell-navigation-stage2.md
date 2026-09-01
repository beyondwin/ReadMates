# Host Four-Area Shell and Navigation Stage 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 호스트 셸을 `운영실 · 일정과 모임 · 사람 · 기록` 4개 업무 영역과 명확한 utility action으로 전환하되 scoped URL, 권한 상실, 기존 deep link를 보존한다.

**Architecture:** `AppClubShell` primitive는 유지하고 host 전용 composition을 얇게 추가한다. route destination 상수와 inventory가 URL 소유권을, layout model이 desktop/mobile presentation을 소유한다. 기존 `/sessions`, `/members`, `/notifications` 기능을 재사용하고 새 canonical `/people`, `/records`, `/settings` destination을 먼저 추가한 뒤 Stage 5에서 legacy redirect를 닫는다.

**Tech Stack:** React Router, TypeScript, shared shell primitives, CSS tokens, Vitest, Playwright CT/E2E.

**Spec:** ADR-0048, design §3–5/8–9, approved desktop 07–14 and mobile 15–17.

ADR impact: update — ADR-0048

## Global Constraints

- `ReadMates` brand home, combined `읽는사이 · 호스트 운영실` trigger, four primary destinations, utilities, account and `새 모임` must remain discoverable.
- Desktop primary label is `일정과 모임`; mobile label is `모임`, same href.
- `초대와 설정`, `멤버 시야`, notification, account are utilities and never consume a fifth bottom tab.
- Existing `AppClubShell`, `TopNav`, `MobileHeader`, `MobileTabBar`, account/security controllers remain shared; do not fork an entire host shell.
- `HostWorkspaceSwitcher` combines the existing `ClubSelector` and `WorkspaceSelector` responsibilities: club change and member/host workspace change are one trigger, while URL-authoritative scope and safe fallback remain owned by `workspace-route-model.ts`.
- Preserve `/clubs/:slug/app/host/**` as canonical and `/app/host/**` compatibility canonicalization.
- Use Pretendard and existing tokens; use `AvatarChip` with current `avatarKey` and role sizes.

---

### Task 0: Reconfirm current route and shell anchors

- [ ] **Step 1:** Run preflight and inventory.

```bash
python3 scripts/agent-preflight.py --intent change \
  --paths front/src/app/routes \
  --paths front/src/app/layouts \
  --paths front/src/app/host-routes \
  --paths front/shared/routing \
  --paths front/shared/ui \
  --paths front/shared/styles \
  --isolation-note "Stage 2 host shell navigation"
rg -n "HOST_ROUTE_PATHS|primaryNavigationItems|hostLinks|MobileTabBar|AppClubShell" front/src front/shared
```

- [ ] **Step 2:** Capture the current redirect and route-continuity tests before edits.
- [ ] **Step 3:** Run `command -v corepack || true`; use and record `npx --yes corepack@0.35.0 pnpm` when it is absent, as in the reviewed checkout.

### Task 1: Define canonical host destination ownership

**Files:**
- Modify: `front/shared/routing/host-route-destinations.ts`
- Modify: `front/src/app/route-continuity.ts`
- Modify: `front/src/app/host-route-destination-inventory.test.ts`
- Modify: `front/src/app/workspace-route-model.ts`
- Modify: relevant workspace-route tests.

**Route contract:**

```ts
HOST_ROUTE_PATHS = {
  operatingRoom: "",
  meetings: "sessions",
  people: "people",
  records: "records",
  settings: "settings",
  notifications: "notifications",
  newSession: "sessions/new",
  sessionDetail: "sessions/:sessionId",
  sessionEdit: "sessions/:sessionId/edit",
  sessionClosing: "sessions/:sessionId/closing",
  personDetail: "people/:membershipId",
} as const;
```

Compatibility aliases remain exported for `today`, `members`, `invitations`, and `operations` until Stage 5.

- [ ] **Step 1:** Write RED inventory tests that require all 4 primary and 5 utility/action entry points, scoped/unscoped href generation, and ownership of session/person/record details.
- [ ] **Step 2:** Add path/href definitions without changing old routes yet.
- [ ] **Step 3:** Update safe route families and return targets so a person detail returns to `people`, a record returns to `records`, and a session returns to `sessions`.
- [ ] **Step 4:** Run focused tests and commit.

### Task 2: Build host shell composition primitives

**Files:**
- Create: `front/features/host/ui/shell/host-workspace-switcher.tsx`
- Create: `front/features/host/ui/shell/host-primary-navigation.tsx`
- Create: `front/features/host/ui/shell/host-utility-actions.tsx`
- Create: `front/features/host/ui/shell/host-shell.css`
- Create: matching unit and CT tests.
- Modify: `front/shared/model/app-club-shell.ts` only for generic slots required by all workspaces.
- Modify: `front/shared/ui/app-club-shell.tsx` only to render those generic slots.

**Props:**

```ts
type HostWorkspaceSwitcherProps = {
  club: { name: string; slug: string; avatarKey: string };
  clubs: readonly ClubNavigationItem[];
  currentWorkspace: "member" | "host";
  workspaceItems: readonly WorkspaceNavigationItem[];
  disabledReason?: string | null;
  buildClubTarget: (slug: string, workspace: "member" | "host") => string;
  onSelectTarget: (href: string) => void;
};

type HostUtilityActionsProps = {
  settingsHref: string;
  memberViewHref: string;
  notificationsHref: string;
  newMeetingHref: string;
  unreadNotifications: number;
  permissionLimits: readonly UtilityLimit[];
};
```

- [ ] **Step 1:** RED tests: exact approved labels, one combined trigger, same-club member↔host workspace targets, club change while staying in member/host workspace, unavailable host reason, deep-link safe fallback, `aria-current`, notification accessible count, keyboard menu dismissal, no initial avatar fallback.
- [ ] **Step 2:** Implement as one adapter over `AppClubShell`'s club/workspace inputs and `workspace-route-model.ts`; replace the two visible controls for host composition rather than adding a disconnected third widget. Use semantic navigation/menu primitives and `AvatarChip`; no new global theme.
- [ ] **Step 3:** CT at 390 and 1440: long club name, 44px targets, focus ring, reduced motion.
- [ ] **Step 4:** Commit.

### Task 3: Wire the four-area shell into layout models

**Files:**
- Modify: `front/src/app/layouts/app-route-layout.tsx`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/shared/ui/readmates-copy.ts`
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/src/app/layouts/app-route-layout.test.tsx`, `front/shared/ui/app-club-shell.test.tsx`, `workspace-selector.test.tsx`, `app-club-shell.ct.tsx`, `top-nav.ct.tsx`, `mobile-header.ct.tsx`, and `mobile-tab-bar.ct.tsx`.

- [ ] **Step 1:** RED tests assert desktop order `운영실, 일정과 모임, 사람, 기록`; mobile order `운영실, 모임, 사람, 기록`; utilities remain reachable but absent from primary tabs.
- [ ] **Step 2:** Make host layout inject the new composition while member/guest/admin snapshots remain unchanged.
- [ ] **Step 3:** Scope current-route matching through `appPathname()` for canonical and compatibility URLs.
- [ ] **Step 4:** Ensure bottom bar uses `env(safe-area-inset-bottom)` and content padding prevents overlap.
- [ ] **Step 5:** Run focused tests/CT and commit.

### Task 4: Add destination routes without removing legacy routes

**Files:**
- Modify: `front/src/app/routes/host.tsx`
- Create: `front/src/app/host-routes/people-route-element.tsx`
- Create: `front/src/app/host-routes/records-route-element.tsx`
- Create: `front/src/app/host-routes/settings-route-element.tsx`
- Create: route element tests.

- [ ] **Step 1:** Add RED lazy-route tests for canonical scoped routes and loader auth.
- [ ] **Step 2:** Initially adapt existing members and meeting-list UI behind the new route elements. `/settings` may provide a permission-aware loading/route boundary for Stage 4, but must not present the existing email invitation screen as the approved named-link and club-settings functionality. Do not duplicate queries.
- [ ] **Step 3:** Keep old `/members`, `/invitations`, `/operations` routes operational until replacement flows pass Stage 4/5.
- [ ] **Step 4:** Verify lazy module boundaries and commit.

### Task 5: Authority loss, context switching, and cache isolation

**Files:**
- Modify: `front/features/host/model/host-authority-navigation.ts`
- Modify: `front/features/host/queries/host-state-purge.ts`
- Modify: `front/src/app/layouts/club-app-route-layout-authority-loss.test.tsx`
- Modify: `front/features/host/queries/host-query-key-inventory.test.ts`
- Modify: relevant E2E specs.

- [ ] **Step 1:** RED tests: club A→B changes all host query scopes; authority loss clears schedule/workbox/member/record keys and sensitive drafts; member-view action lands in same club.
- [ ] **Step 2:** Extend purge inventory with every query introduced in Stage 1 and planned Stage 4. Same-club workspace change and cross-club change both purge host-sensitive state before navigation when host authority is lost.
- [ ] **Step 3:** Preserve safe navigation state but never carry membershipId/sessionId into a different club.
- [ ] **Step 4:** Run focused tests and commit.

### Task 6: Stage verification

- [ ] **Step 1:** Run shell/unit/CT tests at 390 and 1440.
- [ ] **Step 2:** Run frontend lint/test/build.
- [ ] **Step 3:** Run scoped/unscoped responsive navigation E2E including keyboard and authority loss.
- [ ] **Step 4:** Keep legacy redirects unresolved until Stage 5 and record that deliberate state in the implementation ledger.
