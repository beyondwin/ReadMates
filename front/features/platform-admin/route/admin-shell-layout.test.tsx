import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("@/shared/auth/session-api", () => ({
  logoutCurrentSession: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-operations-api", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/features/platform-admin/api/platform-admin-operations-api")
  >()),
  fetchAdminOperationCases: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-capabilities-api", () => ({
  fetchPlatformAdminCapabilities: vi.fn(),
}));

import { logoutCurrentSession } from "@/shared/auth/session-api";
import { fetchAdminOperationCases } from "@/features/platform-admin/api/platform-admin-operations-api";
import { AdminShellLayout } from "./admin-shell-layout";

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

function renderShell(
  initialEntry: string,
  opts: {
    auth?: typeof auth | null;
    operations?: AdminOperationCasesResponse;
    summary?: PlatformAdminSummaryResponse;
    capabilities?: PlatformAdminCapabilities;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  });
  installPlatformAdminAuthorityLossHandler(queryClient);
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, opts.summary ?? summary);
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, clubs);
  queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, opts.capabilities ?? ownerCapabilities);
  queryClient.setQueryData(
    platformAdminOperationCasesQuery().queryKey,
    opts.operations ?? operations,
  );
  queryClient.setQueryData(memberQueryKey, memberSnapshot);
  const view = render(
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
  return { ...view, queryClient };
}

describe("AdminShellLayout", () => {
  beforeEach(() => {
    vi.mocked(logoutCurrentSession).mockReset();
    vi.mocked(fetchAdminOperationCases).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the command status, ledger navigation, and breadcrumb", () => {
    const { container } = renderShell("/admin/today");
    expect(screen.getAllByText("OWNER").length).toBeGreaterThan(0);
    expect(container.querySelector(".admin-command-status")).toHaveTextContent(
      "전체 신호 정상 · 8건 활성 · 19:00 기준",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "오늘" })).toBeInTheDocument();
    expect(screen.getByText("서비스")).toBeInTheDocument();
    expect(screen.getByText("검토")).toBeInTheDocument();
    expect(screen.queryByText("Command")).not.toBeInTheDocument();
    expect(screen.getByText("today content")).toBeInTheDocument();
    expect(screen.queryByText("조치 필요 클럽")).not.toBeInTheDocument();
    expect(screen.queryByText("공개 준비")).not.toBeInTheDocument();
    expect(screen.queryByText("도메인 조치")).not.toBeInTheDocument();
  });

  it("preserves the shell and route content when an operations summary is unavailable", async () => {
    vi.mocked(fetchAdminOperationCases).mockRejectedValue(new Error("operations unavailable"));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
    });
    installPlatformAdminAuthorityLossHandler(queryClient);
    queryClient.setQueryData(platformAdminSummaryQuery().queryKey, summary);
    queryClient.setQueryData(platformAdminClubsQuery().queryKey, clubs);
    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, ownerCapabilities);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/today"]}>
          <Routes>
            <Route path="/admin/*" element={<AdminShellLayout auth={auth} />}>
              <Route path="today" element={<div>today content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("today content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "오늘" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "운영 신호 확인 불가 · 잠시 후 다시 확인",
      );
    });
  });

  it("does not render a global header 새 클럽 CTA", () => {
    renderShell("/admin/today");
    expect(within(screen.getByRole("banner")).queryByRole("link", { name: "새 클럽" })).not.toBeInTheDocument();
  });

  it("keeps the operating wordmark and role badge", () => {
    renderShell("/admin/today");
    expect(screen.getByText("ReadMates · 운영")).toBeInTheDocument();
    expect(screen.getByText("OWNER", { selector: ".admin-shell__role-badge" })).toBeInTheDocument();
  });

  it("shows the onboarding modal when ?onboarding=1 is present", () => {
    renderShell("/admin/today?onboarding=1");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not show the onboarding modal without the query param", () => {
    renderShell("/admin/today");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("exposes navigation and main landmarks with a skip link to main content", () => {
    const { container } = renderShell("/admin/today");
    expect(screen.getByRole("navigation", { name: "Admin 콘솔" })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation").map((nav) => nav.getAttribute("aria-label"))).toEqual([
      "현재 위치",
      "Admin 콘솔",
    ]);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "admin-main");
    expect(main).toHaveAttribute("tabindex", "-1");
    const skipLink = screen.getByRole("link", { name: "본문으로 건너뛰기" });
    expect(skipLink).toHaveAttribute("href", "#admin-main");
    fireEvent.click(skipLink);
    expect(main).toHaveFocus();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("replaces the member-space link with current-account workspace destinations", () => {
    renderShell("/admin/today");

    expect(screen.queryByRole("link", { name: /멤버 공간/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));

    expect(screen.getByRole("menuitem", { name: "읽는사이 호스트 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app/host",
    );
    expect(screen.getByRole("menuitem", { name: "읽는사이 멤버 공간" })).toHaveAttribute(
      "href",
      "/clubs/reading-sai/app",
    );
  });

  it("sends other-account login through logout and a safe admin return path", async () => {
    vi.mocked(logoutCurrentSession).mockResolvedValue(new Response(null, { status: 204 }));
    const assign = vi.fn();
    vi.stubGlobal("location", { assign });

    renderShell("/admin/clubs?filter=ready#top");
    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "다른 계정으로 로그인" }));

    await waitFor(() => {
      expect(logoutCurrentSession).toHaveBeenCalledTimes(1);
      expect(assign).toHaveBeenCalledWith("/login?returnTo=%2Fadmin%2Fclubs%3Ffilter%3Dready%23top");
    });
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

    expect(within(screen.getByRole("banner")).queryByRole("link", { name: "새 클럽" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("OWNER", { selector: ".admin-shell__role-badge" })).toBeInTheDocument();
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

    expect(screen.queryByRole("link", { name: "새 클럽" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("SUPPORT", { selector: ".admin-shell__role-badge" })).toBeInTheDocument();
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
    expect(within(nav).queryByText("지원")).not.toBeInTheDocument();
  });

  it("purges platform-admin state and closes onboarding and workspace menus on 401", async () => {
    const { queryClient } = renderShell("/admin/today?onboarding=1");
    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "내 ReadMates 공간" })).toBeInTheDocument();

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
      expect(screen.queryByRole("menu", { name: "내 ReadMates 공간" })).not.toBeInTheDocument();
    });
    expect(queryClient.getQueryData(platformAdminKeys.summary())).toBeUndefined();
    expect(queryClient.getQueryData(platformAdminKeys.capabilities())).toBeUndefined();
    expect(queryClient.getQueryData(memberQueryKey)).toEqual(memberSnapshot);

    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, ownerCapabilities);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("purges platform-admin state and closes onboarding and workspace menus on 403", async () => {
    const { queryClient } = renderShell("/admin/today?onboarding=1");
    fireEvent.click(screen.getByRole("button", { name: "내 공간" }));
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
      expect(screen.queryByRole("menu", { name: "내 ReadMates 공간" })).not.toBeInTheDocument();
    });
    const nav = screen.getByRole("navigation", { name: "Admin 콘솔" });
    expect(within(nav).queryAllByRole("link")).toEqual([]);
    expect(within(nav).queryByText("지원")).not.toBeInTheDocument();
    expect(queryClient.getQueryData(platformAdminKeys.clubs())).toBeUndefined();
    expect(queryClient.getQueryData(memberQueryKey)).toEqual(memberSnapshot);
  });
});
