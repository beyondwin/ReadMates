# ReadMates Frontend Design Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement every approved Impeccable critique finding across public, member, and host frontend surfaces without changing backend contracts or permissions.

**Architecture:** Keep route/data ownership unchanged and implement the work in presentation components, navigation composition, and CSS tokens. Use prop-driven UI with React Router revalidation injected by the route boundary, preserve every existing deep route, and move secondary destinations into existing account/dashboard disclosure surfaces.

**Tech Stack:** React 19, React Router 7, TypeScript 5.9, Vite 8, Vitest 4, Testing Library, Playwright, CSS custom properties.

## Global Constraints

- Preserve route-first dependency direction: `src/app -> src/pages -> features -> shared`.
- Do not change server, BFF, database, migration, API contract, permission, or dependency surfaces.
- Public = literary journal; member = personal reading desk; host = precise operating ledger.
- No gradients, glow, glassmorphism, excessive cards, generic dashboard styling, or brown bookstore nostalgia.
- Preserve WCAG AA intent, visible focus, reduced motion, 44px mobile targets, and Korean/English wrapping.
- Use strict RED→GREEN TDD for every behavior change.
- Do not commit, merge, push, create a PR, tag, or deploy.

---

### Task 1: Public recovery and trust copy

**Files:**
- Modify: `front/tests/unit/route-error-metadata.test.tsx`
- Modify: `front/shared/ui/route-error.tsx`
- Modify: `front/tests/unit/login-card.test.tsx`
- Modify: `front/features/auth/ui/login-card.tsx`
- Modify: `front/tests/unit/responsive-navigation.test.tsx`
- Modify: `front/tests/unit/public-navigation-auth.test.tsx`
- Modify: `front/shared/ui/readmates-copy.ts`
- Modify: `front/shared/ui/public-footer.tsx`
- Modify: `front/tests/e2e/public-auth-member-host.spec.ts`
- Modify: `front/tests/e2e/google-auth-invite-flow.spec.ts`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`

**Interfaces:**
- Consumes: React Router `useRevalidator()`, current `location.pathname`, existing `scopedAppLinkTarget`.
- Produces: `RouteErrorPage({ variant, status, retryState?, onRetry? })`; public recovery links that retain club scope; canonical public labels and OAuth copy.

- [ ] **Step 1: Write failing public recovery tests**

Add assertions that a public status 500 view renders `다시 시도`, calls `onRetry`, exposes a scoped `공개 기록으로 이동` link, and disables retry while `retryState === "loading"`. Assert that public 404 retains destination recovery without a retry button.

- [ ] **Step 2: Verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/route-error-metadata.test.tsx
```

Expected: FAIL because retry props and the secondary public-record link do not exist.

- [ ] **Step 3: Implement route recovery**

Extend the pure page interface:

```ts
type RouteErrorPageProps = {
  variant: RouteErrorVariant;
  status: number;
  retryState?: "idle" | "loading";
  onRetry?: () => void;
};
```

Use `useRevalidator()` only in `RouteErrorBoundary`, pass `revalidator.revalidate`, and derive club-scoped public fallback paths from the current pathname. Preserve 403/404/409/410 classification.

- [ ] **Step 4: Verify GREEN**

Run the focused route-error test and confirm all assertions pass.

- [ ] **Step 5: Write failing copy/navigation tests**

Change expected public navigation to `홈 / 클럽 소개 / 공개 기록 / 로그인`, OAuth entry to `Google로 시작하기`, and footer year to the current year. Update direct route/E2E assertions that intentionally own the labels.

- [ ] **Step 6: Verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/login-card.test.tsx tests/unit/public-navigation-auth.test.tsx tests/unit/responsive-navigation.test.tsx
```

Expected: FAIL on the old labels.

- [ ] **Step 7: Implement canonical copy**

Update `READMATES_NAV_LABELS.public`, `LoginCard`, and `PublicFooter`. Do not replace unrelated factual copy.

- [ ] **Step 8: Verify GREEN**

Run the focused tests again and confirm they pass.

### Task 2: Contract member and host persistent navigation

**Files:**
- Modify: `front/tests/unit/responsive-navigation.test.tsx`
- Modify: `front/tests/unit/spa-layout.test.tsx`
- Modify: `front/features/auth/ui/account-menu.test.tsx`
- Modify: `front/features/auth/route/account-menu-controller.test.tsx`
- Modify: `front/features/auth/ui/account-menu.tsx`
- Modify: `front/features/auth/route/account-menu-controller.tsx`
- Modify: `front/shared/ui/readmates-copy.ts`
- Modify: `front/shared/ui/top-nav.tsx`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/src/app/layouts/app-route-layout.tsx`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`

**Interfaces:**
- Consumes: `AppRouteLayout.currentSessionId`, existing `appBasePath`, notification/member/invitation routes.
- Produces: `TopNav.currentSessionId?: string | null`; four persistent destinations per role; account-menu notification link.

- [ ] **Step 1: Write failing navigation tests**

Assert member navigation is exactly `오늘 / 노트 / 기록 / 내 공간`, with `/app/session/current` activating `오늘`. Assert host navigation is exactly `오늘 / 세션 / 멤버 / 기록`; invitations activate `멤버`; notification routes stay absent from persistent navigation. Assert account menu exposes `알림`.

- [ ] **Step 2: Verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/responsive-navigation.test.tsx features/auth/ui/account-menu.test.tsx features/auth/route/account-menu-controller.test.tsx tests/unit/spa-layout.test.tsx
```

Expected: FAIL because current navigation has six member and five host destinations and the account menu lacks notifications.

- [ ] **Step 3: Implement four-destination navigation**

Pass `currentSessionId` into desktop `TopNav`. Resolve the host session destination as:

```ts
currentSessionId === undefined
  ? null
  : currentSessionId
    ? `/app/host/sessions/${currentSessionId}/edit`
    : "/app/host/sessions/new";
```

Use a disabled/pending label while undefined. Keep notifications in `AccountMenu`, invitations in host dashboard/member management, and preserve scoped app paths.

- [ ] **Step 4: Verify GREEN**

Run the focused navigation/layout tests and confirm all pass.

### Task 3: Harden and distill the host operating ledger

**Files:**
- Modify: `front/features/host/ui/host-dashboard.test.tsx`
- Modify: `front/tests/unit/host-dashboard.test.tsx`
- Modify: `front/features/host/ui/host-dashboard.tsx`
- Modify: `front/features/host/ui/dashboard/priority-ledger-sections.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes: existing priority items, ledger metrics, record attention, upcoming sessions, checklist, notifications, member/invitation tools.
- Produces: operation-specific status/error messages and desktop disclosures for secondary ledger, lifecycle, and tools.

- [ ] **Step 1: Write failing failure-copy tests**

Assert visibility failure says `공개 범위를 저장하지 못했습니다. 기존 공개 범위는 유지됩니다. 다시 시도해 주세요.` Assert session-open failure says `세션을 시작하지 못했습니다. 기존 세션 상태는 유지됩니다. 다시 시도해 주세요.` Assert loading and success messages name their operation.

- [ ] **Step 2: Verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/ui/host-dashboard.test.tsx tests/unit/host-dashboard.test.tsx
```

Expected: FAIL on generic host messages.

- [ ] **Step 3: Implement host error hardening**

Replace generic state text without changing mutations, optimistic overrides, or query invalidation.

- [ ] **Step 4: Write failing progressive-disclosure tests**

Assert the desktop priority/current-session board remains directly visible while processing ledger, lifecycle flow, and operating tools render in closed `<details>` disclosures with clear summaries and all links/actions still present in the DOM.

- [ ] **Step 5: Verify RED**

Run the two host dashboard test files and confirm the structural assertions fail.

- [ ] **Step 6: Implement desktop ledger disclosures**

Keep the existing components and data intact. Change only their outer composition to progressive disclosures; do not hide priority items or the current session. Use 44px summaries, visible focus, and lifecycle-specific summary copy.

- [ ] **Step 7: Verify GREEN**

Run both host dashboard suites and confirm behavior and structure pass.

### Task 4: Establish journal, desk, and ledger typography

**Files:**
- Modify: `design/system/src/styles/tokens.css`
- Modify: `front/src/styles/globals.css`
- Modify: `front/shared/styles/mobile.css`
- Modify: `front/tests/unit/public-home.test.tsx`
- Modify: `front/features/public/ui/public-home.tsx`
- Modify: `front/tests/unit/member-home.test.tsx`
- Modify: `front/features/host/ui/host-dashboard.test.tsx`

**Interfaces:**
- Produces: `--f-reading`; scoped public/member reading typography; tabular mono host numerals; flatter public record composition.

- [ ] **Step 1: Write failing typography/structure tests**

Assert public latest-record and reading excerpts expose a scoped reading class rather than changing global `.editorial`. Assert host operational values expose a ledger-number class. Assert the empty public-record guide is a quiet status rather than a primary-looking action.

- [ ] **Step 2: Verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run tests/unit/public-home.test.tsx features/host/ui/host-dashboard.test.tsx
```

Expected: FAIL because scoped role classes and quiet status do not exist.

- [ ] **Step 3: Implement scoped type and flatter public rhythm**

Add:

```css
--f-reading: ui-serif, "Iowan Old Style", "Noto Serif KR", "AppleMyungjo", "Batang", serif;
```

Apply it only to public record titles/excerpts/quotes and member reflection content. Use `font-variant-numeric: tabular-nums` with the mono stack for host operational values. Remove redundant public container borders where spacing and rules already group content. Preserve dark theme and responsive wrapping.

- [ ] **Step 4: Verify GREEN**

Run focused public and host tests, then inspect CSS at desktop/mobile breakpoints.

### Task 5: Remove the detector finding and perform final polish

**Files:**
- Modify: `front/features/host/aigen/ui/GenerationProgressView.test.tsx`
- Modify: `front/features/host/aigen/ui/GenerationProgressView.tsx`
- Modify: any touched CSS/test file only for defects found in the bounded visual pass

**Interfaces:**
- Produces: transform-based progress fill with clamped scale and left transform origin.

- [ ] **Step 1: Write failing progress test**

Assert the fill uses `transform: scaleX(0.25)`, `transform-origin: left center`, and no inline width transition for a 25% job.

- [ ] **Step 2: Verify RED**

Run:

```bash
corepack pnpm --dir front exec vitest run features/host/aigen/ui/GenerationProgressView.test.tsx
```

Expected: FAIL because the fill animates `width`.

- [ ] **Step 3: Implement transform progress**

Keep the outer progressbar semantics and clamp progress to 0–100. Render the inner fill at `width: 100%`, set `scaleX(progress / 100)`, and transition only `transform`.

- [ ] **Step 4: Verify GREEN**

Run the focused progress test.

- [ ] **Step 5: Run one detector pass**

Run exactly once after UI edits:

```bash
node "$CODEX_HOME/skills/impeccable/scripts/detect.mjs" --json front/src front/features front/shared
```

Classify semantic status rows and blockquotes as context-aware false positives; fix new genuine findings in one batch.

- [ ] **Step 6: Run canonical automated gates**

```bash
corepack pnpm --dir front exec vitest run tests/unit/frontend-boundaries.test.ts
corepack pnpm --dir front lint
corepack pnpm --dir front test
corepack pnpm --dir front build
git diff --check
```

- [ ] **Step 7: Run focused E2E and bounded browser verification**

Run targeted public/auth, responsive navigation, and host operation specs. Inspect representative public, member, and host screens at desktop and mobile together; fix all observed defects in one batch and confirm at most once.

- [ ] **Step 8: Request independent code review**

Review the diff against this spec and plan. Fix every Critical or Important finding, then rerun affected focused tests and the final gates.
