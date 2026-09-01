import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import type {
  PlatformAdminClubListResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/model/platform-admin-domain-types";
import type { PlatformAdminCapabilities } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { AdminOperationCasesResponse } from "@/features/platform-admin/api/platform-admin-operations-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { ReadMatesSessionExpiredError } from "@/shared/api/client";
import { apiErrorFromResponse } from "@/shared/api/errors";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  platformAdminClubsQuery,
  platformAdminKeys,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminOperationCasesQuery } from "@/features/platform-admin/queries/platform-admin-operations-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { createGlobalSpaceTransitionCoordinator } from "@/src/app/global-space-transition";
import { SpaceTransitionSafetyProvider } from "@/shared/ui/space-transition-safety-context";

vi.mock("@/shared/auth/session-api", () => ({
  logoutCurrentSession: vi.fn(),
}));

vi.mock(
  "@/features/platform-admin/api/platform-admin-operations-api",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/platform-admin/api/platform-admin-operations-api")
    >()),
    fetchAdminOperationCases: vi.fn(),
  }),
);

vi.mock(
  "@/features/platform-admin/api/platform-admin-health-api",
  () => ({
    fetchPlatformAdminHealthSnapshot: vi.fn(),
  }),
);

vi.mock(
  "@/features/platform-admin/api/platform-admin-capabilities-api",
  () => ({
    fetchPlatformAdminCapabilities: vi.fn(),
  }),
);

vi.mock(
  "@/features/platform-admin/api/platform-admin-api",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/platform-admin/api/platform-admin-api")
    >()),
    fetchPlatformAdminSummary: vi.fn(),
    fetchPlatformAdminClubs: vi.fn(),
    previewPlatformAdminOnboarding: vi.fn(),
    commitPlatformAdminOnboarding: vi.fn(),
  }),
);

import { logoutCurrentSession } from "@/shared/auth/session-api";
import { fetchAdminOperationCases } from "@/features/platform-admin/api/platform-admin-operations-api";
import { fetchPlatformAdminHealthSnapshot } from "@/features/platform-admin/api/platform-admin-health-api";
import {
  commitPlatformAdminOnboarding,
  fetchPlatformAdminClubs,
  fetchPlatformAdminSummary,
  previewPlatformAdminOnboarding,
} from "@/features/platform-admin/api/platform-admin-api";
import { platformAdminHealthSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-health-queries";
import { AdminShellController } from "./admin-shell-controller";
import { AdminClubsRoute } from "./admin-clubs-route";

const summary: PlatformAdminSummaryResponse = {
  platformRole: "OWNER",
  activeClubCount: 1,
  domainActionRequiredCount: 0,
  domainsRequiringAction: [],
};

const clubs: PlatformAdminClubListResponse = { items: [] };

const ownerCapabilities: PlatformAdminCapabilities = {
  schemaVersion: 1,
  role: "OWNER",
  status: "ACTIVE",
  capabilities: [
    "VIEW_TODAY",
    "VIEW_CLUBS",
    "VIEW_CLUB_OPERATIONS",
    "VIEW_SERVICE_HEALTH",
    "VIEW_NOTIFICATION_OPERATIONS",
    "REPLAY_NOTIFICATIONS",
    "VIEW_AI_OPERATIONS",
    "MANAGE_AI_OPERATIONS",
    "VIEW_SUPPORT",
    "MANAGE_SUPPORT_ACCESS",
    "VIEW_AUDIT",
    "VIEW_SENSITIVE_AUDIT",
    "VIEW_ANALYTICS",
    "EXPORT_ANALYTICS",
    "CREATE_CLUB",
    "MANAGE_CLUBS",
    "MANAGE_CLUB_DOMAINS",
    "MANAGE_PLATFORM_ADMINS",
  ],
  generatedAt: "2026-08-22T00:00:00Z",
};

const supportViewCapabilities: PlatformAdminCapabilities["capabilities"] = [
  "VIEW_TODAY",
  "VIEW_CLUBS",
  "VIEW_CLUB_OPERATIONS",
  "VIEW_SERVICE_HEALTH",
  "VIEW_NOTIFICATION_OPERATIONS",
  "VIEW_AI_OPERATIONS",
  "VIEW_SUPPORT",
  "VIEW_AUDIT",
  "VIEW_ANALYTICS",
];

const memberQueryKey = ["current-session", "me"] as const;
const memberSnapshot = { userId: "member-1" };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function forbiddenError() {
  return apiErrorFromResponse(
    new Response(
      JSON.stringify({
        code: "PERMISSION_DENIED",
        message: "이 작업을 수행할 권한이 없습니다.",
        status: 403,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    ),
  );
}

const operations: AdminOperationCasesResponse = {
  schema: "admin.operation_cases.v1",
  generatedAt: "2026-08-04T10:00:00Z",
  counts: { open: 8, critical: 1, assignedToMe: 2, snoozed: 1 },
  sources: [
    {
      sourceType: "NOTIFICATION",
      status: "AVAILABLE",
      generatedAt: "2026-08-04T10:00:00Z",
      lastSuccessfulAt: "2026-08-04T10:00:00Z",
      authoritative: true,
    },
  ],
  items: [],
  nextCursor: null,
};

const quietOperations: AdminOperationCasesResponse = {
  ...operations,
  counts: { open: 0, critical: 0, assignedToMe: 0, snoozed: 0 },
};

const healthSnapshot = {
  schema: "platform.health_snapshot.v1" as const,
  generatedAt: "2026-08-04T10:00:00Z",
  lastSuccessfulAt: "2026-08-04T10:00:00Z",
  refreshState: "FRESH" as const,
  staleAgeSeconds: 0,
  cards: [
    {
      id: "outbox_backlog",
      title: "Outbox backlog",
      status: "OK" as const,
      metric: { value: 0, unit: "rows", label: "pending" },
      thresholds: { warn: 100, crit: 1000 },
      lastCheckedAt: "2026-08-04T10:00:00Z",
      source: "IN_PROCESS" as const,
      drill: null,
      reason: null,
      deployStrip: null,
    },
  ],
};

const alarmOperationsQuery = platformAdminOperationCasesQuery({
  states: ["OPEN", "ACKNOWLEDGED"],
});

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
      approvalState: "ACTIVE",
      primaryHost: null,
    },
  ],
  platformAdmin: {
    userId: "platform-owner-user",
    email: "owner@example.com",
    role: "OWNER",
  },
  recommendedAppEntryUrl: "/admin",
} satisfies AuthMeResponse;

function renderShell(
  initialEntry: string,
  opts: {
    auth?: AuthMeResponse | null;
    operations?: AdminOperationCasesResponse;
    summary?: PlatformAdminSummaryResponse;
    capabilities?: PlatformAdminCapabilities;
    health?: typeof healthSnapshot;
    initialEntries?: string[];
    initialIndex?: number;
    spaceSwitcher?: ReactNode;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  installPlatformAdminAuthorityLossHandler(queryClient);
  queryClient.setQueryData(
    platformAdminSummaryQuery().queryKey,
    opts.summary ?? summary,
  );
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, clubs);
  queryClient.setQueryData(
    platformAdminCapabilitiesQuery().queryKey,
    opts.capabilities ?? ownerCapabilities,
  );
  queryClient.setQueryData(
    platformAdminOperationCasesQuery().queryKey,
    opts.operations ?? quietOperations,
  );
  queryClient.setQueryData(
    alarmOperationsQuery.queryKey,
    opts.operations ?? quietOperations,
  );
  queryClient.setQueryData(
    platformAdminHealthSnapshotQuery().queryKey,
    opts.health ?? healthSnapshot,
  );
  queryClient.setQueryData(memberQueryKey, memberSnapshot);
  const transitionCoordinator = createGlobalSpaceTransitionCoordinator();
  const router = createMemoryRouter(
    [
      {
        path: "/admin",
        element: (
          <AdminShellController
            auth={opts.auth === undefined ? auth : opts.auth}
            spaceSwitcher={opts.spaceSwitcher ?? <button type="button">주입된 공간 전환</button>}
            onPlatformAuthorityLoss={transitionCoordinator.invalidateForAuthorityLoss}
          />
        ),
        children: [
          { path: "today", element: <div>today content</div> },
          { path: "clubs", element: <AdminClubsRoute /> },
          { path: "clubs/:clubId", element: <div>club detail</div> },
          { path: "public-takedown", element: <div>public takedown content</div> },
        ],
      },
    ],
    {
      initialEntries: opts.initialEntries ?? [initialEntry],
      initialIndex: opts.initialIndex,
    },
  );
  const view = render(
    <QueryClientProvider client={queryClient}>
      <SpaceTransitionSafetyProvider port={transitionCoordinator}>
        <RouterProvider router={router} />
      </SpaceTransitionSafetyProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient, router, transitionCoordinator };
}

function SpaceControlProbe() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>테스트 공간 전환</button>
      {open ? <div role="menu" aria-label="테스트 공간 메뉴" /> : null}
    </div>
  );
}

describe("AdminShellLayout", () => {
  beforeEach(() => {
    vi.mocked(logoutCurrentSession).mockReset();
    vi.mocked(fetchAdminOperationCases).mockReset();
    vi.mocked(fetchPlatformAdminHealthSnapshot).mockReset();
    vi.mocked(fetchPlatformAdminSummary).mockReset();
    vi.mocked(fetchPlatformAdminClubs).mockReset();
    vi.mocked(fetchPlatformAdminClubs).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    vi.mocked(previewPlatformAdminOnboarding).mockReset();
    vi.mocked(commitPlatformAdminOnboarding).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders ledger navigation and breadcrumb without a shell-owned command status", () => {
    const { container } = renderShell("/admin/today");
    expect(screen.queryByText("OWNER", { exact: true })).not.toBeInTheDocument();
    expect(container.querySelector(".admin-command-status")).toBeNull();
    expect(screen.queryByText("전체 신호 정상 · 8건 활성 · 19:00 기준")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "오늘 할 일" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "클럽 관리" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "서비스 상태" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "처리 기록" })).toBeInTheDocument();
    expect(screen.queryByText("서비스", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("검토")).not.toBeInTheDocument();
    expect(screen.queryByText("Command")).not.toBeInTheDocument();
    expect(screen.getByText("today content")).toBeInTheDocument();
    expect(screen.queryByText("조치 필요 클럽")).not.toBeInTheDocument();
    expect(screen.queryByText("공개 준비")).not.toBeInTheDocument();
    expect(screen.queryByText("도메인 조치")).not.toBeInTheDocument();
  });

  it("keeps the account and space controls in the header while exposing four mobile operating jobs", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("768px"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    renderShell("/admin/today");

    const mobileNav = screen.getByRole("navigation", { name: "Admin 모바일 메뉴" });
    expect(within(mobileNav).getAllByRole("link")).toHaveLength(4);
    expect(within(mobileNav).getByRole("link", { name: "오늘 할 일" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(mobileNav).getByRole("link", { name: "클럽 관리" })).toHaveAttribute(
      "href",
      "/admin/clubs",
    );
    expect(within(mobileNav).getByRole("link", { name: "서비스 상태" })).toHaveAttribute(
      "href",
      "/admin/health",
    );
    expect(within(mobileNav).getByRole("link", { name: "처리 기록" })).toHaveAttribute(
      "href",
      "/admin/audit",
    );
    expect(within(mobileNav).queryByRole("link", { name: "긴급 공개 회수" })).not.toBeInTheDocument();
    expect(within(mobileNav).queryByText("플랫폼 운영")).not.toBeInTheDocument();
    expect(within(mobileNav).queryByText("다른 계정으로 로그인")).not.toBeInTheDocument();
    expect(screen.getAllByText("OWNER admin", { selector: ".admin-shell__account-label" })).toHaveLength(1);
  });

  it("uses one pathname-owned current state for emergency even when onboarding is present", () => {
    renderShell("/admin/public-takedown?onboarding=1", {
      capabilities: {
        ...ownerCapabilities,
        capabilities: [
          ...ownerCapabilities.capabilities,
          "EMERGENCY_PUBLIC_TAKEDOWN",
        ],
      },
    });

    const nav = screen.getByRole("navigation", { name: "Admin 콘솔" });
    expect(within(nav).getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(within(nav).getByRole("link", { name: "긴급 공개 회수" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("link", { name: "클럽 관리" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps clubs onboarding under the real clubs route owner", async () => {
    renderShell("/admin/clubs?onboarding=1");
    expect(await screen.findByRole("heading", { name: "클럽" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Admin 콘솔" });
    expect(within(nav).getAllByRole("link", { current: "page" })).toHaveLength(1);
    expect(within(nav).getByRole("link", { name: "클럽 관리" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows a mono attention count beside 오늘 from the alarm summary", () => {
    renderShell("/admin/today", { operations });
    const today = within(screen.getByRole("navigation", { name: "Admin 콘솔" })).getByRole(
      "link",
      { name: "오늘 할 일" },
    );
    expect(today.querySelector(".admin-layout-nav__count")).toHaveTextContent("7");
    expect(today.querySelector(".admin-layout-nav__count")).toHaveClass("ledger-number");
  });

  it("still renders the shell when alarm summary queries reject", async () => {
    vi.mocked(fetchAdminOperationCases).mockRejectedValue(
      new Error("operations unavailable"),
    );
    vi.mocked(fetchPlatformAdminHealthSnapshot).mockRejectedValue(
      new Error("health unavailable"),
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      },
    });
    installPlatformAdminAuthorityLossHandler(queryClient);
    queryClient.setQueryData(
      platformAdminCapabilitiesQuery().queryKey,
      ownerCapabilities,
    );

    const router = createMemoryRouter(
      [
        {
          path: "/admin",
          element: (
            <AdminShellController
              auth={auth}
              onPlatformAuthorityLoss={() => undefined}
            />
          ),
          children: [{ path: "today", element: <div>today content</div> }],
        },
      ],
      { initialEntries: ["/admin/today"] },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(screen.getByText("today content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "오늘 할 일" })).toBeInTheDocument();
    expect(document.querySelector(".admin-command-status")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("신호 확인 불가");
    });
    expect(screen.getByRole("link", { name: "오늘 열기" })).toHaveAttribute(
      "href",
      "/admin/today",
    );
  });

  it("imports the scoped editorial ledger stylesheet from the shell layout", () => {
    const source = readFileSync(
      path.resolve("features/platform-admin/route/admin-shell-layout.tsx"),
      "utf8",
    );
    const controller = readFileSync(
      path.resolve("features/platform-admin/route/admin-shell-controller.tsx"),
      "utf8",
    );
    expect(source).toContain("admin-editorial-ledger.css");
    expect(source).not.toContain("AdminCommandStatus");
    expect(source).not.toContain("platformAdminSummaryQuery");
    expect(source).toContain("AdminAlarmBar");
    expect(source).not.toContain("useAdminAlarmSummary");
    expect(controller).toContain("useAdminAlarmSummary");
    expect(source).not.toContain("AdminWorkspaceSwitcher");
    expect(source).not.toContain("admin-workspace-switcher-model");
    expect(source).not.toContain("@/src/app");
  });

  it("keeps shell presentation free of query, mutation, and navigation ownership", () => {
    const shellPath = path.resolve(
      "features/platform-admin/route/admin-shell-layout.tsx",
    );
    const shellControllerPath = path.resolve(
      "features/platform-admin/route/admin-shell-controller.tsx",
    );
    const onboardingControllerPath = path.resolve(
      "features/platform-admin/route/admin-onboarding-controller.tsx",
    );
    expect(existsSync(shellControllerPath)).toBe(true);
    expect(existsSync(onboardingControllerPath)).toBe(true);

    const shell = readFileSync(shellPath, "utf8");
    const shellController = existsSync(shellControllerPath)
      ? readFileSync(shellControllerPath, "utf8")
      : "";
    const onboardingController = existsSync(onboardingControllerPath)
      ? readFileSync(onboardingControllerPath, "utf8")
      : "";
    expect(shell).not.toMatch(
      /\b(?:useQuery|useQueryClient|useLocation|useNavigate|useSearchParams|useBlocker|useTransitionSafetyOwner)\b/,
    );
    expect(shell).not.toContain("platform-admin-queries");
    expect(shell).not.toContain("queries/admin-alarm-summary");
    expect(shell).not.toContain("session-api");
    expect(shell).not.toContain("PlatformAdminOnboardingWizard");
    expect(shell).not.toContain("AdminOnboardingModal");

    expect(shellController).toContain("platformAdminCapabilitiesQuery");
    expect(shellController).toContain("subscribePlatformAdminAuthorityLoss");
    expect(shellController).toContain("useAdminAlarmSummary");
    expect(shellController).not.toContain("@/src/app");
    expect(onboardingController).toContain(
      "usePreviewPlatformAdminOnboardingMutation",
    );
    expect(onboardingController).toContain(
      "useCommitPlatformAdminOnboardingMutation",
    );
    expect(onboardingController).toContain("useTransitionSafetyOwner");
  });

  it("loads shell, page-pattern, editorial, and club-management CSS from feature ownership only", () => {
    const shellSource = readFileSync(
      path.resolve("features/platform-admin/route/admin-shell-layout.tsx"),
      "utf8",
    );
    const globals = readFileSync(path.resolve("src/styles/globals.css"), "utf8");
    const shellCssPath = path.resolve(
      "features/platform-admin/ui/admin-shell.css",
    );
    const pageCssPath = path.resolve(
      "features/platform-admin/ui/admin-page-patterns.css",
    );
    const editorialCssPath = path.resolve(
      "features/platform-admin/ui/admin-editorial-ledger.css",
    );
    const clubManagementCssPath = path.resolve(
      "features/platform-admin/ui/admin-club-management.css",
    );

    expect(existsSync(shellCssPath)).toBe(true);
    expect(existsSync(pageCssPath)).toBe(true);
    expect(existsSync(clubManagementCssPath)).toBe(true);
    expect(shellSource.indexOf("admin-shell.css")).toBeLessThan(
      shellSource.indexOf("admin-page-patterns.css"),
    );
    expect(shellSource.indexOf("admin-page-patterns.css")).toBeLessThan(
      shellSource.indexOf("admin-editorial-ledger.css"),
    );
    expect(shellSource.indexOf("admin-editorial-ledger.css")).toBeLessThan(
      shellSource.indexOf("admin-club-management.css"),
    );
    expect(globals).not.toMatch(/^\s*\.(?:admin|platform-admin)[-_\w]/m);

    const shellCss = existsSync(shellCssPath)
      ? readFileSync(shellCssPath, "utf8")
      : "";
    const pageCss = existsSync(pageCssPath)
      ? readFileSync(pageCssPath, "utf8")
      : "";
    const editorialCss = readFileSync(editorialCssPath, "utf8");
    const clubManagementCss = existsSync(clubManagementCssPath)
      ? readFileSync(clubManagementCssPath, "utf8")
      : "";
    expect(shellCss).toContain(".admin-shell");
    expect(shellCss).toContain(".admin-layout-nav");
    expect(shellCss).toContain("min-height: 86px");
    expect(shellCss).toContain("padding: 0 34px");
    expect(shellCss).toContain("grid-template-columns: 260px minmax(0, 1fr)");
    expect(shellCss).toContain("top: 86px");
    expect(shellCss).toContain("min-height: calc(100vh - 86px)");
    expect(shellCss).toContain("padding: 32px 16px");
    expect(shellCss).toMatch(/\.admin-shell__main\s*\{[^}]*width:\s*100%;[^}]*max-width:\s*none;/s);
    expect(pageCss).toContain(".admin-page-frame");
    expect(pageCss).toContain(".admin-state-panel");
    expect(editorialCss).not.toMatch(/^\s*\.admin-layout-nav(?:\W|$)/m);
    expect(clubManagementCss).toContain(".admin-club-management");
  });

  it("does not render a global header 새 클럽 CTA", () => {
    renderShell("/admin/today");
    expect(
      within(screen.getByRole("banner")).queryByRole("link", {
        name: "새 클럽",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps the operating wordmark without exposing a raw capability role badge", () => {
    renderShell("/admin/today");
    expect(screen.getByText("ReadMates")).toBeInTheDocument();
    expect(screen.queryByText("OWNER", { exact: true })).not.toBeInTheDocument();
  });

  it("shows the onboarding modal when ?onboarding=1 is present", () => {
    renderShell("/admin/clubs?onboarding=1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not mount clubs onboarding from a shell-owned non-clubs route", () => {
    renderShell("/admin/today?onboarding=1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not show the onboarding modal without the query param", () => {
    renderShell("/admin/today");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes onboarding without removing registry filters", async () => {
    const { router } = renderShell(
      "/admin/clubs?search=alpha&visibility=PRIVATE&onboarding=1",
    );
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(router.state.location.search).toContain("search=alpha");
    expect(router.state.location.search).toContain("visibility=PRIVATE");
    expect(router.state.location.search).not.toContain("onboarding");
  });

  it("exposes navigation and main landmarks with a skip link to main content", () => {
    const { container } = renderShell("/admin/today");
    expect(
      screen.getByRole("navigation", { name: "Admin 콘솔" }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("navigation")
        .map((nav) => nav.getAttribute("aria-label")),
    ).toEqual(["현재 위치", "Admin 콘솔"]);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "admin-main");
    expect(main).toHaveAttribute("tabindex", "-1");
    const skipLink = screen.getByRole("link", { name: "본문으로 건너뛰기" });
    expect(skipLink).toHaveAttribute("href", "#admin-main");
    fireEvent.click(skipLink);
    expect(main).toHaveFocus();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("renders the app-owned space control and keeps account identity and login outside it", () => {
    renderShell("/admin/today");

    expect(screen.getByRole("button", { name: "주입된 공간 전환" })).toBeInTheDocument();
    expect(screen.getByText("OWNER admin", { selector: ".admin-shell__account-label" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다른 계정으로 로그인" })).toBeInTheDocument();
  });

  it.each([
    {
      label: "email",
      shellAuth: { ...auth, accountName: null, displayName: null },
      expected: "owner@example.com",
    },
    { label: "anonymous fallback", shellAuth: null, expected: "현재 계정" },
  ])("keeps the $label account label outside the space control", ({ shellAuth, expected }) => {
    renderShell("/admin/today", {
      auth: shellAuth,
      spaceSwitcher: <div data-testid="space-control">플랫폼 운영</div>,
    });

    const spaceControl = screen.getByTestId("space-control");
    expect(screen.getByText(expected, { selector: ".admin-shell__account-label" })).toBeInTheDocument();
    expect(within(spaceControl).queryByText(expected)).not.toBeInTheDocument();
  });

  it("sends other-account login through logout and a safe admin return path", async () => {
    vi.mocked(logoutCurrentSession).mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });

    renderShell("/admin/clubs?filter=ready#top");
    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));

    await waitFor(() => {
      expect(logoutCurrentSession).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith(
        "/login?returnTo=%2Fadmin%2Fclubs%3Ffilter%3Dready%23top",
      );
    });
  });

  it("publishes no other-account navigation after the registered shell owner unmounts", async () => {
    const pending = deferred<Response>();
    vi.mocked(logoutCurrentSession).mockReturnValue(pending.promise);
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });
    const { unmount } = renderShell("/admin/today");

    const accountLogin = screen.getByRole("button", { name: "다른 계정으로 로그인" });
    fireEvent.click(accountLogin);
    expect(logoutCurrentSession).toHaveBeenCalledTimes(1);
    expect(accountLogin).toBeDisabled();
    fireEvent.click(accountLogin);
    expect(logoutCurrentSession).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      pending.resolve(new Response(null, { status: 204 }));
      await pending.promise;
      await Promise.resolve();
    });

    expect(assign).not.toHaveBeenCalled();
  });

  it("keeps the operator in place and reports a logout failure outside the space control", async () => {
    vi.mocked(logoutCurrentSession).mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    renderShell("/admin/today", {
      spaceSwitcher: <div data-testid="space-control">플랫폼 운영</div>,
    });

    fireEvent.click(screen.getByRole("button", { name: "다른 계정으로 로그인" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "로그아웃에 실패했습니다. 다시 시도해 주세요.",
    );
    expect(within(screen.getByTestId("space-control")).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("today content")).toBeInTheDocument();
  });

  it("hides create-club actions when the projection omits CREATE_CLUB even if summary role is OWNER", () => {
    renderShell("/admin/today?onboarding=1", {
      summary: { ...summary, platformRole: "OWNER" },
      capabilities: {
        schemaVersion: 1,
        role: "OWNER",
        status: "ACTIVE",
        capabilities: supportViewCapabilities,
        generatedAt: "2026-08-22T00:00:00Z",
      },
    });

    expect(
      within(screen.getByRole("banner")).queryByRole("link", {
        name: "새 클럽",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("OWNER", { exact: true })).not.toBeInTheDocument();
  });

  it("keeps onboarding reachable from the query param when CREATE_CLUB is present", () => {
    renderShell("/admin/clubs?onboarding=1", {
      summary: { ...summary, platformRole: "SUPPORT" },
      capabilities: {
        schemaVersion: 1,
        role: "SUPPORT",
        status: "ACTIVE",
        capabilities: [...supportViewCapabilities, "CREATE_CLUB"],
        generatedAt: "2026-08-22T00:00:00Z",
      },
    });

    expect(screen.getByRole("link", { name: "새 클럽" })).toHaveAttribute(
      "href",
      "/admin/clubs?onboarding=1",
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("SUPPORT", { exact: true })).not.toBeInTheDocument();
  });

  it("renders empty navigation when the capability list is empty", () => {
    renderShell("/admin/today", {
      capabilities: {
        schemaVersion: 1,
        role: "SUPPORT",
        status: "ACTIVE",
        capabilities: [],
        generatedAt: "2026-08-22T00:00:00Z",
      },
    });

    const nav = screen.getByRole("navigation", { name: "Admin 콘솔" });
    expect(within(nav).queryAllByRole("link")).toEqual([]);
    expect(within(nav).queryByText("오늘")).not.toBeInTheDocument();
    expect(within(nav).queryByText("접근 원장")).not.toBeInTheDocument();
  });

  it("purges platform-admin state and closes onboarding and workspace menus on 401", async () => {
    const { queryClient } = renderShell("/admin/clubs?onboarding=1", {
      spaceSwitcher: <SpaceControlProbe />,
    });
    fireEvent.click(screen.getByRole("button", { name: "테스트 공간 전환" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("menu", { name: "테스트 공간 메뉴" }),
    ).toBeInTheDocument();

    await waitFor(async () => {
      await queryClient
        .fetchQuery({
          queryKey: [...platformAdminKeys.all, "probe"],
          queryFn: async () => {
            throw new ReadMatesSessionExpiredError();
          },
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("menu", { name: "테스트 공간 메뉴" }),
      ).not.toBeInTheDocument();
    });
    expect(
      queryClient.getQueryData(platformAdminKeys.summary()),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(platformAdminKeys.capabilities()),
    ).toBeUndefined();
    expect(queryClient.getQueryData(memberQueryKey)).toEqual(memberSnapshot);

    queryClient.setQueryData(
      platformAdminCapabilitiesQuery().queryKey,
      ownerCapabilities,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("purges platform-admin state and closes onboarding and workspace menus on 403", async () => {
    const { queryClient } = renderShell("/admin/clubs?onboarding=1", {
      spaceSwitcher: <SpaceControlProbe />,
    });
    fireEvent.click(screen.getByRole("button", { name: "테스트 공간 전환" }));
    const error = await forbiddenError();

    await waitFor(async () => {
      await queryClient
        .fetchQuery({
          queryKey: [...platformAdminKeys.all, "probe"],
          queryFn: async () => {
            throw error;
          },
        })
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("menu", { name: "테스트 공간 메뉴" }),
      ).not.toBeInTheDocument();
    });
    const nav = screen.getByRole("navigation", { name: "Admin 콘솔" });
    expect(within(nav).queryAllByRole("link")).toEqual([]);
    expect(within(nav).queryByText("접근 원장")).not.toBeInTheDocument();
    expect(queryClient.getQueryData(platformAdminKeys.clubs())).toBeUndefined();
    expect(queryClient.getQueryData(memberQueryKey)).toEqual(memberSnapshot);
  });

  it("blocks SPA back navigation while onboarding is dirty and preserves the draft on cancel", async () => {
    const confirm = vi
      .spyOn(window, "confirm")
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { router } = renderShell("/admin/clubs?onboarding=1", {
      initialEntries: ["/admin/clubs", "/admin/clubs?onboarding=1"],
      initialIndex: 1,
    });
    const name = screen.getByRole("textbox", { name: "클럽 이름" });
    fireEvent.change(name, { target: { value: "Draft Club" } });
    name.focus();

    await act(() => router.navigate(-1));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(router.state.location.search).toBe("?onboarding=1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(name).toHaveValue("Draft Club");
    expect(name).toHaveFocus();

    await act(() => router.navigate(-1));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(2));
    expect(router.state.location.search).toBe("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it("hard-blocks in-app close and SPA back while onboarding commit outcome is pending", async () => {
    let resolveCommit:
      | ((
          value: Awaited<ReturnType<typeof commitPlatformAdminOnboarding>>,
        ) => void)
      | undefined;
    vi.mocked(previewPlatformAdminOnboarding).mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-08-24T01:00:00Z",
      clubSlug: "pending-club",
      firstHostKind: "NEW_USER",
      requiredConfirmation: null,
      impactCodes: ["CLUB_CREATED"],
      prerequisiteCodes: [],
      requestFingerprintPrefix: "abcd1234",
    });
    vi.mocked(commitPlatformAdminOnboarding).mockReturnValue(
      new Promise((resolve) => {
        resolveCommit = resolve;
      }),
    );
    const confirm = vi.spyOn(window, "confirm");
    const { router } = renderShell("/admin/clubs?onboarding=1", {
      initialEntries: ["/admin/clubs", "/admin/clubs?onboarding=1"],
      initialIndex: 1,
    });
    for (const [name, value] of [
      ["클럽 이름", "Pending Club"],
      ["Slug", "pending-club"],
      ["Tagline", "함께 읽는 모임"],
      ["About", "공개 소개"],
      ["첫 호스트 이메일", "fixture@example.test"],
      ["첫 호스트 이름", "Fixture Host"],
    ] as const) {
      fireEvent.change(screen.getByRole("textbox", { name }), {
        target: { value },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    await screen.findByText("CLUB_CREATED");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /닫기/ })).toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: /닫기/ }));
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(confirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("admin-modal-dialog-backdrop"));
    expect(confirm).not.toHaveBeenCalled();
    await act(() => router.navigate(-1));
    expect(router.state.location.search).toBe("?onboarding=1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();

    resolveCommit?.({
      receiptId: "receipt-pending",
      club: {
        clubId: "club-pending",
        slug: "pending-club",
        name: "Pending Club",
        tagline: "함께 읽는 모임",
        about: "공개 소개",
        status: "ACTIVE",
        publicVisibility: "PRIVATE",
        domainCount: 0,
        domainActionRequiredCount: 0,
        notificationFailureCount: 0,
        aiFailureCount: 0,
        firstHostOnboardingState: "INVITED",
        adminRevision: 1,
      },
      originStatus: "SUCCEEDED",
      firstHostKind: "INVITATION_CREATED",
      invitationDelivery: "PENDING",
    });
    expect(await screen.findByText(/receipt-pending/)).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("runs onboarding through mutation hooks and invalidates active registry state", async () => {
    vi.mocked(previewPlatformAdminOnboarding).mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-08-24T01:00:00Z",
      clubSlug: "new-club",
      firstHostKind: "NEW_USER",
      requiredConfirmation: null,
      impactCodes: ["CLUB_CREATED"],
      prerequisiteCodes: [],
      requestFingerprintPrefix: "abcd1234",
    });
    vi.mocked(commitPlatformAdminOnboarding).mockResolvedValue({
      receiptId: "receipt-1",
      club: {
        clubId: "club-new",
        slug: "new-club",
        name: "New Club",
        tagline: "",
        about: "",
        status: "ACTIVE",
        publicVisibility: "PRIVATE",
        domainCount: 0,
        domainActionRequiredCount: 0,
        notificationFailureCount: 0,
        aiFailureCount: 0,
        firstHostOnboardingState: "INVITED",
        adminRevision: 1,
      },
      originStatus: "SUCCEEDED",
      firstHostKind: "INVITATION_CREATED",
      invitationDelivery: "PENDING",
    });
    const { queryClient } = renderShell("/admin/clubs?onboarding=1");
    const filteredKey = platformAdminClubsQuery().queryKey;
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    for (const [name, value] of [
      ["클럽 이름", "New Club"],
      ["Slug", "new-club"],
      ["Tagline", "함께 읽는 모임"],
      ["About", "공개 소개"],
      ["첫 호스트 이메일", "fixture@example.test"],
      ["첫 호스트 이름", "Fixture Host"],
    ] as const) {
      fireEvent.change(screen.getByRole("textbox", { name }), {
        target: { value },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    await screen.findByText("CLUB_CREATED");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    await screen.findByText(/receipt-1/);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: platformAdminKeys.clubsRoot(),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: platformAdminKeys.summary(),
    });
    expect(queryClient.getQueryState(filteredKey)).toBeDefined();
  });

  it("closes onboarding and purges the draft when CREATE_CLUB is lost", async () => {
    const { queryClient } = renderShell("/admin/clubs?search=alpha&onboarding=1");
    fireEvent.change(screen.getByRole("textbox", { name: "클럽 이름" }), {
      target: { value: "Draft Club" },
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: supportViewCapabilities,
      generatedAt: "2026-08-22T00:00:00Z",
    });

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );

    queryClient.setQueryData(
      platformAdminCapabilitiesQuery().queryKey,
      ownerCapabilities,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("sends the created club through a validated clubs return path", async () => {
    vi.mocked(previewPlatformAdminOnboarding).mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-08-24T01:00:00Z",
      clubSlug: "new-club",
      firstHostKind: "NEW_USER",
      requiredConfirmation: null,
      impactCodes: ["CLUB_CREATED"],
      prerequisiteCodes: [],
      requestFingerprintPrefix: "abcd1234",
    });
    vi.mocked(commitPlatformAdminOnboarding).mockResolvedValue({
      receiptId: "receipt-1",
      club: {
        clubId: "club-new",
        slug: "new-club",
        name: "New Club",
        tagline: "",
        about: "",
        status: "ACTIVE",
        publicVisibility: "PRIVATE",
        domainCount: 0,
        domainActionRequiredCount: 0,
        notificationFailureCount: 0,
        aiFailureCount: 0,
        firstHostOnboardingState: "INVITED",
        adminRevision: 1,
      },
      originStatus: "SUCCEEDED",
      firstHostKind: "INVITATION_CREATED",
      invitationDelivery: "PENDING",
    });
    const { router } = renderShell(
      "/admin/clubs?search=alpha&visibility=PRIVATE&onboarding=1",
    );
    for (const [name, value] of [
      ["클럽 이름", "New Club"],
      ["Slug", "new-club"],
      ["Tagline", "함께 읽는 모임"],
      ["About", "공개 소개"],
      ["첫 호스트 이메일", "fixture@example.test"],
      ["첫 호스트 이름", "Fixture Host"],
    ] as const) {
      fireEvent.change(screen.getByRole("textbox", { name }), {
        target: { value },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
    await screen.findByText("CLUB_CREATED");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
    await screen.findByText(/receipt-1/);
    fireEvent.click(
      screen.getByRole("button", { name: "생성된 클럽 상세로 이동" }),
    );
    expect(router.state.location.pathname).toBe("/admin/clubs/club-new");
    expect(router.state.location.search).toContain(
      "returnTo=%2Fadmin%2Fclubs%3Fsearch%3Dalpha",
    );
    expect(router.state.location.search).toContain("visibility%3DPRIVATE");
    expect(router.state.location.search).not.toContain("onboarding");
    expect(router.state.location.search).toContain("focusId=club-new");
  });

  it.each(["preview", "commit"] as const)(
    "purges admin state when onboarding %s loses authority",
    async (phase) => {
      const forbidden = await forbiddenError();
      vi.mocked(previewPlatformAdminOnboarding).mockImplementation(async () => {
        if (phase === "preview") throw forbidden;
        return {
          previewId: "preview-1",
          expiresAt: "2026-08-24T01:00:00Z",
          clubSlug: "new-club",
          firstHostKind: "NEW_USER",
          requiredConfirmation: null,
          impactCodes: ["CLUB_CREATED"],
          prerequisiteCodes: [],
          requestFingerprintPrefix: "abcd1234",
        };
      });
      vi.mocked(commitPlatformAdminOnboarding).mockRejectedValue(forbidden);
      const { queryClient } = renderShell("/admin/clubs?onboarding=1");
      fireEvent.change(screen.getByRole("textbox", { name: "클럽 이름" }), {
        target: { value: "Draft" },
      });
      fireEvent.change(screen.getByRole("textbox", { name: "Slug" }), {
        target: { value: "draft" },
      });
      fireEvent.change(screen.getByRole("textbox", { name: "Tagline" }), {
        target: { value: "함께 읽는 모임" },
      });
      fireEvent.change(screen.getByRole("textbox", { name: "About" }), {
        target: { value: "공개 소개" },
      });
      fireEvent.change(
        screen.getByRole("textbox", { name: "첫 호스트 이메일" }),
        { target: { value: "fixture@example.test" } },
      );
      fireEvent.change(
        screen.getByRole("textbox", { name: "첫 호스트 이름" }),
        { target: { value: "Host" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "미리 확인" }));
      if (phase === "commit") {
        await screen.findByText("CLUB_CREATED");
        fireEvent.click(
          screen.getByRole("checkbox", { name: "온보딩 영향을 확인했습니다" }),
        );
        fireEvent.click(screen.getByRole("button", { name: "클럽 생성 확정" }));
      }
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(
        queryClient.getQueryData(platformAdminKeys.capabilities()),
      ).toBeUndefined();
    },
  );
});
