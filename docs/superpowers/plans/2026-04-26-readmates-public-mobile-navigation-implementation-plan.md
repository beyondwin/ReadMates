# ReadMates Public Mobile Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-only public section navigator so guests can move between the public home, club introduction, and public records without depending on page-body CTAs or the footer.

**Architecture:** Keep the desktop `TopNav` unchanged and add a focused mobile-only component under `PublicMobileHeader` in the public route layout. The component owns only public browsing links, hides itself on login, invite, and public session detail routes, and uses existing React Router link and route-current patterns. Styling stays in the public/mobile CSS layer with a quiet paper-index treatment that matches the public reading-room tone.

**Tech Stack:** Vite, React, React Router 7, TypeScript, global CSS in `front/src/styles/globals.css`, Vitest, Testing Library, Playwright.

---

## File Structure

- Create: `front/shared/ui/public-mobile-section-nav.tsx`
  - Owns the mobile-only public navigation links for `/`, `/about`, and `/records`.
  - Reads the current pathname with `useLocation`.
  - Uses `Link` from `@/src/app/router-link` so navigation scroll/reset behavior remains consistent with the rest of the app.
- Modify: `front/src/app/layouts.tsx`
  - Imports `PublicMobileSectionNav`.
  - Renders it directly below `PublicMobileHeader` inside the existing `mobile-only` public chrome block.
- Modify: `front/src/styles/globals.css`
  - Adds the mobile public section nav visual treatment and active state.
  - Keeps the nav hidden outside `@media (max-width: 768px)`.
- Modify: `front/tests/unit/responsive-navigation.test.tsx`
  - Adds component-level coverage for the public mobile section nav links, active route state, and route hiding rules.
- Modify: `front/tests/unit/spa-layout.test.tsx`
  - Verifies `PublicRouteLayout` includes the public mobile section nav for browsing routes and does not render it for `/login`.
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
  - Verifies the nav is visible and tap-friendly on mobile public browsing pages.
  - Verifies it is hidden on `/login` to keep the auth entry focused.

## Task 1: Unit Test the Public Mobile Section Nav Contract

**Files:**
- Modify: `front/tests/unit/responsive-navigation.test.tsx`
- Create later in Task 2: `front/shared/ui/public-mobile-section-nav.tsx`

- [ ] **Step 1: Add the failing import**

Add this import near the other shared UI imports at the top of `front/tests/unit/responsive-navigation.test.tsx`:

```tsx
import { PublicMobileSectionNav } from "@/shared/ui/public-mobile-section-nav";
```

- [ ] **Step 2: Add route-link and hiding tests**

Append this `describe` block before `describe("MobileTabBar app tabs", ...)` in `front/tests/unit/responsive-navigation.test.tsx`:

```tsx
describe("PublicMobileSectionNav", () => {
  it("renders public browsing links with the current public route marked", () => {
    renderAt("/about", <PublicMobileSectionNav />);

    const nav = screen.getByRole("navigation", { name: "공개 모바일 탐색" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "홈",
      "클럽 소개",
      "공개 기록",
    ]);
    expect(within(nav).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: "클럽 소개" })).toHaveAttribute("href", "/about");
    expect(within(nav).getByRole("link", { name: "공개 기록" })).toHaveAttribute("href", "/records");
    expect(within(nav).getByRole("link", { name: "클럽 소개" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "홈" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "공개 기록" })).not.toHaveAttribute("aria-current");
  });

  it("marks the records route and keeps labels stable", () => {
    renderAt("/records", <PublicMobileSectionNav />);

    const nav = screen.getByRole("navigation", { name: "공개 모바일 탐색" });
    expect(within(nav).getByRole("link", { name: "공개 기록" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "공개 기록" })).toHaveAttribute("href", "/records");
  });

  it("hides on auth, invite, and public session detail routes", () => {
    const hiddenRoutes = ["/login", "/invite/example-invite", "/sessions/session-6"];

    for (const route of hiddenRoutes) {
      cleanup();
      renderAt(route, <PublicMobileSectionNav />);

      expect(screen.queryByRole("navigation", { name: "공개 모바일 탐색" })).not.toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 3: Run the focused test and verify it fails**

Run:

```bash
pnpm --dir front test front/tests/unit/responsive-navigation.test.tsx
```

Expected: FAIL with a module resolution error for `@/shared/ui/public-mobile-section-nav` because the component has not been created yet.

## Task 2: Implement the Public Mobile Section Nav and Layout Hookup

**Files:**
- Create: `front/shared/ui/public-mobile-section-nav.tsx`
- Modify: `front/src/app/layouts.tsx`
- Test: `front/tests/unit/responsive-navigation.test.tsx`

- [ ] **Step 1: Create the component**

Create `front/shared/ui/public-mobile-section-nav.tsx` with this complete content:

```tsx
"use client";

import { useLocation } from "react-router-dom";
import { Link } from "@/src/app/router-link";
import { READMATES_NAV_LABELS } from "./readmates-copy";

type PublicMobileSectionLink = {
  href: string;
  label: string;
  current: (pathname: string) => boolean;
};

const publicMobileSectionLinks: PublicMobileSectionLink[] = [
  {
    href: "/",
    label: "홈",
    current: (pathname) => pathname === "/",
  },
  {
    href: "/about",
    label: "클럽 소개",
    current: (pathname) => pathname === "/about",
  },
  {
    href: "/records",
    label: READMATES_NAV_LABELS.public.publicRecords,
    current: (pathname) => pathname === "/records",
  },
];

function shouldShowPublicMobileSectionNav(pathname: string) {
  return pathname === "/" || pathname === "/about" || pathname === "/records";
}

export function PublicMobileSectionNav() {
  const { pathname } = useLocation();

  if (!shouldShowPublicMobileSectionNav(pathname)) {
    return null;
  }

  return (
    <nav className="public-mobile-section-nav mobile-only" aria-label="공개 모바일 탐색">
      {publicMobileSectionLinks.map((link) => {
        const current = link.current(pathname);

        return (
          <Link
            key={link.href}
            to={link.href}
            className="public-mobile-section-nav__link"
            aria-current={current ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Render it in the public route layout**

In `front/src/app/layouts.tsx`, add this import near the existing public UI imports:

```tsx
import { PublicMobileSectionNav } from "@/shared/ui/public-mobile-section-nav";
```

Then replace the mobile-only block in `PublicRouteLayout` with:

```tsx
      <div className="mobile-only">
        <PublicMobileHeader authenticated={authenticated} />
        <PublicMobileSectionNav />
      </div>
```

Keep the desktop-only `TopNav`, `rm-route-stage`, and `PublicFooter` positions unchanged.

- [ ] **Step 3: Run the focused unit test and verify it passes**

Run:

```bash
pnpm --dir front test front/tests/unit/responsive-navigation.test.tsx
```

Expected: PASS for the new `PublicMobileSectionNav` tests and the existing responsive navigation tests.

## Task 3: Style the Mobile Public Section Nav

**Files:**
- Modify: `front/src/styles/globals.css`
- Test later in Task 5: `front/tests/e2e/responsive-navigation-chrome.spec.ts`

- [ ] **Step 1: Add base hidden styles outside the mobile media block**

Add this block near the public navigation/public shell styles in `front/src/styles/globals.css`, after `.public-shell.m-app`:

```css
.public-mobile-section-nav {
  display: none;
}
```

- [ ] **Step 2: Add the mobile visual treatment**

Inside the existing `@media (max-width: 768px)` block in `front/src/styles/globals.css`, place this block after the `.topnav-inner` and `.nav-links` mobile rules:

```css
  .public-mobile-section-nav {
    position: sticky;
    top: calc(var(--m-hdr-h) + var(--m-safe-top));
    z-index: 29;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 4px;
    padding: 7px 12px 8px;
    background: color-mix(in oklch, var(--bg) 94%, transparent);
    border-bottom: 1px solid color-mix(in oklch, var(--line-soft), transparent 24%);
    backdrop-filter: saturate(1.25) blur(12px);
  }

  .public-mobile-section-nav__link {
    min-width: 0;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
    border-radius: var(--r-2);
    color: var(--text-3);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.15;
    text-align: center;
    word-break: keep-all;
  }

  .public-mobile-section-nav__link[aria-current="page"] {
    color: var(--text);
    background: var(--bg-sub);
    box-shadow: inset 0 0 0 1px var(--line);
  }

  .public-mobile-section-nav__link:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
```

This keeps the nav calm and tactile without adding app-like bottom tabs to public pages. The 44px minimum height preserves practical touch targets.

- [ ] **Step 3: Confirm reduced-motion behavior needs no additional code**

No animation is added by this task. The existing reduced-motion block in `front/src/styles/globals.css` remains sufficient.

## Task 4: Unit Test the Public Route Layout Integration

**Files:**
- Modify: `front/tests/unit/spa-layout.test.tsx`
- Test: `front/tests/unit/spa-layout.test.tsx`

- [ ] **Step 1: Add a layout integration test for public browsing routes**

In `front/tests/unit/spa-layout.test.tsx`, add this test inside `describe("SPA AppRouteLayout", () => { ... })`, after the existing `"scrolls public route navigation to the top"` test:

```tsx
  it("renders public mobile section navigation only on public browsing routes", async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<PublicRouteLayout />}>
            <Route index element={<main>home page</main>} />
            <Route path="/about" element={<main>club page</main>} />
            <Route path="/records" element={<main>records page</main>} />
            <Route path="/login" element={<main>login page</main>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    const publicMobileNav = screen.getByRole("navigation", { name: "공개 모바일 탐색" });
    expect(within(publicMobileNav).getByRole("link", { name: "홈" })).toHaveAttribute("aria-current", "page");

    await user.click(within(publicMobileNav).getByRole("link", { name: "클럽 소개" }));
    expect(await screen.findByText("club page")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "공개 모바일 탐색" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "클럽 소개" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("link", { name: "공개 기록" }));
    expect(await screen.findByText("records page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공개 기록" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("link", { name: "로그인" }));
    expect(await screen.findByText("login page")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "공개 모바일 탐색" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the layout test**

Run:

```bash
pnpm --dir front test front/tests/unit/spa-layout.test.tsx
```

Expected: PASS. If the test cannot find `로그인`, inspect whether the public desktop nav has changed its label contract before adjusting the assertion.

## Task 5: E2E Coverage for Mobile Discoverability and Focused Login

**Files:**
- Modify: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Test: `front/tests/e2e/responsive-navigation-chrome.spec.ts`

- [ ] **Step 1: Extend the mobile public chrome test**

In `front/tests/e2e/responsive-navigation-chrome.spec.ts`, inside `test("mobile public pages hide app tabs and host app pages show mobile chrome", ...)`, add this block immediately after the existing home-page hero assertions:

```ts
  const publicMobileNav = page.getByRole("navigation", { name: "공개 모바일 탐색" });
  await expect(publicMobileNav).toBeVisible();
  await expect(publicMobileNav.getByRole("link")).toHaveText(["홈", "클럽 소개", "공개 기록"]);
  await expect(publicMobileNav.getByRole("link", { name: "홈" })).toHaveAttribute("aria-current", "page");
  await expectPracticalTapTarget(publicMobileNav.getByRole("link", { name: "홈" }));

  await publicMobileNav.getByRole("link", { name: "클럽 소개" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { name: "읽는사이" })).toBeVisible();
  await expect(publicMobileNav.getByRole("link", { name: "클럽 소개" })).toHaveAttribute("aria-current", "page");
  await expectPracticalTapTarget(publicMobileNav.getByRole("link", { name: "클럽 소개" }));

  await publicMobileNav.getByRole("link", { name: "공개 기록" }).click();
  await expect(page).toHaveURL(/\/records$/);
  await expect(page.getByRole("heading", { name: "공개 기록" })).toBeVisible();
  await expect(publicMobileNav.getByRole("link", { name: "공개 기록" })).toHaveAttribute("aria-current", "page");
  await expectPracticalTapTarget(publicMobileNav.getByRole("link", { name: "공개 기록" }));
```

- [ ] **Step 2: Assert the nav stays hidden on the login route**

In the same E2E test, after the existing `/login` assertions:

```ts
  await expect(page.getByRole("navigation", { name: "공개 모바일 탐색" })).toHaveCount(0);
```

The `/login` route should keep attention on the OAuth/dev-login decision and the header back link.

- [ ] **Step 3: Run the focused E2E test**

Run:

```bash
pnpm --dir front test:e2e -- responsive-navigation-chrome.spec.ts
```

Expected: PASS. The test should confirm mobile public browsing links are visible and tap-friendly, while `/login` has no public section nav.

## Task 6: Full Frontend Verification

**Files:**
- Verify: all touched frontend files

- [ ] **Step 1: Run lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS with no ESLint errors.

- [ ] **Step 2: Run unit tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

- [ ] **Step 3: Run the frontend build**

Run:

```bash
pnpm --dir front build
```

Expected: PASS and produce the normal Vite production build output.

- [ ] **Step 4: Run route/user-flow E2E checks**

Run:

```bash
pnpm --dir front test:e2e
```

Expected: PASS. This is required because the change touches route chrome and public navigation flow.

- [ ] **Step 5: Manual browser QA**

Open the local app and inspect these routes at mobile width `360x812` and desktop width `1366x900`:

```text
/
/about
/records
/login
```

Expected:

- Mobile `/`, `/about`, and `/records` show the `홈 / 클럽 소개 / 공개 기록` section nav below the mobile header.
- The active route is visible without relying on color alone because it also has an inset border/background treatment.
- Mobile `/login` does not show the section nav.
- Desktop public pages remain unchanged and continue to use `TopNav`.
- No text overlaps, no horizontal overflow appears, and public pages still feel like a quiet paper index rather than an app dashboard.

## Self-Review

- Spec coverage: The plan covers the requested mobile public navigation discoverability gap, keeps login focused, and preserves desktop navigation.
- Public repo safety: The plan uses only generic route paths and fixture-safe labels. It does not include sensitive credentials, deployment state, private domains, local absolute paths, cloud identifiers, or credential-like examples.
- Dependency boundaries: The new component lives in `shared/ui`, imports only `src/app/router-link`, React Router location state, and shared copy. It does not import feature, API, or route modules.
- Test coverage: Unit tests cover component behavior and layout integration. E2E covers mobile visibility, tap target size, route changes, active states, and login hiding.
