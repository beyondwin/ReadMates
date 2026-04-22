# ReadMates Responsive Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the original ReadMates responsive navigation chrome: desktop top nav on public/member/host pages, mobile header on all pages, and mobile bottom tabs for authenticated app pages.

**Architecture:** Keep page bodies unchanged and attach navigation chrome at the route layout/component boundary. Extend the existing public `TopNav`, introduce focused mobile header/tab components, and add an `/app` route-group layout that chooses member or host chrome from `/api/auth/me`.

**Tech Stack:** Next.js App Router, React client components, TypeScript, CSS modules through global CSS imports, Vitest, Testing Library, jsdom.

---

## File Structure

- Modify: `front/shared/ui/top-nav.tsx`
  - Owns desktop top navigation markup.
  - Supports `guest`, `member`, and `host` variants.
  - Preserves the existing public authenticated action behavior.
- Create: `front/shared/ui/mobile-header.tsx`
  - Owns mobile sticky header titles, back links, and guest auth action.
  - Covers public, member, and host route title rules.
- Modify: `front/shared/ui/public-mobile-header.tsx`
  - Becomes a compatibility wrapper around `MobileHeader`.
- Create: `front/shared/ui/mobile-tab-bar.tsx`
  - Owns member/host mobile bottom tab links and active state.
- Create: `front/app/(app)/app/layout.tsx`
  - Fetches auth once for app route chrome.
  - Renders desktop top nav, mobile header, app content wrapper, and mobile tab bar.
- Modify: `front/app/globals.css`
  - Adds app shell/content mobile padding so fixed tab bar does not cover content.
- Create: `front/tests/unit/responsive-navigation.test.tsx`
  - Component-level coverage for desktop nav variants, mobile header rules, and mobile tab links.
- Create: `front/tests/unit/app-route-layout.test.tsx`
  - Server layout coverage for member and host app chrome.
- Modify: `front/tests/unit/public-navigation-auth.test.tsx`
  - Keep public auth action tests passing through the new `PublicMobileHeader` wrapper.

## Task 1: Desktop TopNav Variants

**Files:**
- Modify: `front/shared/ui/top-nav.tsx`
- Create: `front/tests/unit/responsive-navigation.test.tsx`
- Verify: `front/tests/unit/public-navigation-auth.test.tsx`

- [x] **Step 1: Write the failing TopNav variant tests**

Create `front/tests/unit/responsive-navigation.test.tsx` with this initial content:

```tsx
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "@/shared/ui/top-nav";

const navigationState = vi.hoisted(() => ({
  pathname: "/",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  navigationState.pathname = "/";
});

describe("TopNav responsive variants", () => {
  it("renders member desktop navigation with the current app section marked", () => {
    navigationState.pathname = "/app/session/current";

    render(<TopNav variant="member" memberName="멤버5" />);

    const nav = screen.getByRole("navigation", { name: "App navigation" });
    expect(within(nav).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/app");
    expect(within(nav).getByRole("link", { name: "이번 세션" })).toHaveAttribute("href", "/app/session/current");
    expect(within(nav).getByRole("link", { name: "클럽 노트" })).toHaveAttribute("href", "/app/notes");
    expect(within(nav).getByRole("link", { name: "아카이브" })).toHaveAttribute("href", "/app/archive");
    expect(within(nav).getByRole("link", { name: "마이" })).toHaveAttribute("href", "/app/me");
    expect(within(nav).getByRole("link", { name: "이번 세션" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).queryByRole("link", { name: "호스트" })).not.toBeInTheDocument();
    expect(screen.getByText("멤버5")).toBeInTheDocument();
  });

  it("renders host desktop navigation with the host section marked", () => {
    navigationState.pathname = "/app/host/sessions/new";

    render(<TopNav variant="host" memberName="호스트" />);

    const nav = screen.getByRole("navigation", { name: "App navigation" });
    expect(within(nav).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/app");
    expect(within(nav).getByRole("link", { name: "호스트" })).toHaveAttribute("href", "/app/host");
    expect(within(nav).getByRole("link", { name: "호스트" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /읽는사이/ })).toHaveAttribute("href", "/app/host");
    expect(screen.getByText("호스트")).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run the TopNav tests and verify they fail**

Run:

```bash
pnpm --dir front test front/tests/unit/responsive-navigation.test.tsx
```

Expected: FAIL because `TopNav` does not yet accept `variant` or render app navigation labels.

- [x] **Step 3: Replace `top-nav.tsx` with the variant-aware implementation**

Replace `front/shared/ui/top-nav.tsx` with:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePublicAuthAction, type PublicAuthAction } from "./public-auth-action";

export type TopNavVariant = "guest" | "member" | "host";

type NavLink = {
  key: string;
  href: string;
  label: string;
  current: (pathname: string) => boolean;
};

type TopNavProps = {
  variant?: TopNavVariant;
  memberName?: string | null;
};

const guestLinks: NavLink[] = [
  { key: "home", href: "/", label: "소개", current: (pathname) => pathname === "/" },
  { key: "club", href: "/about", label: "클럽", current: (pathname) => pathname === "/about" },
  { key: "public-record", href: "/", label: "공개 기록", current: (pathname) => pathname.startsWith("/sessions/") },
  { key: "login", href: "/login", label: "로그인", current: (pathname) => pathname === "/login" },
];

const memberLinks: NavLink[] = [
  { key: "home", href: "/app", label: "홈", current: (pathname) => pathname === "/app" },
  { key: "session", href: "/app/session/current", label: "이번 세션", current: (pathname) => pathname.startsWith("/app/session") },
  { key: "notes", href: "/app/notes", label: "클럽 노트", current: (pathname) => pathname === "/app/notes" },
  { key: "archive", href: "/app/archive", label: "아카이브", current: (pathname) => pathname.startsWith("/app/archive") },
  { key: "me", href: "/app/me", label: "마이", current: (pathname) => pathname.startsWith("/app/me") },
];

const hostLink: NavLink = {
  key: "host",
  href: "/app/host",
  label: "호스트",
  current: (pathname) => pathname.startsWith("/app/host"),
};

function Logo() {
  return (
    <span
      aria-hidden
      style={{
        width: "30px",
        height: "30px",
        borderRadius: "6px",
        background: "var(--accent)",
        color: "var(--paper-50)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: "14px",
      }}
    >
      읽
    </span>
  );
}

function Brand({ href }: { href: string }) {
  return (
    <Link href={href} className="row" style={{ gap: "10px" }}>
      <Logo />
      <span>
        <span
          className="editorial"
          style={{
            display: "block",
            fontSize: "16px",
            lineHeight: 1,
            letterSpacing: "-0.025em",
            fontWeight: 600,
          }}
        >
          읽는사이
        </span>
        <span className="tiny mono" style={{ display: "block", marginTop: "2px" }}>
          ReadMates
        </span>
      </span>
    </Link>
  );
}

function TopNavFrame({
  brandHref,
  navLabel,
  links,
  pathname,
  memberName,
}: {
  brandHref: string;
  navLabel: string;
  links: NavLink[];
  pathname: string;
  memberName?: string | null;
}) {
  return (
    <header className="topnav">
      <div className="container topnav-inner">
        <Brand href={brandHref} />

        <div className="row" style={{ gap: "12px" }}>
          <nav className="nav-links" aria-label={navLabel}>
            {links.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                className="nav-link"
                aria-current={link.current(pathname) ? "page" : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          {memberName ? (
            <span className="tiny" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
              {memberName}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function guestLinksWithAction(authAction: PublicAuthAction): NavLink[] {
  return guestLinks.map((link) =>
    link.key === "login"
      ? {
          ...link,
          href: authAction.href,
          label: authAction.label,
          current: (pathname) => authAction.href === "/login" && pathname === "/login",
        }
      : link,
  );
}

function GuestTopNav() {
  const pathname = usePathname();
  const authAction = usePublicAuthAction({ href: "/login", label: "로그인" });

  return (
    <TopNavFrame
      brandHref="/"
      navLabel="Public navigation"
      links={guestLinksWithAction(authAction)}
      pathname={pathname}
    />
  );
}

function AppTopNav({ variant, memberName }: { variant: Exclude<TopNavVariant, "guest">; memberName?: string | null }) {
  const pathname = usePathname();
  const links = variant === "host" ? [...memberLinks, hostLink] : memberLinks;

  return (
    <TopNavFrame
      brandHref={variant === "host" ? "/app/host" : "/app"}
      navLabel="App navigation"
      links={links}
      pathname={pathname}
      memberName={memberName}
    />
  );
}

export function TopNav({ variant = "guest", memberName }: TopNavProps) {
  if (variant === "guest") {
    return <GuestTopNav />;
  }

  return <AppTopNav variant={variant} memberName={memberName} />;
}
```

- [x] **Step 4: Run focused TopNav and existing public auth tests**

Run:

```bash
pnpm --dir front test front/tests/unit/responsive-navigation.test.tsx front/tests/unit/public-navigation-auth.test.tsx
```

Expected: PASS. The existing public tests must still prove guest links stay `로그인` and authenticated public users see `내 공간`.

- [x] **Step 5: Commit Task 1**

```bash
git add front/shared/ui/top-nav.tsx front/tests/unit/responsive-navigation.test.tsx
git commit -m "feat: add role-aware desktop navigation"
```

## Task 2: Shared Mobile Header

**Files:**
- Create: `front/shared/ui/mobile-header.tsx`
- Modify: `front/shared/ui/public-mobile-header.tsx`
- Modify: `front/tests/unit/responsive-navigation.test.tsx`
- Verify: `front/tests/unit/public-navigation-auth.test.tsx`

- [x] **Step 1: Add failing MobileHeader tests**

Add this import near the top of `front/tests/unit/responsive-navigation.test.tsx`, below the existing `TopNav` import:

```tsx
import { MobileHeader } from "@/shared/ui/mobile-header";
```

Append these tests inside `front/tests/unit/responsive-navigation.test.tsx` after the `TopNav responsive variants` block:

```tsx

describe("MobileHeader route titles and actions", () => {
  it("renders the public session mobile title and authenticated entry action", async () => {
    navigationState.pathname = "/sessions/session-6";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<MobileHeader variant="guest" />);

    expect(screen.getByText("공개 기록")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "내 공간" })).toHaveAttribute("href", "/app");
  });

  it("keeps the public login mobile back link instead of replacing it with auth entry", async () => {
    navigationState.pathname = "/login";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ authenticated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    render(<MobileHeader variant="guest" />);

    expect(screen.getByText("로그인")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "내 공간" })).not.toBeInTheDocument();
  });

  it("renders member notes as a secondary mobile page with a back link", () => {
    navigationState.pathname = "/app/notes";

    render(<MobileHeader variant="member" />);

    expect(screen.getByText("클럽 노트")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app");
  });

  it("renders host editor pages with a host back link", () => {
    navigationState.pathname = "/app/host/sessions/session-6/edit";

    render(<MobileHeader variant="host" />);

    expect(screen.getByText("세션 편집")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");
  });
});
```

- [x] **Step 2: Run the MobileHeader tests and verify they fail**

Run:

```bash
pnpm --dir front test front/tests/unit/responsive-navigation.test.tsx
```

Expected: FAIL because `front/shared/ui/mobile-header.tsx` does not exist.

- [x] **Step 3: Create `MobileHeader`**

Create `front/shared/ui/mobile-header.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePublicAuthAction, type PublicAuthAction } from "./public-auth-action";

export type MobileHeaderVariant = "guest" | "member" | "host";

type MobileHeaderProps = {
  variant: MobileHeaderVariant;
};

function publicTitle(pathname: string) {
  if (pathname === "/login" || pathname.startsWith("/invite/")) {
    return "로그인";
  }

  if (pathname === "/about") {
    return "클럽 소개";
  }

  if (pathname.startsWith("/sessions/")) {
    return "공개 기록";
  }

  return "읽는사이";
}

function appTitle(variant: Exclude<MobileHeaderVariant, "guest">, pathname: string) {
  if (pathname.startsWith("/app/host/sessions/new")) {
    return "새 세션";
  }

  if (pathname.startsWith("/app/host/sessions/")) {
    return "세션 편집";
  }

  if (pathname.startsWith("/app/host")) {
    return "호스트";
  }

  if (pathname.startsWith("/app/session")) {
    return "이번 세션";
  }

  if (pathname === "/app/notes") {
    return "클럽 노트";
  }

  if (pathname.startsWith("/app/archive")) {
    return "아카이브";
  }

  if (pathname.startsWith("/app/me")) {
    return "마이";
  }

  return variant === "host" ? "호스트" : "읽는사이";
}

function appBackHref(pathname: string) {
  if (pathname === "/app/notes") {
    return "/app";
  }

  if (pathname.startsWith("/app/host/sessions/")) {
    return "/app/host";
  }

  return null;
}

function HeaderShell({
  title,
  backHref,
  rightAction,
}: {
  title: string;
  backHref?: string | null;
  rightAction?: PublicAuthAction | null;
}) {
  return (
    <header className="m-hdr">
      <div style={{ width: 56, display: "flex" }}>
        {backHref ? (
          <Link href={backHref} className="m-hdr-link" aria-label="뒤로">
            뒤로
          </Link>
        ) : null}
      </div>
      <div className="m-hdr-title">{title}</div>
      <div style={{ minWidth: 56, display: "flex", justifyContent: "flex-end" }}>
        {rightAction ? (
          <Link href={rightAction.href} className="m-hdr-link">
            {rightAction.label}
          </Link>
        ) : null}
      </div>
    </header>
  );
}

function GuestMobileHeader() {
  const pathname = usePathname();
  const authAction = usePublicAuthAction({ href: "/login", label: "로그인" });
  const isEntryRoute = pathname === "/login" || pathname.startsWith("/invite/");

  return (
    <HeaderShell
      title={publicTitle(pathname)}
      backHref={isEntryRoute ? "/" : null}
      rightAction={isEntryRoute ? null : authAction}
    />
  );
}

function AppMobileHeader({ variant }: { variant: Exclude<MobileHeaderVariant, "guest"> }) {
  const pathname = usePathname();

  return <HeaderShell title={appTitle(variant, pathname)} backHref={appBackHref(pathname)} />;
}

export function MobileHeader({ variant }: MobileHeaderProps) {
  if (variant === "guest") {
    return <GuestMobileHeader />;
  }

  return <AppMobileHeader variant={variant} />;
}
```

- [x] **Step 4: Convert `PublicMobileHeader` into a wrapper**

Replace `front/shared/ui/public-mobile-header.tsx` with:

```tsx
import { MobileHeader } from "./mobile-header";

export function PublicMobileHeader() {
  return <MobileHeader variant="guest" />;
}
```

- [x] **Step 5: Run focused mobile header and public auth tests**

Run:

```bash
pnpm --dir front test front/tests/unit/responsive-navigation.test.tsx front/tests/unit/public-navigation-auth.test.tsx
```

Expected: PASS. Public auth tests must still cover `PublicMobileHeader` through the wrapper.

- [x] **Step 6: Commit Task 2**

```bash
git add front/shared/ui/mobile-header.tsx front/shared/ui/public-mobile-header.tsx front/tests/unit/responsive-navigation.test.tsx
git commit -m "feat: add shared mobile header"
```

## Task 3: Mobile Bottom Tab Bar

**Files:**
- Create: `front/shared/ui/mobile-tab-bar.tsx`
- Modify: `front/tests/unit/responsive-navigation.test.tsx`

- [x] **Step 1: Add failing MobileTabBar tests**

Add this import near the top of `front/tests/unit/responsive-navigation.test.tsx`:

```tsx
import { MobileTabBar } from "@/shared/ui/mobile-tab-bar";
```

Append these tests to the file:

```tsx
describe("MobileTabBar app tabs", () => {
  it("renders member mobile tabs with archive active", () => {
    navigationState.pathname = "/app/archive";

    render(<MobileTabBar variant="member" />);

    const tabs = screen.getByRole("navigation", { name: "App tabs" });
    expect(within(tabs).getByRole("link", { name: "홈" })).toHaveAttribute("href", "/app");
    expect(within(tabs).getByRole("link", { name: "세션" })).toHaveAttribute("href", "/app/session/current");
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("href", "/app/archive");
    expect(within(tabs).getByRole("link", { name: "마이" })).toHaveAttribute("href", "/app/me");
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).queryByRole("link", { name: "호스트" })).not.toBeInTheDocument();
  });

  it("renders host mobile tabs with host active for nested host routes", () => {
    navigationState.pathname = "/app/host/sessions/new";

    render(<MobileTabBar variant="host" />);

    const tabs = screen.getByRole("navigation", { name: "App tabs" });
    expect(within(tabs).getByRole("link", { name: "호스트" })).toHaveAttribute("href", "/app/host");
    expect(within(tabs).getByRole("link", { name: "세션" })).toHaveAttribute("href", "/app/session/current");
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("href", "/app/archive");
    expect(within(tabs).getByRole("link", { name: "마이" })).toHaveAttribute("href", "/app/me");
    expect(within(tabs).getByRole("link", { name: "호스트" })).toHaveAttribute("aria-current", "page");
  });

  it("leaves host mobile tabs without an active first tab on member home", () => {
    navigationState.pathname = "/app";

    render(<MobileTabBar variant="host" />);

    const tabs = screen.getByRole("navigation", { name: "App tabs" });
    expect(within(tabs).getByRole("link", { name: "호스트" })).not.toHaveAttribute("aria-current");
  });
});
```

- [x] **Step 2: Run the MobileTabBar tests and verify they fail**

Run:

```bash
pnpm --dir front test front/tests/unit/responsive-navigation.test.tsx
```

Expected: FAIL because `front/shared/ui/mobile-tab-bar.tsx` does not exist.

- [x] **Step 3: Create `MobileTabBar`**

Create `front/shared/ui/mobile-tab-bar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type MobileTabBarVariant = "member" | "host";

type MobileTabBarProps = {
  variant: MobileTabBarVariant;
};

type TabIconName = "home" | "session" | "archive" | "me" | "host";

type TabLink = {
  key: string;
  href: string;
  label: string;
  icon: TabIconName;
  current: (pathname: string) => boolean;
};

const memberTabs: TabLink[] = [
  { key: "home", href: "/app", label: "홈", icon: "home", current: (pathname) => pathname === "/app" },
  {
    key: "session",
    href: "/app/session/current",
    label: "세션",
    icon: "session",
    current: (pathname) => pathname.startsWith("/app/session"),
  },
  {
    key: "archive",
    href: "/app/archive",
    label: "아카이브",
    icon: "archive",
    current: (pathname) => pathname.startsWith("/app/archive"),
  },
  { key: "me", href: "/app/me", label: "마이", icon: "me", current: (pathname) => pathname.startsWith("/app/me") },
];

const hostTabs: TabLink[] = [
  {
    key: "host",
    href: "/app/host",
    label: "호스트",
    icon: "host",
    current: (pathname) => pathname.startsWith("/app/host"),
  },
  memberTabs[1],
  memberTabs[2],
  memberTabs[3],
];

function TabIcon({ name }: { name: TabIconName }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-7H9v7H5a1 1 0 0 1-1-1z" />
        </svg>
      );
    case "session":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M8 2v4M16 2v4M3 10h18M8 15h2M12 15h4M8 18h8" />
        </svg>
      );
    case "archive":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="4" rx="1" />
          <path d="M5 7v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7M10 11h4" />
        </svg>
      );
    case "me":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      );
    case "host":
      return (
        <svg {...common}>
          <path d="M4 20V10l8-6 8 6v10a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" />
        </svg>
      );
  }
}

export function MobileTabBar({ variant }: MobileTabBarProps) {
  const pathname = usePathname();
  const tabs = variant === "host" ? hostTabs : memberTabs;

  return (
    <nav className="m-tabbar" aria-label="App tabs">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className="m-tab"
          aria-current={tab.current(pathname) ? "page" : undefined}
        >
          <TabIcon name={tab.icon} />
          <span className="m-tab-label">{tab.label}</span>
        </Link>
      ))}
    </nav>
  );
}
```

- [x] **Step 4: Run focused responsive navigation tests**

Run:

```bash
pnpm --dir front test front/tests/unit/responsive-navigation.test.tsx
```

Expected: PASS.

- [x] **Step 5: Commit Task 3**

```bash
git add front/shared/ui/mobile-tab-bar.tsx front/tests/unit/responsive-navigation.test.tsx
git commit -m "feat: add mobile app tab bar"
```

## Task 4: App Route Layout and Mobile Padding

**Files:**
- Create: `front/app/(app)/app/layout.tsx`
- Modify: `front/app/globals.css`
- Create: `front/tests/unit/app-route-layout.test.tsx`

- [x] **Step 1: Write failing app layout tests**

Create `front/tests/unit/app-route-layout.test.tsx`:

```tsx
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse } from "@/shared/api/readmates";
import AppRouteLayout from "@/app/(app)/app/layout";

const navigationState = vi.hoisted(() => ({
  pathname: "/app",
}));

const fetchBffMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("@/app/(app)/app/bff", () => ({
  fetchBff: fetchBffMock,
}));

const memberAuth: AuthMeResponse = {
  authenticated: true,
  userId: "user-1",
  membershipId: "membership-1",
  clubId: "club-1",
  email: "member@example.com",
  displayName: "이멤버5",
  shortName: "멤버5",
  role: "MEMBER",
};

const hostAuth: AuthMeResponse = {
  ...memberAuth,
  userId: "host-1",
  email: "host@example.com",
  displayName: "김호스트",
  shortName: "호스트",
  role: "HOST",
};

afterEach(() => {
  cleanup();
  fetchBffMock.mockReset();
  navigationState.pathname = "/app";
});

describe("AppRouteLayout", () => {
  it("renders member app chrome around children", async () => {
    fetchBffMock.mockResolvedValue(memberAuth);
    navigationState.pathname = "/app/session/current";

    const element = await AppRouteLayout({ children: <div>member child</div> });
    render(element);

    expect(fetchBffMock).toHaveBeenCalledWith("/api/auth/me");
    expect(screen.getByText("member child")).toBeInTheDocument();

    const desktopNav = screen.getByRole("navigation", { name: "App navigation" });
    expect(within(desktopNav).getByRole("link", { name: "이번 세션" })).toHaveAttribute("aria-current", "page");
    expect(within(desktopNav).queryByRole("link", { name: "호스트" })).not.toBeInTheDocument();

    const mobileTabs = screen.getByRole("navigation", { name: "App tabs" });
    expect(within(mobileTabs).getByRole("link", { name: "세션" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByText("이번 세션").length).toBeGreaterThan(0);
  });

  it("renders host app chrome around children", async () => {
    fetchBffMock.mockResolvedValue(hostAuth);
    navigationState.pathname = "/app/host";

    const element = await AppRouteLayout({ children: <div>host child</div> });
    render(element);

    expect(fetchBffMock).toHaveBeenCalledWith("/api/auth/me");
    expect(screen.getByText("host child")).toBeInTheDocument();

    const desktopNav = screen.getByRole("navigation", { name: "App navigation" });
    expect(within(desktopNav).getByRole("link", { name: "호스트" })).toHaveAttribute("aria-current", "page");

    const mobileTabs = screen.getByRole("navigation", { name: "App tabs" });
    expect(within(mobileTabs).getByRole("link", { name: "호스트" })).toHaveAttribute("href", "/app/host");
    expect(within(mobileTabs).getByRole("link", { name: "호스트" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByText("호스트").length).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run app layout tests and verify they fail**

Run:

```bash
pnpm --dir front test front/tests/unit/app-route-layout.test.tsx
```

Expected: FAIL because `front/app/(app)/app/layout.tsx` does not exist.

- [x] **Step 3: Add the app route layout**

Create `front/app/(app)/app/layout.tsx`:

```tsx
import type { PropsWithChildren } from "react";
import type { AuthMeResponse } from "@/shared/api/readmates";
import { MobileHeader } from "@/shared/ui/mobile-header";
import { MobileTabBar } from "@/shared/ui/mobile-tab-bar";
import { TopNav } from "@/shared/ui/top-nav";
import { fetchBff } from "./bff";

export default async function AppRouteLayout({ children }: PropsWithChildren) {
  const auth = await fetchBff<AuthMeResponse>("/api/auth/me");
  const variant = auth.role === "HOST" ? "host" : "member";
  const memberName = auth.shortName ?? auth.displayName;

  return (
    <div className="app-shell">
      <div className="desktop-only">
        <TopNav variant={variant} memberName={memberName} />
      </div>
      <div className="mobile-only">
        <MobileHeader variant={variant} />
      </div>
      <div className="app-content">{children}</div>
      <div className="mobile-only">
        <MobileTabBar variant={variant} />
      </div>
    </div>
  );
}
```

- [x] **Step 4: Add app shell CSS**

Add this block to `front/app/globals.css` after `.public-shell.m-app`:

```css
.app-shell {
  min-height: 100vh;
}

.app-content {
  min-height: 100vh;
}
```

Add this block inside the existing `@media (max-width: 768px)` rule after `.public-shell.m-app`:

```css
  .app-shell {
    max-width: 480px;
    min-height: 100vh;
    margin: 0 auto;
    border-left: 1px solid var(--line-soft);
    border-right: 1px solid var(--line-soft);
    position: relative;
    background: var(--bg);
  }

  .app-content {
    min-height: calc(100vh - var(--m-hdr-h));
    padding-bottom: calc(var(--m-nav-h) + 40px + var(--m-safe-bottom));
  }
```

- [x] **Step 5: Run app layout tests**

Run:

```bash
pnpm --dir front test front/tests/unit/app-route-layout.test.tsx
```

Expected: PASS.

- [x] **Step 6: Run all focused navigation tests**

Run:

```bash
pnpm --dir front test front/tests/unit/responsive-navigation.test.tsx front/tests/unit/app-route-layout.test.tsx front/tests/unit/public-navigation-auth.test.tsx front/tests/unit/root-layout.test.tsx
```

Expected: PASS.

- [x] **Step 7: Commit Task 4**

```bash
git add front/app/'(app)'/app/layout.tsx front/app/globals.css front/tests/unit/app-route-layout.test.tsx
git commit -m "feat: add app navigation layout"
```

## Task 5: Browser Smoke and Full Verification

**Files:**
- Create: `front/tests/e2e/responsive-navigation-chrome.spec.ts`
- Verify all files touched by Tasks 1-4.

- [x] **Step 1: Add Playwright smoke coverage for desktop and mobile chrome**

Create `front/tests/e2e/responsive-navigation-chrome.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("desktop public and host pages show the expected top navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto("/");
  const publicNav = page.getByRole("navigation", { name: "Public navigation" });
  await expect(publicNav.getByRole("link", { name: "소개" })).toBeVisible();
  await expect(publicNav.getByRole("link", { name: "클럽" })).toBeVisible();
  await expect(publicNav.getByRole("link", { name: "공개 기록" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "App tabs" })).toHaveCount(0);

  await page.goto("/login");
  await page.getByRole("button", { name: /김호스트 · HOST/ }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto("/app/host");
  const appNav = page.getByRole("navigation", { name: "App navigation" });
  await expect(appNav.getByRole("link", { name: "홈" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "이번 세션" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "클럽 노트" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "아카이브" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "마이" })).toBeVisible();
  await expect(appNav.getByRole("link", { name: "호스트" })).toHaveAttribute("aria-current", "page");
});

test("mobile public pages hide app tabs and host app pages show mobile chrome", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileHeader = page.getByRole("banner");

  await page.goto("/");
  await expect(mobileHeader).toBeVisible();
  await expect(mobileHeader).toContainText("읽는사이");
  await expect(page.getByRole("navigation", { name: "App tabs" })).toHaveCount(0);

  await page.goto("/login");
  await expect(mobileHeader).toBeVisible();
  await expect(mobileHeader).toContainText("로그인");
  await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/");
  await page.getByRole("button", { name: /김호스트 · HOST/ }).click();
  await expect(page).toHaveURL(/\/app/);

  await page.goto("/app/host/sessions/new");
  await expect(mobileHeader).toBeVisible();
  await expect(mobileHeader).toContainText("새 세션");
  await expect(mobileHeader.getByRole("link", { name: "뒤로" })).toHaveAttribute("href", "/app/host");

  const tabs = page.getByRole("navigation", { name: "App tabs" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link", { name: "호스트" })).toHaveAttribute("href", "/app/host");
  await expect(tabs.getByRole("link", { name: "호스트" })).toHaveAttribute("aria-current", "page");
});
```

- [x] **Step 2: Run the new browser smoke test**

Run:

```bash
pnpm --dir front test:e2e tests/e2e/responsive-navigation-chrome.spec.ts
```

Expected: PASS. Playwright config starts the Spring Boot API and Next.js frontend, then runs the Chromium browser checks.

- [x] **Step 3: Commit Task 5**

```bash
git add front/tests/e2e/responsive-navigation-chrome.spec.ts
git commit -m "test: cover responsive navigation chrome"
```

- [x] **Step 4: Run all unit tests**

Run:

```bash
pnpm --dir front test
```

Expected: PASS.

- [x] **Step 5: Run lint**

Run:

```bash
pnpm --dir front lint
```

Expected: PASS.

- [x] **Step 6: Run existing app smoke e2e test**

Run:

```bash
pnpm --dir front test:e2e tests/e2e/public-auth-member-host.spec.ts
```

Expected: PASS.

- [x] **Step 7: Review git state before handoff**

Run:

```bash
git status --short
git log --oneline -5
```

Expected:

- Working tree is clean if every task commit was made.
- The latest commits include `feat: add role-aware desktop navigation`, `feat: add shared mobile header`, `feat: add mobile app tab bar`, `feat: add app navigation layout`, and `test: cover responsive navigation chrome`.

## Self-Review Notes

- Spec coverage: Tasks 1-4 cover desktop top nav, mobile header, mobile bottom tabs, app route layout, public auth action preservation, and mobile padding guard. Task 5 covers full test/lint/browser verification.
- Scope control: The plan does not change page body content, auth APIs, public session data, no-op icons, role switcher, tweaks panel, or FAB behavior.
- Type consistency: `TopNavVariant`, `MobileHeaderVariant`, and `MobileTabBarVariant` use the same `guest`/`member`/`host` naming from the design spec.
