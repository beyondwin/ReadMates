# ReadMates Mobile App Chrome Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the ReadMates mobile app chrome feel role-aware and deliberate by polishing the top bar, back affordance, member/host workspace switch, host-only mobile tabs, and member content spacing.

**Architecture:** Keep the existing route and auth model intact. Improve the shared mobile shell components under `front/shared/ui`, their CSS contract in `front/shared/styles/mobile.css`, and only the route tests that assert visible chrome behavior. The app remains React Router based, with `AppRouteLayout` deciding whether mobile chrome is `member` or `host`.

**Tech Stack:** React 19, React Router 7, TypeScript, CSS tokens with OKLCH colors, Vitest + Testing Library, Playwright.

---

## Design Context

Use `/Users/kws/source/web/ReadMates/ReadMates/.impeccable.md` as the design source of truth.

Relevant principles:

- Mobile is a native reading companion, not a shrunken desktop page.
- Host surfaces should feel like an operating ledger, not a generic SaaS dashboard.
- Member surfaces should feel like a personal reading desk.
- Warm trust and clear action matter more than decorative chrome.
- Preserve accessibility names, tap targets, and resilient Korean text wrapping.

## Scope Check

This plan covers one subsystem: the mobile app chrome used by public, member, and host routes.

Included:

- Mobile top bar visual structure.
- Mobile back button shape and placement.
- Mobile member-to-host and host-to-member workspace switch appearance.
- Mobile bottom tab active state and role-specific styling.
- Member mobile home top spacing.
- Unit and E2E expectations for the changed chrome.

Excluded:

- Backend, auth, route guards, API contracts, and database schema.
- Desktop top navigation behavior.
- Public page redesign beyond the shared mobile header styles.
- Host dashboard content redesign.
- New third-party UI dependencies.

## File Structure

Modify:

- `front/shared/ui/mobile-header.tsx`
  - Owns mobile header titles, back targets, workspace action labels, visible layout, and accessible names.
- `front/shared/ui/mobile-tab-bar.tsx`
  - Owns member and host mobile bottom tab definitions and active state.
- `front/shared/styles/mobile.css`
  - Owns the `m-hdr`, `m-tabbar`, `m-body`, and member mobile spacing styles.
- `front/features/member-home/components/member-home.tsx`
  - Replaces the first inline mobile home section padding with a class so spacing is consistent.
- `front/tests/unit/responsive-navigation.test.tsx`
  - Unit-level expectations for the new visible labels while preserving accessible names.
- `front/tests/unit/spa-layout.test.tsx`
  - Layout-level expectations that member/host shell behavior remains role-aware.
- `front/tests/e2e/responsive-navigation-chrome.spec.ts`
  - Browser-level checks for tap targets and route continuity after label changes.

Do not modify:

- `front/src/app/layouts.tsx` unless implementation reveals a real variant-selection bug. Current logic already gives hosts a host tab bar on `/app/host`, `/app/archive`, `/app/sessions/*`, and `/app/feedback/*`.
- `front/shared/ui/top-nav.tsx`; desktop already separates member and host menus.
- `front/shared/ui/readmates-copy.ts`; keep long product labels as the accessible names and use short visible labels in `MobileHeader`.

## Current Behavior To Preserve

- Member mobile tabs stay `홈`, `이번 세션`, `클럽 노트`, `아카이브`, `내 공간`.
- Host mobile tabs stay `오늘`, `세션`, `멤버`, `기록`.
- Active hosts in member workspace have a route to `/app/host`.
- Host workspace has a route back to `/app`.
- Back links continue to preserve archive and feedback return state.
- Existing tests that query `getByRole("link", { name: "호스트 화면" })`, `getByRole("link", { name: "멤버 화면으로" })`, and `getByRole("link", { name: "뒤로" })` should keep passing through `aria-label`.

## Intended Mobile Chrome

Top bar layout:

```text
[back or mark] [optional kicker + current title] [workspace action]
```

Examples:

- `/app`: mark + `읽는사이` + visible `운영` with accessible name `호스트 화면`.
- `/app/notes`: visible back `홈` + `클럽 노트` + visible `운영` with accessible name `호스트 화면`.
- `/app/host`: mark + kicker `호스트` + title `오늘` + visible `멤버` with accessible name `멤버 화면으로`.
- `/app/host/sessions/new`: visible back `오늘` + kicker `호스트` + title `세션` + visible `멤버`.
- `/app/archive` in host chrome: mark + kicker `호스트` + title `기록` + visible `멤버`.

Back button:

- Accessible name remains `뒤로`.
- Visible label describes the return target: `홈`, `오늘`, `기록`, `문서`, or `공개 기록`.
- Hit target remains at least 44px by 44px.

Workspace switch:

- Accessible name remains the product copy:
  - `호스트 화면`
  - `멤버 화면으로`
- Visible text is compact:
  - `운영`
  - `멤버`

Bottom tab:

- Keep the same tab labels and routes.
- Add `data-variant` so CSS can distinguish host and member chrome without changing routing.
- Active state should be visible through color and background, not only a thin line.

---

### Task 1: Add Failing Unit Tests For Compact Mobile Header Labels

**Files:**

- Modify: `front/tests/unit/responsive-navigation.test.tsx`

- [x] **Step 1: Update the host editor side-rail test**

Replace this assertion block in `MobileHeader route titles and actions`:

```ts
const sides = container.querySelectorAll(".m-hdr-side");
expect(sides).toHaveLength(2);
expect(container.querySelector(".m-hdr-side--right")).toHaveTextContent("멤버 화면으로");
expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");
```

with:

```ts
const sides = container.querySelectorAll(".m-hdr-side");
expect(sides).toHaveLength(2);
expect(container.querySelector(".m-hdr-side--right")).toHaveTextContent("멤버");
expect(screen.getByText("호스트")).toBeInTheDocument();
expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");
expect(screen.getByRole("link", { name: "뒤로" })).toHaveTextContent("오늘");
expect(screen.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/app");
expect(screen.getByRole("link", { name: "멤버 화면으로" })).toHaveTextContent("멤버");
```

- [x] **Step 2: Update the member host-entry test**

Replace:

```ts
expect(screen.getByRole("link", { name: "호스트 화면" })).toHaveAttribute("href", "/app/host");
```

with:

```ts
const hostEntry = screen.getByRole("link", { name: "호스트 화면" });
expect(hostEntry).toHaveAttribute("href", "/app/host");
expect(hostEntry).toHaveTextContent("운영");
```

- [x] **Step 3: Update host route action assertions**

In the tests named `renders host editor pages with a host back link`, `renders the host new session route as the session editor title`, and `keeps host record routes in host mobile chrome with member return`, replace each direct `멤버 화면으로` assertion:

```ts
expect(screen.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/app");
```

with:

```ts
const memberReturn = screen.getByRole("link", { name: "멤버 화면으로" });
expect(memberReturn).toHaveAttribute("href", "/app");
expect(memberReturn).toHaveTextContent("멤버");
```

- [x] **Step 4: Run the focused unit test and verify failure**

Run:

```bash
pnpm --dir front vitest run front/tests/unit/responsive-navigation.test.tsx
```

Expected before implementation:

```text
FAIL  front/tests/unit/responsive-navigation.test.tsx
```

The failing assertions should mention visible text such as `멤버`, `운영`, `호스트`, or `오늘` because the current header still renders long text labels.

- [x] **Step 5: Commit the failing tests**

```bash
git add front/tests/unit/responsive-navigation.test.tsx
git commit -m "test: capture compact mobile chrome labels"
```

---

### Task 2: Implement Role-Aware Mobile Header Chrome

**Files:**

- Modify: `front/shared/ui/mobile-header.tsx`

- [x] **Step 1: Add the header action and back-target types**

In `front/shared/ui/mobile-header.tsx`, replace the current `AppBackTarget` type with:

```ts
type HeaderBackTarget = {
  href: string;
  state?: ReadmatesReturnState;
  label: string;
};

type HeaderAction = {
  href: string;
  label: string;
  ariaLabel?: string;
};
```

- [x] **Step 2: Replace `appBackTarget` with labeled return targets**

Replace the current `appBackTarget` function with:

```ts
function appBackTarget(pathname: string, state: unknown): HeaderBackTarget | null {
  if (pathname === "/app/notes") {
    return { href: "/app", label: "홈" };
  }

  if (pathname.startsWith("/app/host/sessions/")) {
    return { href: "/app/host", label: "오늘" };
  }

  if (pathname.startsWith("/app/feedback/") && pathname.endsWith("/print")) {
    const sourceTarget = readReadmatesReturnTarget(state, archiveReportReturnTarget);
    return {
      href: pathname.replace(/\/print$/, ""),
      state: readmatesReturnState(sourceTarget),
      label: "문서",
    };
  }

  if (pathname.startsWith("/app/feedback/")) {
    const target = readReadmatesReturnTarget(state, archiveReportReturnTarget);
    return { href: target.href, state: target.state, label: "기록" };
  }

  if (pathname.startsWith("/app/sessions/")) {
    const target = readReadmatesReturnTarget(state, archiveSessionsReturnTarget);
    return { href: target.href, state: target.state, label: "기록" };
  }

  return null;
}
```

- [x] **Step 3: Add small header icons**

Add these helpers above `HeaderShell`:

```tsx
function ChevronLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 19 8 12l7-7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeaderMark() {
  return (
    <span className="m-hdr-mark" aria-hidden>
      <svg width="19" height="19" viewBox="0 0 20 20" fill="none">
        <path d="M10 4 3.5 5.4v11L10 15.1V4Z" fill="currentColor" />
        <path d="M10 4 16.5 5.4v11L10 15.1V4Z" fill="currentColor" opacity="0.42" />
      </svg>
    </span>
  );
}
```

- [x] **Step 4: Replace `HeaderShell`**

Replace the current `HeaderShell` component with:

```tsx
function HeaderShell({
  workspace,
  title,
  kicker,
  backTarget,
  rightAction,
}: {
  workspace: MobileHeaderVariant;
  title: string;
  kicker?: string | null;
  backTarget?: HeaderBackTarget | null;
  rightAction?: HeaderAction | null;
}) {
  const brandHref = workspace === "host" ? "/app/host" : workspace === "member" ? "/app" : "/";

  return (
    <header className={`m-hdr m-hdr--${workspace}`} data-workspace={workspace}>
      <div className="m-hdr-side m-hdr-side--left">
        {backTarget ? (
          <Link to={backTarget.href} state={backTarget.state} className="m-hdr-back" aria-label="뒤로">
            <ChevronLeftIcon />
            <span className="m-hdr-back__label">{backTarget.label}</span>
          </Link>
        ) : (
          <Link to={brandHref} className="m-hdr-brand" aria-label="읽는사이 홈">
            <HeaderMark />
          </Link>
        )}
      </div>
      <div className="m-hdr-heading">
        {kicker ? <div className="m-hdr-kicker">{kicker}</div> : null}
        <div className="m-hdr-title">{title}</div>
      </div>
      <div className="m-hdr-side m-hdr-side--right">
        {rightAction ? (
          <Link to={rightAction.href} className="m-hdr-link" aria-label={rightAction.ariaLabel}>
            {rightAction.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
```

- [x] **Step 5: Update guest back targets**

In `GuestMobileHeader`, replace the direct `backTarget` expression with this local value:

```ts
const backTarget: HeaderBackTarget | null = isEntryRoute
  ? { href: "/", label: "홈" }
  : publicSessionReturnTarget
    ? { ...publicSessionReturnTarget, label: "공개 기록" }
    : null;
```

Then render:

```tsx
return (
  <HeaderShell
    workspace="guest"
    title={publicTitle(pathname)}
    backTarget={backTarget}
    rightAction={isEntryRoute ? null : authAction}
  />
);
```

- [x] **Step 6: Replace `appRightAction`**

Replace the current `appRightAction` function with:

```ts
function appRightAction(variant: Exclude<MobileHeaderVariant, "guest">, showHostEntry: boolean): HeaderAction | null {
  if (variant === "host") {
    return {
      href: "/app",
      label: "멤버",
      ariaLabel: READMATES_WORKSPACE_LABELS.memberWorkspaceReturn,
    };
  }

  if (showHostEntry) {
    return {
      href: "/app/host",
      label: "운영",
      ariaLabel: READMATES_WORKSPACE_LABELS.hostWorkspace,
    };
  }

  return null;
}
```

- [x] **Step 7: Add host kicker in `AppMobileHeader`**

Replace the `HeaderShell` call in `AppMobileHeader` with:

```tsx
return (
  <HeaderShell
    workspace={variant}
    kicker={variant === "host" ? "호스트" : null}
    title={appTitle(variant, pathname)}
    backTarget={appBackTarget(pathname, location.state)}
    rightAction={appRightAction(variant, showHostEntry)}
  />
);
```

- [x] **Step 8: Run the focused unit test**

Run:

```bash
pnpm --dir front vitest run front/tests/unit/responsive-navigation.test.tsx
```

Expected:

```text
PASS  front/tests/unit/responsive-navigation.test.tsx
```

- [x] **Step 9: Commit the header implementation**

```bash
git add front/shared/ui/mobile-header.tsx front/tests/unit/responsive-navigation.test.tsx
git commit -m "feat: polish mobile workspace header"
```

---

### Task 3: Apply Mobile Header And Tab Bar Styling

**Files:**

- Modify: `front/shared/styles/mobile.css`
- Modify: `front/shared/ui/mobile-tab-bar.tsx`

- [x] **Step 1: Add `data-variant` to the mobile tab bar**

In `front/shared/ui/mobile-tab-bar.tsx`, replace the opening `<nav>` with:

```tsx
<nav
  className="m-tabbar"
  data-variant={variant}
  aria-label="앱 탭"
  style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
>
```

- [x] **Step 2: Replace the mobile header CSS block**

In `front/shared/styles/mobile.css`, replace the existing block from `/* Sticky header */` through `.m-hdr-link:active` with:

```css
/* Sticky header */
.m-hdr {
  position: sticky;
  top: 0;
  z-index: 30;
  min-height: calc(var(--m-hdr-h) + var(--m-safe-top));
  padding: var(--m-safe-top) 14px 0;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) minmax(44px, auto);
  align-items: center;
  gap: 10px;
  background: color-mix(in oklch, var(--bg) 92%, transparent);
  backdrop-filter: saturate(1.35) blur(14px);
  border-bottom: 1px solid color-mix(in oklch, var(--line-soft), transparent 32%);
  transition: border-color var(--motion-page) var(--ease-standard-refined);
}
.m-hdr.is-scrolled { border-bottom-color: var(--line); }
.m-hdr-side {
  min-width: 0;
  display: flex;
  align-items: center;
}
.m-hdr-side--left {
  justify-content: flex-start;
}
.m-hdr-side--right {
  justify-content: flex-end;
}
.m-hdr-heading {
  min-width: 0;
  display: grid;
  align-content: center;
  gap: 2px;
}
.m-hdr-kicker {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--f-mono);
  font-size: 10px;
  line-height: 1.1;
  letter-spacing: 0;
  color: var(--text-3);
}
.m-hdr-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0;
  color: var(--text);
}
.m-hdr-brand,
.m-hdr-back,
.m-hdr-link {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
}
.m-hdr-brand {
  width: 44px;
  border-radius: var(--r-3);
}
.m-hdr-mark {
  width: 31px;
  height: 31px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: var(--r-2);
  color: var(--accent);
  background: color-mix(in oklch, var(--accent-soft), var(--bg) 40%);
}
.m-hdr-back {
  max-width: 100%;
  gap: 2px;
  padding: 0 8px 0 0;
  border-radius: var(--r-3);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0;
  white-space: nowrap;
}
.m-hdr-back__label {
  max-width: 48px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-hdr-link {
  max-width: 72px;
  min-width: 44px;
  height: 34px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  font: 600 12.5px/1 var(--font-sans);
  letter-spacing: 0;
  color: var(--text);
  background: var(--bg-sub);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.m-hdr--host .m-hdr-link {
  color: var(--accent);
  background: color-mix(in oklch, var(--accent-soft), var(--bg) 34%);
  border-color: var(--accent-line);
}
.m-hdr-brand:active,
.m-hdr-back:active,
.m-hdr-link:active {
  background: var(--bg-softer, var(--bg-sub));
  opacity: .88;
}
```

- [x] **Step 3: Replace the active tab CSS**

In `front/shared/styles/mobile.css`, replace the current `.m-tabbar`, `.m-tab`, `.m-tab[aria-current="page"]`, `.m-tab[aria-disabled="true"]`, `.m-tab[aria-current="page"]::before`, and `.m-tab-label` block with:

```css
/* Bottom nav */
.m-tabbar {
  position: fixed;
  bottom: 0; left: 50%;
  transform: translateX(-50%);
  width: 100%; max-width: 480px;
  height: calc(var(--m-nav-h) + var(--m-safe-bottom));
  padding: 6px 8px var(--m-safe-bottom);
  background: color-mix(in oklch, var(--bg) 94%, transparent);
  backdrop-filter: saturate(1.45) blur(14px);
  border-top: 1px solid var(--line);
  z-index: 40;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
.m-tabbar[data-variant="host"] {
  background: color-mix(in oklch, var(--bg-sub) 88%, transparent);
}
.m-tab {
  min-width: 0;
  min-height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-4);
  position: relative;
  padding: 5px 4px 4px;
  border-radius: var(--r-3);
}
.m-tab[aria-current="page"] {
  color: var(--text);
  background: color-mix(in oklch, var(--bg-sub), var(--bg) 42%);
}
.m-tab[aria-disabled="true"] {
  cursor: default;
  color: var(--text-3);
  background: transparent;
}
.m-tab[aria-current="page"]::before {
  content: "";
  position: absolute;
  top: 6px; left: 50%;
  width: 4px; height: 4px;
  transform: translateX(-50%);
  background: var(--accent);
  border-radius: 999px;
}
.m-tab svg {
  transition: transform var(--motion-fast) var(--ease-out-refined);
}
.m-tab[aria-current="page"] svg {
  transform: translateY(-1px);
}
.m-tab-label {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
  letter-spacing: 0;
  font-weight: 600;
}
```

- [x] **Step 4: Run the focused unit test**

Run:

```bash
pnpm --dir front vitest run front/tests/unit/responsive-navigation.test.tsx
```

Expected:

```text
PASS  front/tests/unit/responsive-navigation.test.tsx
```

- [x] **Step 5: Commit the mobile CSS and tab variant**

```bash
git add front/shared/styles/mobile.css front/shared/ui/mobile-tab-bar.tsx
git commit -m "style: refine mobile app chrome"
```

---

### Task 4: Normalize Member Mobile Home Content Spacing

**Files:**

- Modify: `front/features/member-home/components/member-home.tsx`
- Modify: `front/shared/styles/mobile.css`

- [x] **Step 1: Replace the member mobile hero inline padding**

In `front/features/member-home/components/member-home.tsx`, replace:

```tsx
<section style={{ padding: "12px 18px 4px" }}>
```

with:

```tsx
<section className="rm-member-home-mobile__hero">
```

- [x] **Step 2: Add member mobile spacing CSS**

In `front/shared/styles/mobile.css`, add this block immediately before `/* Member home mobile */`:

```css
.mobile-only.rm-member-home-mobile {
  padding-top: 6px;
}
.mobile-only .rm-member-home-mobile__hero {
  padding: 18px 18px 8px;
}
```

- [x] **Step 3: Run member home unit tests**

Run:

```bash
pnpm --dir front vitest run front/tests/unit/member-home.test.tsx
```

Expected:

```text
PASS  front/tests/unit/member-home.test.tsx
```

- [x] **Step 4: Run responsive navigation unit tests**

Run:

```bash
pnpm --dir front vitest run front/tests/unit/responsive-navigation.test.tsx
```

Expected:

```text
PASS  front/tests/unit/responsive-navigation.test.tsx
```

- [x] **Step 5: Commit the spacing change**

```bash
git add front/features/member-home/components/member-home.tsx front/shared/styles/mobile.css
git commit -m "style: add mobile member content breathing room"
```

---

### Task 5: Update Layout And Browser-Level Expectations

**Files:**

- Modify: `front/tests/unit/spa-layout.test.tsx`
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`

- [x] **Step 1: Add visible compact-label assertions to `spa-layout.test.tsx`**

In the host archive layout test, replace:

```ts
expect(screen.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/app");
```

with:

```ts
const memberReturn = screen.getByRole("link", { name: "멤버 화면으로" });
expect(memberReturn).toHaveAttribute("href", "/app");
expect(memberReturn).toHaveTextContent("멤버");
```

In the member layout test where the host links are collected, add this after the existing `호스트 화면` href assertion:

```ts
expect(screen.getAllByRole("link", { name: "호스트 화면" }).map((link) => link.textContent)).toContain("운영");
```

- [x] **Step 2: Add visible compact-label assertions to the E2E chrome test**

In `front/tests/e2e/responsive-navigation-chrome.spec.ts`, after:

```ts
await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveAttribute("href", "/app/host");
```

add:

```ts
await expect(mobileHeader.getByRole("link", { name: "호스트 화면" })).toHaveText("운영");
```

After:

```ts
await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveAttribute("href", "/app");
```

add:

```ts
await expect(mobileHeader.getByRole("link", { name: "멤버 화면으로" })).toHaveText("멤버");
```

After:

```ts
await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");
```

add:

```ts
await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toContainText("오늘");
```

- [x] **Step 3: Run layout unit tests**

Run:

```bash
pnpm --dir front vitest run front/tests/unit/spa-layout.test.tsx front/tests/unit/responsive-navigation.test.tsx
```

Expected:

```text
PASS  front/tests/unit/spa-layout.test.tsx
PASS  front/tests/unit/responsive-navigation.test.tsx
```

- [x] **Step 4: Run the responsive navigation E2E test**

Run:

```bash
pnpm --dir front test:e2e -- front/tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected:

```text
4 passed
```

If the local E2E environment requires a seeded backend, run the same command after starting the existing project test stack described in `docs/development/test-guide.md`.

- [x] **Step 5: Commit test expectation updates**

```bash
git add front/tests/unit/spa-layout.test.tsx front/tests/e2e/responsive-navigation-chrome.spec.ts
git commit -m "test: verify polished mobile chrome in app shell"
```

---

### Task 6: Full Verification And Visual QA

**Files:**

- Read: `docs/development/test-guide.md`
- No source edits expected.

- [ ] **Step 1: Run lint**

Run:

```bash
pnpm --dir front lint
```

Expected:

```text
eslint .
```

and exit code `0`.

- [ ] **Step 2: Run unit tests**

Run:

```bash
pnpm --dir front test
```

Expected:

```text
Test Files  ... passed
Tests       ... passed
```

and exit code `0`.

- [ ] **Step 3: Build the frontend**

Run:

```bash
pnpm --dir front build
```

Expected:

```text
vite build
✓ built
```

and exit code `0`.

- [ ] **Step 4: Run focused E2E**

Run:

```bash
pnpm --dir front test:e2e -- front/tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected:

```text
4 passed
```

- [ ] **Step 5: Inspect mobile routes in browser**

Use Playwright or the existing browse tool at these viewport sizes:

```text
360x812
390x844
430x932
```

Inspect these routes:

```text
/app
/app/session/current
/app/notes
/app/me
/app/host
/app/host/sessions/new
/app/host/members
/app/archive
```

Expected visual result:

- No top bar text overlap.
- Back button remains left-aligned and at least 44px tall.
- `운영` and `멤버` workspace buttons do not push the title off-screen.
- Host routes show host-only bottom tabs.
- Member routes show member-only bottom tabs.
- Member home content has visible top and side breathing room.
- Bottom tab does not cover the final content.

- [ ] **Step 6: Commit verification evidence if screenshots are saved**

If screenshots or evidence files are intentionally saved under `.tmp`, do not commit them. If a project-owned docs evidence file is added, commit it with:

```bash
git add docs/path-to-evidence.md
git commit -m "docs: record mobile chrome verification"
```

If no docs evidence file is created, do not make a verification-only commit.

---

## Self-Review

Spec coverage:

- Mobile top bar design: Task 2 and Task 3.
- Back button design and placement: Task 2 and Task 3.
- Member/host transition behavior: Task 1, Task 2, and Task 5.
- Host-only mobile tabs: Task 3 and Task 5.
- Member content spacing: Task 4.
- Unit, E2E, and visual QA: Task 1, Task 5, and Task 6.

Placeholder scan:

- No placeholders are intentionally left in this plan.
- Every code-changing step includes the exact target file and code to add or replace.
- Every verification step includes exact commands and expected results.

Type consistency:

- `HeaderBackTarget` is used by `appBackTarget`, guest back targets, and `HeaderShell`.
- `HeaderAction` is used by `appRightAction` and `HeaderShell`.
- `MobileHeaderVariant` remains the existing public type for `guest`, `member`, and `host`.
- The accessible names `뒤로`, `호스트 화면`, and `멤버 화면으로` remain stable for current tests and screen readers.
