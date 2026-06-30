# ReadMates Admin Workspace Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/admin` header's one-way member link with a safe "내 공간" menu that routes the current account to its existing member/host workspaces and offers a separate other-account login action.

**Architecture:** Keep the change frontend-only. Add a pure platform-admin model that derives internal workspace destinations from `AuthMeResponse.joinedClubs`, a prop-driven admin UI menu that handles logout failure locally, and a small route integration in `AdminShellLayout` using the already available `/api/auth/me` contract. Do not change server APIs, OAuth, cookies, membership roles, or platform-admin authorization.

**Tech Stack:** React 19, React Router 7, TanStack Query 5, Vite 8, Vitest, Testing Library, Playwright, existing ReadMates BFF auth client.

## Global Constraints

- Follow `docs/agents/front.md` for frontend route, state, API client, and tests.
- Follow `docs/agents/design.md` for UI, layout, copy, and visual polish.
- Follow `docs/agents/docs.md` for this plan and any documentation-only changes.
- Keep the frontend dependency direction: `src/app -> src/pages -> features -> shared`.
- UI components render from props/callbacks only; no direct `fetch`, `shared/api`, feature API, feature query, or route imports inside `front/features/platform-admin/ui`.
- Do not create a new server API, DB migration, OAuth provider behavior, auth cookie contract, or BFF behavior.
- Do not make platform admin act as a club host unless the current account already has HOST membership for that club.
- Do not implement support access, impersonation, audit-backed delegation, or `prompt=select_account` OAuth forwarding in this plan.
- Do not add real member data, private domains, deployment state, local absolute paths, OCIDs, secrets, or token-shaped examples.
- Generated hrefs must be internal paths in the form `/clubs/:slug/app` or `/clubs/:slug/app/host`.

---

## File Structure

- Create `front/features/platform-admin/model/admin-workspace-switcher-model.ts`: pure functions for deriving workspace rows, internal links, account label, empty state, and safe login return target.
- Create `front/features/platform-admin/model/admin-workspace-switcher-model.test.ts`: Vitest coverage for HOST, MEMBER, VIEWER, SUSPENDED, excluded statuses, empty state, account label, and return target.
- Create `front/features/platform-admin/ui/admin-workspace-switcher.tsx`: prop-driven menu button, workspace links, empty state, account label, other-account action, and local logout error.
- Create `front/features/platform-admin/ui/admin-workspace-switcher.test.tsx`: Testing Library coverage for menu rendering, host/member destinations, empty state, and logout failure/success callbacks.
- Modify `front/features/platform-admin/route/admin-shell-layout.tsx`: fetch/read auth in the admin shell, derive switcher props, replace the old `-> 멤버 공간` link, and invoke existing `logout()`.
- Modify `front/features/platform-admin/route/admin-shell-layout.test.tsx`: seed auth query data or mock auth fetch behavior, then assert the menu appears in the shell with current role badge.
- Modify `front/src/styles/globals.css`: add responsive admin workspace menu styles under the existing admin shell section.
- Modify `front/tests/e2e/admin-shell.spec.ts`: add a platform-admin-with-host fixture and verify `/admin` can navigate to `/clubs/:slug/app/host` from the header menu.

---

### Task 1: Workspace Destination Model

**Files:**
- Create: `front/features/platform-admin/model/admin-workspace-switcher-model.ts`
- Create: `front/features/platform-admin/model/admin-workspace-switcher-model.test.ts`

**Interfaces:**
- Consumes: `AuthMeResponse` and `AuthJoinedClub` from `@/shared/auth/auth-contracts`.
- Produces:
  - `type AdminWorkspaceDestination`
  - `function deriveAdminWorkspaceDestinations(auth: Pick<AuthMeResponse, "joinedClubs"> | null | undefined): AdminWorkspaceDestination[]`
  - `function adminWorkspaceAccountLabel(auth: Pick<AuthMeResponse, "email" | "accountName" | "displayName"> | null | undefined): string`
  - `function adminOtherAccountLoginPath(pathname: string, search: string, hash: string): string`

- [ ] **Step 1: Write the failing model test**

Create `front/features/platform-admin/model/admin-workspace-switcher-model.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import {
  adminOtherAccountLoginPath,
  adminWorkspaceAccountLabel,
  deriveAdminWorkspaceDestinations,
} from "./admin-workspace-switcher-model";

const baseAuth: AuthMeResponse = {
  authenticated: true,
  userId: "platform-user-1",
  membershipId: null,
  clubId: null,
  email: "operator@example.com",
  displayName: "운영자",
  accountName: "운영자 계정",
  role: null,
  membershipStatus: null,
  approvalState: "INACTIVE",
  currentMembership: null,
  joinedClubs: [],
  platformAdmin: { userId: "platform-user-1", email: "operator@example.com", role: "OWNER" },
  recommendedAppEntryUrl: "/admin",
};

describe("admin workspace switcher model", () => {
  it("creates host and member destinations for active host clubs", () => {
    const destinations = deriveAdminWorkspaceDestinations({
      ...baseAuth,
      joinedClubs: [
        {
          clubId: "club-host",
          clubSlug: "reading-sai",
          clubName: "읽는사이",
          membershipId: "membership-host",
          role: "HOST",
          status: "ACTIVE",
          primaryHost: null,
        },
      ],
    });

    expect(destinations).toEqual([
      {
        id: "membership-host:host",
        clubName: "읽는사이",
        clubSlug: "reading-sai",
        role: "HOST",
        status: "ACTIVE",
        label: "호스트 공간",
        href: "/clubs/reading-sai/app/host",
        priority: "primary",
      },
      {
        id: "membership-host:member",
        clubName: "읽는사이",
        clubSlug: "reading-sai",
        role: "HOST",
        status: "ACTIVE",
        label: "멤버 공간",
        href: "/clubs/reading-sai/app",
        priority: "secondary",
      },
    ]);
  });

  it("creates member destinations for readable non-host memberships", () => {
    const destinations = deriveAdminWorkspaceDestinations({
      ...baseAuth,
      joinedClubs: [
        {
          clubId: "club-member",
          clubSlug: "paper-room",
          clubName: "종이방",
          membershipId: "membership-member",
          role: "MEMBER",
          status: "SUSPENDED",
          primaryHost: "host@example.com",
        },
        {
          clubId: "club-viewer",
          clubSlug: "viewer-room",
          clubName: "둘러보기",
          membershipId: "membership-viewer",
          role: "MEMBER",
          status: "VIEWER",
          primaryHost: null,
        },
      ],
    });

    expect(destinations.map((item) => [item.id, item.href, item.label])).toEqual([
      ["membership-member:member", "/clubs/paper-room/app", "멤버 공간"],
      ["membership-viewer:member", "/clubs/viewer-room/app", "멤버 공간"],
    ]);
  });

  it("excludes memberships that cannot open a workspace", () => {
    const destinations = deriveAdminWorkspaceDestinations({
      ...baseAuth,
      joinedClubs: [
        {
          clubId: "club-invited",
          clubSlug: "invited-room",
          clubName: "초대 대기",
          membershipId: "membership-invited",
          role: "MEMBER",
          status: "INVITED",
          primaryHost: null,
        },
        {
          clubId: "club-left",
          clubSlug: "left-room",
          clubName: "떠난 클럽",
          membershipId: "membership-left",
          role: "HOST",
          status: "LEFT",
          primaryHost: null,
        },
      ],
    });

    expect(destinations).toEqual([]);
  });

  it("uses public-safe account labels and safe admin return paths", () => {
    expect(adminWorkspaceAccountLabel(baseAuth)).toBe("운영자 계정");
    expect(adminWorkspaceAccountLabel({ ...baseAuth, accountName: null, displayName: null })).toBe("operator@example.com");
    expect(adminWorkspaceAccountLabel(null)).toBe("현재 계정");
    expect(adminOtherAccountLoginPath("/admin/clubs", "?filter=ready", "#top")).toBe(
      "/login?returnTo=%2Fadmin%2Fclubs%3Ffilter%3Dready%23top",
    );
    expect(adminOtherAccountLoginPath("/clubs/reading-sai/app", "", "")).toBe("/login?returnTo=%2Fadmin");
  });
});
```

- [ ] **Step 2: Run the failing model test**

Run:

```bash
pnpm --dir front test -- admin-workspace-switcher-model
```

Expected: FAIL because `admin-workspace-switcher-model.ts` does not exist.

- [ ] **Step 3: Implement the model**

Create `front/features/platform-admin/model/admin-workspace-switcher-model.ts`:

```ts
import type { AuthJoinedClub, AuthMeResponse, MemberRole, MembershipStatus } from "@/shared/auth/auth-contracts";
import { loginPathForReturnTo, safeRelativeReturnTo } from "@/shared/auth/login-return";

export type AdminWorkspaceDestination = {
  id: string;
  clubName: string;
  clubSlug: string;
  role: MemberRole;
  status: MembershipStatus;
  label: "호스트 공간" | "멤버 공간";
  href: string;
  priority: "primary" | "secondary";
};

const readableStatuses = new Set<MembershipStatus>(["VIEWER", "ACTIVE", "SUSPENDED"]);

function clubAppHref(clubSlug: string) {
  return `/clubs/${encodeURIComponent(clubSlug)}/app`;
}

function clubHostHref(clubSlug: string) {
  return `${clubAppHref(clubSlug)}/host`;
}

function memberDestination(club: AuthJoinedClub): AdminWorkspaceDestination {
  return {
    id: `${club.membershipId}:member`,
    clubName: club.clubName,
    clubSlug: club.clubSlug,
    role: club.role,
    status: club.status,
    label: "멤버 공간",
    href: clubAppHref(club.clubSlug),
    priority: "secondary",
  };
}

export function deriveAdminWorkspaceDestinations(
  auth: Pick<AuthMeResponse, "joinedClubs"> | null | undefined,
): AdminWorkspaceDestination[] {
  const destinations: AdminWorkspaceDestination[] = [];

  for (const club of auth?.joinedClubs ?? []) {
    if (club.role === "HOST" && club.status === "ACTIVE") {
      destinations.push({
        id: `${club.membershipId}:host`,
        clubName: club.clubName,
        clubSlug: club.clubSlug,
        role: club.role,
        status: club.status,
        label: "호스트 공간",
        href: clubHostHref(club.clubSlug),
        priority: "primary",
      });
      destinations.push(memberDestination(club));
      continue;
    }

    if (readableStatuses.has(club.status)) {
      destinations.push(memberDestination(club));
    }
  }

  return destinations;
}

export function adminWorkspaceAccountLabel(
  auth: Pick<AuthMeResponse, "email" | "accountName" | "displayName"> | null | undefined,
): string {
  return auth?.accountName || auth?.displayName || auth?.email || "현재 계정";
}

export function adminOtherAccountLoginPath(pathname: string, search: string, hash: string): string {
  const returnTo = safeRelativeReturnTo(`${pathname}${search}${hash}`);
  return loginPathForReturnTo(returnTo?.startsWith("/admin") ? returnTo : "/admin");
}
```

- [ ] **Step 4: Run the model test**

Run:

```bash
pnpm --dir front test -- admin-workspace-switcher-model
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add front/features/platform-admin/model/admin-workspace-switcher-model.ts front/features/platform-admin/model/admin-workspace-switcher-model.test.ts
git commit -m "feat(front): model admin workspace destinations"
```

---

### Task 2: Prop-Driven Admin Workspace Menu

**Files:**
- Create: `front/features/platform-admin/ui/admin-workspace-switcher.tsx`
- Create: `front/features/platform-admin/ui/admin-workspace-switcher.test.tsx`
- Modify: `front/src/styles/globals.css`

**Interfaces:**
- Consumes:
  - `AdminWorkspaceDestination[]`
  - `accountLabel: string`
  - `onOtherAccountLogin(): Promise<boolean>`
- Produces:
  - `AdminWorkspaceSwitcher` React component.
  - Accessible button named `내 공간`.
  - Menu-local alert text `로그아웃에 실패했습니다. 다시 시도해 주세요.`

- [ ] **Step 1: Write the failing UI test**

Create `front/features/platform-admin/ui/admin-workspace-switcher.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { AdminWorkspaceDestination } from "@/features/platform-admin/model/admin-workspace-switcher-model";
import { AdminWorkspaceSwitcher } from "./admin-workspace-switcher";

const destinations: AdminWorkspaceDestination[] = [
  {
    id: "membership-host:host",
    clubName: "읽는사이",
    clubSlug: "reading-sai",
    role: "HOST",
    status: "ACTIVE",
    label: "호스트 공간",
    href: "/clubs/reading-sai/app/host",
    priority: "primary",
  },
  {
    id: "membership-host:member",
    clubName: "읽는사이",
    clubSlug: "reading-sai",
    role: "HOST",
    status: "ACTIVE",
    label: "멤버 공간",
    href: "/clubs/reading-sai/app",
    priority: "secondary",
  },
];

function renderSwitcher(overrides: Partial<React.ComponentProps<typeof AdminWorkspaceSwitcher>> = {}) {
  const onOtherAccountLogin = overrides.onOtherAccountLogin ?? vi.fn(async () => true);
  return render(
    <MemoryRouter>
      <AdminWorkspaceSwitcher
        accountLabel="operator@example.com"
        destinations={destinations}
        onOtherAccountLogin={onOtherAccountLogin}
        {...overrides}
      />
    </MemoryRouter>,
  );
}

describe("AdminWorkspaceSwitcher", () => {
  it("opens a menu with host and member workspace links", () => {
    renderSwitcher();

    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));

    expect(screen.getByText("내 ReadMates 공간")).toBeInTheDocument();
    expect(screen.getByText("operator@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "읽는사이 호스트 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host",
    );
    expect(screen.getByRole("link", { name: "읽는사이 멤버 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app",
    );
    expect(screen.getAllByText("HOST").length).toBeGreaterThan(0);
  });

  it("shows an empty state for accounts without workspace destinations", () => {
    renderSwitcher({ destinations: [] });

    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));

    expect(screen.getByText("이 계정으로 열 수 있는 클럽이 없습니다.")).toBeInTheDocument();
  });

  it("keeps the menu open and shows a local error when other-account login fails", async () => {
    const onOtherAccountLogin = vi.fn(async () => false);
    renderSwitcher({ onOtherAccountLogin });

    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));
    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));

    await waitFor(() => {
      expect(onOtherAccountLogin).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("alert")).toHaveTextContent("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    });
  });
});
```

- [ ] **Step 2: Run the failing UI test**

Run:

```bash
pnpm --dir front test -- admin-workspace-switcher
```

Expected: FAIL because `admin-workspace-switcher.tsx` does not exist.

- [ ] **Step 3: Implement the UI component**

Create `front/features/platform-admin/ui/admin-workspace-switcher.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import type { AdminWorkspaceDestination } from "@/features/platform-admin/model/admin-workspace-switcher-model";

type Props = {
  accountLabel: string;
  destinations: AdminWorkspaceDestination[];
  onOtherAccountLogin: () => Promise<boolean>;
};

export function AdminWorkspaceSwitcher({ accountLabel, destinations, onOtherAccountLogin }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOtherAccountLogin() {
    setBusy(true);
    setError(null);
    try {
      const ok = await onOtherAccountLogin();
      if (!ok) {
        setError("로그아웃에 실패했습니다. 다시 시도해 주세요.");
      }
    } catch {
      setError("로그아웃에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-workspace-switcher">
      <button
        type="button"
        className="btn btn-ghost btn-sm admin-workspace-switcher__trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        내 공간
      </button>
      {open ? (
        <div className="admin-workspace-switcher__menu" role="menu" aria-label="내 ReadMates 공간">
          <div className="admin-workspace-switcher__head">
            <p className="eyebrow">내 ReadMates 공간</p>
            <p className="tiny muted">{accountLabel}</p>
          </div>
          <div className="admin-workspace-switcher__list">
            {destinations.length === 0 ? (
              <p className="small admin-workspace-switcher__empty">이 계정으로 열 수 있는 클럽이 없습니다.</p>
            ) : (
              destinations.map((destination) => (
                <Link
                  key={destination.id}
                  to={destination.href}
                  role="menuitem"
                  className={`admin-workspace-switcher__item admin-workspace-switcher__item--${destination.priority}`}
                >
                  <span className="admin-workspace-switcher__club">{destination.clubName}</span>
                  <span className="admin-workspace-switcher__meta">
                    <span className="badge">{destination.role}</span>
                    <span className="badge">{destination.status}</span>
                    <span>{destination.label}</span>
                  </span>
                </Link>
              ))
            )}
          </div>
          <div className="admin-workspace-switcher__footer">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void handleOtherAccountLogin()}>
              {busy ? "로그아웃 중" : "다른 계정으로 로그인"}
            </button>
            {error ? (
              <p className="small admin-workspace-switcher__error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Add focused CSS**

Modify `front/src/styles/globals.css` near the existing `.admin-shell__header-actions` styles:

```css
.admin-workspace-switcher {
  position: relative;
}

.admin-workspace-switcher__trigger {
  min-width: 76px;
}

.admin-workspace-switcher__menu {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 30;
  display: grid;
  gap: 12px;
  width: min(360px, calc(100vw - 32px));
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow-lg);
  padding: 14px;
}

.admin-workspace-switcher__head,
.admin-workspace-switcher__footer {
  display: grid;
  gap: 4px;
}

.admin-workspace-switcher__list {
  display: grid;
  gap: 8px;
}

.admin-workspace-switcher__item {
  display: grid;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: inherit;
  padding: 10px 12px;
  text-decoration: none;
}

.admin-workspace-switcher__item--primary {
  border-color: var(--accent);
  background: var(--bg-sub);
}

.admin-workspace-switcher__club {
  min-width: 0;
  overflow-wrap: anywhere;
  font-weight: 900;
}

.admin-workspace-switcher__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  color: var(--text-3);
  font-size: 12px;
  font-weight: 800;
}

.admin-workspace-switcher__empty {
  margin: 0;
  color: var(--text-3);
}

.admin-workspace-switcher__error {
  margin: 0;
  color: var(--danger);
}
```

Inside the existing narrow mobile media query for `max-width: 520px`, add:

```css
.admin-workspace-switcher,
.admin-workspace-switcher__trigger {
  width: 100%;
}

.admin-workspace-switcher__menu {
  left: 0;
  right: auto;
  width: 100%;
}
```

- [ ] **Step 5: Run the UI test**

Run:

```bash
pnpm --dir front test -- admin-workspace-switcher
```

Expected: PASS for model and UI switcher tests.

- [ ] **Step 6: Commit Task 2**

```bash
git add front/features/platform-admin/ui/admin-workspace-switcher.tsx front/features/platform-admin/ui/admin-workspace-switcher.test.tsx front/src/styles/globals.css
git commit -m "feat(front): add admin workspace menu"
```

---

### Task 3: Wire The Menu Into AdminShellLayout

**Files:**
- Modify: `front/features/platform-admin/route/admin-shell-layout.tsx`
- Modify: `front/features/platform-admin/route/admin-shell-layout.test.tsx`

**Interfaces:**
- Consumes:
  - `deriveAdminWorkspaceDestinations(auth)`
  - `adminWorkspaceAccountLabel(auth)`
  - `adminOtherAccountLoginPath(pathname, search, hash)`
  - `logout()` from `@/features/auth/api/auth-api`
- Produces:
  - Admin header uses `AdminWorkspaceSwitcher`.
  - Old `Link to="/app"` is removed.
  - Successful other-account login calls `window.location.assign(loginPath)`.

- [ ] **Step 1: Extend the shell test first**

Modify `front/features/platform-admin/route/admin-shell-layout.test.tsx` imports:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
```

Add this mock near the imports:

```tsx
vi.mock("@/features/auth/api/auth-api", () => ({
  logout: vi.fn(),
}));

import { logout } from "@/features/auth/api/auth-api";
```

Add this auth fixture near `clubs`:

```tsx
const auth = {
  authenticated: true,
  userId: "platform-owner-user",
  membershipId: null,
  clubId: null,
  email: "owner@example.com",
  displayName: "OWNER admin",
  accountName: "OWNER admin",
  role: null,
  membershipStatus: null,
  approvalState: "INACTIVE",
  currentMembership: null,
  joinedClubs: [
    {
      clubId: "club-reading-sai",
      clubSlug: "reading-sai",
      clubName: "읽는사이",
      membershipId: "membership-host",
      role: "HOST",
      status: "ACTIVE",
      primaryHost: null,
    },
  ],
  platformAdmin: { userId: "platform-owner-user", email: "owner@example.com", role: "OWNER" },
  recommendedAppEntryUrl: "/admin",
} satisfies AuthMeResponse;
```

Update `renderShell` so it can seed auth:

```tsx
function renderShell(initialEntry: string, opts: { auth?: typeof auth | null } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, summary);
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, clubs);
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/admin/*" element={<AdminShellLayout auth={opts.auth ?? auth} />}>
            <Route path="today" element={<div>today content</div>} />
            <Route path="clubs" element={<div>clubs content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

Add tests:

```tsx
beforeEach(() => {
  vi.mocked(logout).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("replaces the member-space link with current-account workspace destinations", () => {
  renderShell("/admin/today");

  expect(screen.queryByRole("link", { name: /멤버 공간/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "내 공간" }));

  expect(screen.getByRole("link", { name: "읽는사이 호스트 공간" })).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app/host",
  );
  expect(screen.getByRole("link", { name: "읽는사이 멤버 공간" })).toHaveAttribute(
    "href",
    "/clubs/reading-sai/app",
  );
});

it("sends other-account login through logout and a safe admin return path", async () => {
  vi.mocked(logout).mockResolvedValue(new Response(null, { status: 204 }));
  const assign = vi.fn();
  vi.stubGlobal("location", { assign });

  renderShell("/admin/clubs?filter=ready#top");
  fireEvent.click(screen.getByRole("button", { name: "내 공간" }));
  fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));

  await waitFor(() => {
    expect(logout).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/login?returnTo=%2Fadmin%2Fclubs%3Ffilter%3Dready%23top");
  });
});
```

- [ ] **Step 2: Run the failing shell test**

Run:

```bash
pnpm --dir front test -- admin-shell-layout
```

Expected: FAIL because `AdminShellLayout` does not accept `auth` and still renders the old `/app` link.

- [ ] **Step 3: Wire the menu in the shell**

Modify `front/features/platform-admin/route/admin-shell-layout.tsx` imports:

```tsx
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { logout } from "@/features/auth/api/auth-api";
import {
  adminOtherAccountLoginPath,
  adminWorkspaceAccountLabel,
  deriveAdminWorkspaceDestinations,
} from "@/features/platform-admin/model/admin-workspace-switcher-model";
import { AdminWorkspaceSwitcher } from "@/features/platform-admin/ui/admin-workspace-switcher";
```

Change the exported component signatures:

```tsx
export function AdminShellLayout({ auth = null }: { auth?: AuthMeResponse | null }) {
  return (
    <AdminBreadcrumbProvider>
      <AdminShellLayoutInner auth={auth} />
    </AdminBreadcrumbProvider>
  );
}

function AdminShellLayoutInner({ auth }: { auth: AuthMeResponse | null }) {
```

Inside `AdminShellLayoutInner`, after `const [isWizardDirty, setIsWizardDirty] = useState(false);`, add:

```tsx
  const workspaceDestinations = deriveAdminWorkspaceDestinations(auth);
  const workspaceAccountLabel = adminWorkspaceAccountLabel(auth);
  const otherAccountLoginPath = adminOtherAccountLoginPath(location.pathname, location.search, location.hash);

  async function otherAccountLogin() {
    const response = await logout();
    if (response.ok || response.status === 401) {
      window.location.assign(otherAccountLoginPath);
      return true;
    }
    return false;
  }
```

Replace the old `/app` link:

```tsx
          <AdminWorkspaceSwitcher
            accountLabel={workspaceAccountLabel}
            destinations={workspaceDestinations}
            onOtherAccountLogin={otherAccountLogin}
          />
```

Keep `새 클럽` and the platform role badge unchanged.

- [ ] **Step 4: Pass auth from the admin route loader**

Modify `front/features/platform-admin/route/admin-shell-data.ts`:

```ts
export function adminShellLoaderFactory(queryClient: QueryClient) {
  return async function loadAdminShell(args?: LoaderFunctionArgs) {
    const auth = await requirePlatformAdminLoaderAuth(args);
    await Promise.all([
      queryClient.fetchQuery(platformAdminSummaryQuery()),
      queryClient.fetchQuery(platformAdminClubsQuery()),
    ]);
    return auth;
  };
}
```

Modify the lazy element inside `front/src/app/routes/admin.tsx`:

```tsx
import { useLoaderData } from "react-router-dom";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

function AdminShellElement() {
  const auth = useLoaderData() as AuthMeResponse;
  return (
    <RequirePlatformAdmin>
      <AdminShellLayout auth={auth} />
    </RequirePlatformAdmin>
  );
}
```

If imports are inside the lazy callback, add them at file top instead; keep React Router route structure unchanged.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
pnpm --dir front test -- admin-workspace-switcher admin-shell-layout
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add front/features/platform-admin/route/admin-shell-layout.tsx front/features/platform-admin/route/admin-shell-layout.test.tsx front/features/platform-admin/route/admin-shell-data.ts front/src/app/routes/admin.tsx
git commit -m "feat(front): wire admin workspace switcher"
```

---

### Task 4: E2E Coverage And Closeout

**Files:**
- Modify: `front/tests/e2e/admin-shell.spec.ts`

**Interfaces:**
- Consumes: `/admin` shell UI and existing route mocks/dev login helpers.
- Produces: Playwright coverage proving a platform admin with HOST membership can navigate from `/admin` to `/clubs/:slug/app/host`.

- [ ] **Step 1: Add the E2E test**

Modify `front/tests/e2e/admin-shell.spec.ts` by adding helper fixtures below `loginWithDevShortcut`:

```ts
async function routePlatformAdminHostWorkspace(page: Page) {
  await page.route("**/api/bff/api/auth/me**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authenticated: true,
        userId: "platform-owner-user",
        membershipId: null,
        clubId: null,
        email: "owner@example.com",
        displayName: "OWNER admin",
        accountName: "OWNER admin",
        role: null,
        membershipStatus: null,
        approvalState: "INACTIVE",
        currentMembership: null,
        joinedClubs: [
          {
            clubId: "club-reading-sai",
            clubSlug: "reading-sai",
            clubName: "읽는사이",
            membershipId: "membership-host",
            role: "HOST",
            status: "ACTIVE",
            primaryHost: null,
          },
        ],
        platformAdmin: { userId: "platform-owner-user", email: "owner@example.com", role: "OWNER" },
        recommendedAppEntryUrl: "/admin",
      }),
    });
  });
  await page.route("**/api/bff/api/admin/summary", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        platformRole: "OWNER",
        activeClubCount: 1,
        domainActionRequiredCount: 0,
        domainsRequiringAction: [],
      }),
    });
  });
  await page.route("**/api/bff/api/admin/clubs", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [] }),
    });
  });
  await page.route("**/api/bff/api/host/dashboard?clubSlug=reading-sai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        member: { displayName: "OWNER admin", role: "HOST", membershipStatus: "ACTIVE" },
        currentSession: null,
        upcomingSessions: [],
        recentRecords: [],
        invitations: { pendingCount: 0 },
      }),
    });
  });
  await page.route("**/api/bff/api/host/club-operations?clubSlug=reading-sai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        readiness: { state: "READY", blockingReasons: [], nextAction: null },
        memberActivity: { activeCount: 1, dormantCount: 0, pendingViewerCount: 0, hostCount: 1 },
        sessionProgress: { upcomingCount: 0, currentOpenCount: 0, closedCount: 0, publishedRecordCount: 0, incompleteRecordCount: 0 },
        notificationHealth: { pending: 0, failed: 0, dead: 0, lastSuccessAt: null, failureClusters: [] },
        aiUsage: { activeJobs: 0, failedRecentJobs: 0, staleCandidates: 0, costEstimateUsd: "0.0000", state: "IDLE" },
      }),
    });
  });
  await page.route("**/api/bff/api/host/notifications/summary?clubSlug=reading-sai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pending: 0, failed: 0, dead: 0, recentFailures: [] }),
    });
  });
  await page.route("**/api/bff/api/sessions/current?clubSlug=reading-sai", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ currentSession: null }),
    });
  });
}
```

Add the test:

```ts
  test("platform admin with host membership can open host workspace from the admin header", async ({ page }) => {
    await routePlatformAdminHostWorkspace(page);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/today$/);

    await page.getByRole("button", { name: "내 공간" }).click();
    await page.getByRole("link", { name: "읽는사이 호스트 공간" }).click();

    await expect(page).toHaveURL(/\/clubs\/reading-sai\/app\/host$/);
    await expect(page.getByRole("heading", { name: /호스트님/ })).toBeVisible();
  });
```

- [ ] **Step 2: Run the targeted E2E test**

Run:

```bash
pnpm --dir front test:e2e -- tests/e2e/admin-shell.spec.ts
```

Expected: PASS. If the host dashboard mock shape is stale, inspect `front/features/host/api/host-contracts.ts` and update only public-safe fixture fields required by current zod parsing.

- [ ] **Step 3: Run frontend checks**

Run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
```

Expected: all pass. If `front build` still emits an existing chunk-size warning, report it as pre-existing unless this change creates a new warning.

- [ ] **Step 4: Run public-safety and whitespace checks for changed files**

Run:

```bash
git diff --check -- front/features/platform-admin/model/admin-workspace-switcher-model.ts front/features/platform-admin/model/admin-workspace-switcher-model.test.ts front/features/platform-admin/ui/admin-workspace-switcher.tsx front/features/platform-admin/ui/admin-workspace-switcher.test.tsx front/features/platform-admin/route/admin-shell-layout.tsx front/features/platform-admin/route/admin-shell-layout.test.tsx front/features/platform-admin/route/admin-shell-data.ts front/src/app/routes/admin.tsx front/src/styles/globals.css front/tests/e2e/admin-shell.spec.ts
rg -n "PRIVATE_DOMAIN_SENTINEL|RAW_MEMBER_EMAIL_SENTINEL|OCID|token|secret|localhost|/Users/" front/features/platform-admin front/tests/e2e/admin-shell.spec.ts
```

Expected: `git diff --check` passes. `rg` may find existing harmless words like `token` in unrelated fixture text; inspect matches and confirm no new real secrets, private domains, OCIDs, token-shaped examples, or local absolute paths were introduced.

- [ ] **Step 5: Commit Task 4**

```bash
git add front/tests/e2e/admin-shell.spec.ts
git commit -m "test(front): cover admin workspace switcher flow"
```

---

## Final Verification

After all tasks are committed, run:

```bash
pnpm --dir front lint
pnpm --dir front test
pnpm --dir front build
pnpm --dir front test:e2e -- tests/e2e/admin-shell.spec.ts
git diff --check
```

Expected: all commands pass. The final response must name the changed surface (`front/features/platform-admin`, `front/src/app/routes/admin.tsx`, `front/src/styles/globals.css`, `front/tests/e2e/admin-shell.spec.ts`), list the checks actually run, and call out any skipped validation or residual risk.

## Self-Review Notes

- Spec coverage: Tasks 1-3 implement current-account workspace routing, host/member destinations, other-account login, empty state, failure state, and frontend-only architecture. Task 4 implements E2E and closeout validation.
- Scope: No server API, DB migration, OAuth prompt forwarding, support access, or impersonation work is included.
- Public safety: Fixtures use `example.com` and `reading-sai`; no real member data, private domains, deployment identifiers, local paths, secrets, or token-shaped values are required.
