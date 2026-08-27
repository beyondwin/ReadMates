import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformAdminClubDetail } from "@/features/platform-admin/api/platform-admin-contracts";
import { apiErrorFromResponse } from "@/shared/api/errors";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  platformAdminClubDetailQuery,
  platformAdminKeys,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { platformAdminSupportLedgerInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-support-queries";
import { platformAdminClubOperationsQuery } from "@/features/platform-admin/queries/platform-admin-club-operations-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminBreadcrumbProvider } from "./admin-breadcrumb-context";
import { AdminClubDetailRoute } from "./admin-club-detail-route";

vi.mock(
  "@/features/platform-admin/api/platform-admin-api",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@/features/platform-admin/api/platform-admin-api")
    >()),
    fetchPlatformAdminClub: vi.fn(),
    updatePlatformAdminClubMetadata: vi.fn(),
    previewPlatformAdminClubVisibility: vi.fn(),
    confirmPlatformAdminClubVisibility: vi.fn(),
    previewPlatformAdminDomain: vi.fn(),
    confirmPlatformAdminDomain: vi.fn(),
    checkPlatformAdminDomainProvisioning: vi.fn(),
  }),
);

vi.mock("@/features/platform-admin/api/platform-admin-support-api", () => ({
  fetchAdminSupportGrantLedger: vi.fn(),
}));

vi.mock("@/features/platform-admin/api/platform-admin-audit-api", () => ({
  fetchAdminAuditLedger: vi.fn(),
  searchAdminAuditLedger: vi.fn(),
}));

import {
  checkPlatformAdminDomainProvisioning,
  confirmPlatformAdminClubVisibility,
  fetchPlatformAdminClub,
  previewPlatformAdminClubVisibility,
  previewPlatformAdminDomain,
  updatePlatformAdminClubMetadata,
} from "@/features/platform-admin/api/platform-admin-api";
import { fetchAdminSupportGrantLedger } from "@/features/platform-admin/api/platform-admin-support-api";
import { fetchAdminAuditLedger } from "@/features/platform-admin/api/platform-admin-audit-api";
import { platformAdminAuditLedgerInfiniteQuery } from "@/features/platform-admin/queries/platform-admin-audit-queries";

const detail: PlatformAdminClubDetail = {
  clubId: "c-1",
  slug: "alpha",
  name: "Alpha",
  tagline: "읽고 나누기",
  about: "소개",
  status: "ACTIVE",
  publicVisibility: "PRIVATE",
  domainCount: 1,
  domainActionRequiredCount: 1,
  notificationFailureCount: 0,
  aiFailureCount: 0,
  firstHostOnboardingState: "ASSIGNED",
  adminRevision: 7,
  domains: [
    {
      id: "domain-1",
      clubId: "c-1",
      hostname: "alpha.example.test",
      kind: "CUSTOM_DOMAIN",
      status: "ACTION_REQUIRED",
      desiredState: "ENABLED",
      manualAction: "CLOUDFLARE_PAGES_CUSTOM_DOMAIN",
      errorCode: null,
      isPrimary: true,
      verifiedAt: null,
      lastCheckedAt: null,
    },
  ],
};

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

function renderRoute(
  club: PlatformAdminClubDetail | null = detail,
  capabilities = ["VIEW_CLUBS", "MANAGE_CLUBS", "MANAGE_CLUB_DOMAINS"],
  seedSupportGrants = true,
  initialEntry = "/admin/clubs/c-1",
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  installPlatformAdminAuthorityLossHandler(queryClient);
  if (club)
    queryClient.setQueryData(
      platformAdminClubDetailQuery("c-1").queryKey,
      club,
    );
  queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
    schemaVersion: 1,
    role: "OWNER",
    status: "ACTIVE",
    capabilities,
    generatedAt: "2026-08-24T00:00:00Z",
  });
  if (seedSupportGrants) {
    queryClient.setQueryData(
      platformAdminSupportLedgerInfiniteQuery({ clubId: "c-1", status: "ACTIVE" }).queryKey,
      { pages: [{ items: [], nextCursor: null }], pageParams: [undefined] },
    );
  }
  queryClient.setQueryData(
    platformAdminAuditLedgerInfiniteQuery({ clubId: "c-1" }).queryKey,
    {
      pages: [{
        generatedAt: "2026-08-24T00:00:00Z",
        filters: {},
        summary: {
          visibleCount: 0,
          sourceUnavailableCount: 0,
          metadataUnavailableCount: 0,
          unavailableSources: [],
        },
        items: [],
        nextCursor: null,
      }],
      pageParams: [undefined],
    },
  );
  queryClient.setQueryData(platformAdminClubOperationsQuery("c-1").queryKey, {
    schema: "admin.club_operations_snapshot.v1",
    generatedAt: "2026-08-24T00:00:00Z",
    club: {
      clubId: "c-1",
      slug: "alpha",
      name: "Alpha",
      status: "ACTIVE",
      publicVisibility: "PRIVATE",
    },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    memberActivity: {
      activeCount: 1,
      dormantCount: 0,
      pendingViewerCount: 0,
      hostCount: 1,
    },
    sessionProgress: {
      upcomingCount: 0,
      currentOpenCount: 0,
      closedCount: 0,
      publishedRecordCount: 0,
      incompleteRecordCount: 0,
    },
    notificationHealth: {
      pending: 0,
      failed: 0,
      dead: 0,
      lastSuccessAt: null,
      failureClusters: [],
      recentFailed7d: 0,
      priorFailed7d: 0,
    },
    aiUsage: {
      activeJobs: 0,
      failedRecentJobs: 0,
      staleCandidates: 0,
      costEstimateUsd: "0.0000",
      state: "NO_RECENT_USAGE",
      priorFailedJobs7d: 0,
    },
    safeLinks: [],
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AdminBreadcrumbProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route
              path="/admin/clubs/:clubId"
              element={<AdminClubDetailRoute />}
            />
            <Route path="/admin/clubs" element={<div>clubs list</div>} />
          </Routes>
        </MemoryRouter>
      </AdminBreadcrumbProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchPlatformAdminClub).mockResolvedValue(detail);
  vi.mocked(fetchAdminSupportGrantLedger).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(fetchAdminAuditLedger).mockResolvedValue({
    generatedAt: "2026-08-24T00:00:00Z",
    filters: {},
    summary: {
      visibleCount: 0,
      sourceUnavailableCount: 0,
      metadataUnavailableCount: 0,
      unavailableSources: [],
    },
    items: [],
    nextCursor: null,
  });
});

describe("AdminClubDetailRoute", () => {
  it("renders authoritative detail with a read-only slug and independent domain panel", () => {
    const { container } = renderRoute();
    expect(screen.getByText("운영 · 클럽 상세")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByText("revision 7 · 활성 · 비공개")).toBeInTheDocument();
    expect(screen.getByText("현재 비공개")).toBeInTheDocument();
    expect(screen.getByText("식별")).toBeInTheDocument();
    expect(screen.getByText("공개 설정")).toBeInTheDocument();
    expect(screen.getByText("도메인 준비")).toBeInTheDocument();
    expect(screen.queryByText("Identity")).toBeNull();
    expect(screen.queryByText("Visibility")).toBeNull();
    expect(screen.queryByText("Domain provisioning")).toBeNull();
    expect(screen.queryByText(/\bACTIVE\b/)).toBeNull();
    expect(screen.queryByText(/\bPRIVATE\b/)).toBeNull();
    expect(screen.getByText("alpha.example.test")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Slug" })).not.toBeInTheDocument();
    expect(container.querySelector(".admin-club-detail__facts")).toHaveTextContent("alpha");
    expect(screen.getByRole("button", { name: "편집" })).toBeInTheDocument();
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("sends revision-guarded metadata and refreshes the authoritative detail", async () => {
    vi.mocked(updatePlatformAdminClubMetadata).mockResolvedValue({
      ...detail,
      name: "Alpha Books",
      adminRevision: 8,
    });
    renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    fireEvent.change(screen.getByRole("textbox", { name: "클럽 이름" }), {
      target: { value: "Alpha Books" },
    });
    fireEvent.click(screen.getByRole("button", { name: "공개 정보 저장" }));
    await waitFor(() =>
      expect(updatePlatformAdminClubMetadata).toHaveBeenCalledWith(
        "c-1",
        expect.objectContaining({
          expectedAdminRevision: 7,
          name: "Alpha Books",
        }),
      ),
    );
  });

  it("locks metadata fields while a revision-guarded save is pending", async () => {
    let resolveSave: ((value: PlatformAdminClubDetail) => void) | undefined;
    vi.mocked(updatePlatformAdminClubMetadata).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    fireEvent.change(screen.getByRole("textbox", { name: "클럽 이름" }), {
      target: { value: "Alpha Books" },
    });
    fireEvent.click(screen.getByRole("button", { name: "공개 정보 저장" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "클럽 이름" })).toBeDisabled(),
    );
    expect(screen.getByRole("textbox", { name: "Tagline" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "About" })).toBeDisabled();
    resolveSave?.({ ...detail, name: "Alpha Books", adminRevision: 8 });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "편집" })).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("textbox", { name: "클럽 이름" }),
    ).not.toBeInTheDocument();
  });

  it("hides the support grant metric without VIEW_SUPPORT", () => {
    renderRoute(detail, ["VIEW_CLUBS", "VIEW_CLUB_OPERATIONS"]);
    expect(screen.getByText("Alpha 운영 스냅샷")).toBeInTheDocument();
    expect(screen.queryByText("접근 발급")).not.toBeInTheDocument();
  });

  it("shows support grant unavailability and retries a permitted failed query", async () => {
    vi.mocked(fetchAdminSupportGrantLedger)
      .mockRejectedValueOnce(new Error("safe failure"))
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    renderRoute(
      detail,
      ["VIEW_CLUBS", "VIEW_CLUB_OPERATIONS", "VIEW_SUPPORT"],
      false,
    );
    await waitFor(() =>
      expect(screen.getByText("접근 발급 확인 불가")).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "접근 발급 다시 시도" }),
    );
    await waitFor(() =>
      expect(fetchAdminSupportGrantLedger).toHaveBeenCalledTimes(2),
    );
  });

  it("removes the private support ledger cache when the detail route unmounts", () => {
    const { queryClient, unmount } = renderRoute(
      detail,
      ["VIEW_CLUBS", "VIEW_CLUB_OPERATIONS", "VIEW_SUPPORT"],
    );
    const queryKey = platformAdminSupportLedgerInfiniteQuery({
      clubId: "c-1",
      status: "ACTIVE",
    }).queryKey;
    expect(queryClient.getQueryData(queryKey)).toBeDefined();

    unmount();

    expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  });

  it("renders L2 dock primitives for visibility and domain commands", () => {
    const { container } = renderRoute();
    const docks = container.querySelectorAll(".admin-safe-action-dock[data-level='L2']");
    expect(docks.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole("button", { name: "공개 전환 미리보기" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "도메인 추가 미리보기" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".admin-receipt-timeline")).toBeNull();
  });

  it("renders the club recent-ledger link onto the shared audit prefilter", () => {
    renderRoute();
    expect(
      screen.getByRole("heading", { name: "이 클럽의 최근 기입" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "전체 기입 보기" })).toHaveAttribute(
      "href",
      "/admin/audit?target=c-1",
    );
  });

  it("requires preview review and explicit confirmation before a visibility command", async () => {
    vi.mocked(previewPlatformAdminClubVisibility).mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-08-24T01:00:00Z",
      currentVisibility: "PRIVATE",
      targetVisibility: "PUBLIC",
      impactCodes: ["PUBLIC_DISCOVERY_ENABLED"],
      requestFingerprintPrefix: "abcd1234",
    });
    vi.mocked(confirmPlatformAdminClubVisibility).mockResolvedValue({
      receiptId: "receipt-1",
      commandType: "club.visibility.change",
      clubId: "c-1",
      beforeAdminRevision: 7,
      afterAdminRevision: 8,
      outcome: "SUCCEEDED",
      resultCode: "VISIBILITY_CHANGED",
      targetId: null,
      convergenceId: null,
      convergenceState: null,
    });
    renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "공개 전환 미리보기" }));
    expect(
      await screen.findByText("PUBLIC_DISCOVERY_ENABLED"),
    ).toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "공개 전환 확정" });
    expect(confirm).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: "영향을 확인했습니다" }),
    );
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(confirmPlatformAdminClubVisibility).toHaveBeenCalledOnce(),
    );
    expect(await screen.findByText(/receipt-1/)).toBeInTheDocument();
    expect(screen.getByText("영수증 — 명령 접수")).toBeInTheDocument();
    expect(document.querySelector(".admin-receipt-timeline")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "공개 전환 확정" }),
    ).toBeDisabled();
  });

  it("hides mutation actions without the exact capabilities", () => {
    renderRoute(detail, ["VIEW_CLUBS"]);
    expect(
      screen.queryByRole("button", { name: "편집" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "공개 정보 저장" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "도메인 추가 미리보기" }),
    ).not.toBeInTheDocument();
  });

  it("returns through the validated list URL and falls back for unsafe returnTo", () => {
    const valid = renderRoute(
      detail,
      ["VIEW_CLUBS", "MANAGE_CLUBS", "MANAGE_CLUB_DOMAINS"],
      true,
      "/admin/clubs/c-1?returnTo=%2Fadmin%2Fclubs%3Fsearch%3Dalpha%26lifecycle%3DACTIVE&focusId=c-1&scrollTop=240",
    );
    expect(screen.getByRole("link", { name: "← 클럽 목록" })).toHaveAttribute(
      "href",
      "/admin/clubs?search=alpha&lifecycle=ACTIVE",
    );
    valid.unmount();

    const external = renderRoute(
      detail,
      ["VIEW_CLUBS"],
      true,
      "/admin/clubs/c-1?returnTo=https://external.example/admin/clubs&focusId=c-1&scrollTop=12",
    );
    expect(screen.getByRole("link", { name: "← 클럽 목록" })).toHaveAttribute(
      "href",
      "/admin/clubs",
    );
    external.unmount();

    renderRoute(
      detail,
      ["VIEW_CLUBS"],
      true,
      "/admin/clubs/c-1?returnTo=%2Fadmin%2Ftoday&focusId=c-1",
    );
    expect(screen.getByRole("link", { name: "← 클럽 목록" })).toHaveAttribute(
      "href",
      "/admin/clubs",
    );
  });

  it("gates MANAGE_CLUBS and MANAGE_CLUB_DOMAINS independently of role names", () => {
    const domainsOnly = renderRoute(detail, ["VIEW_CLUBS", "MANAGE_CLUB_DOMAINS"]);
    expect(
      screen.queryByRole("button", { name: "공개 정보 저장" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "공개 전환 미리보기" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "도메인 추가 미리보기" }),
    ).toBeInTheDocument();
    domainsOnly.unmount();

    renderRoute(detail, ["VIEW_CLUBS", "MANAGE_CLUBS"]);
    expect(
      screen.getByRole("button", { name: "편집" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "도메인 추가 미리보기" }),
    ).not.toBeInTheDocument();
  });

  it("purges metadata draft, visibility preview, confirmation, and receipt when MANAGE_CLUBS is lost", async () => {
    vi.mocked(previewPlatformAdminClubVisibility).mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-08-24T01:00:00Z",
      currentVisibility: "PRIVATE",
      targetVisibility: "PUBLIC",
      impactCodes: ["PUBLIC_DISCOVERY_ENABLED"],
      requestFingerprintPrefix: "abcd1234",
    });
    const { queryClient } = renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    fireEvent.change(screen.getByRole("textbox", { name: "클럽 이름" }), {
      target: { value: "Draft Alpha" },
    });
    fireEvent.click(screen.getByRole("button", { name: "공개 전환 미리보기" }));
    await screen.findByText("PUBLIC_DISCOVERY_ENABLED");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "영향을 확인했습니다" }),
    );

    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: ["VIEW_CLUBS"],
      generatedAt: "2026-08-24T00:00:00Z",
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", { name: "클럽 이름" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Alpha", { selector: "dd" })).toBeInTheDocument();
    expect(screen.queryByText("PUBLIC_DISCOVERY_ENABLED")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "영향을 확인했습니다" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/receipt-/)).not.toBeInTheDocument();

    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: ["VIEW_CLUBS", "MANAGE_CLUBS", "MANAGE_CLUB_DOMAINS"],
      generatedAt: "2026-08-24T00:00:00Z",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "공개 전환 미리보기" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    expect(screen.getByRole("textbox", { name: "클럽 이름" })).toHaveValue(
      "Alpha",
    );
    expect(screen.queryByText("PUBLIC_DISCOVERY_ENABLED")).not.toBeInTheDocument();
  });

  it("does not resurrect metadata recovery when MANAGE_CLUBS is restored", async () => {
    vi.mocked(updatePlatformAdminClubMetadata).mockRejectedValue({
      code: "REVISION_CONFLICT",
    });
    const { queryClient } = renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 정보 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("최신 상태");

    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: ["VIEW_CLUBS"],
      generatedAt: "2026-08-24T00:00:00Z",
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "공개 정보 저장" }),
      ).not.toBeInTheDocument(),
    );

    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: ["VIEW_CLUBS", "MANAGE_CLUBS", "MANAGE_CLUB_DOMAINS"],
      generatedAt: "2026-08-24T00:00:00Z",
    });
    expect(
      await screen.findByRole("button", { name: "편집" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ignores a visibility preview that arrives after MANAGE_CLUBS is restored", async () => {
    let resolvePreview:
      | ((
          value: Awaited<ReturnType<typeof previewPlatformAdminClubVisibility>>,
        ) => void)
      | undefined;
    vi.mocked(previewPlatformAdminClubVisibility).mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    const { queryClient } = renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "공개 전환 미리보기" }));

    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: ["VIEW_CLUBS"],
      generatedAt: "2026-08-24T00:00:00Z",
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "공개 전환 미리보기" }),
      ).not.toBeInTheDocument(),
    );

    queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: ["VIEW_CLUBS", "MANAGE_CLUBS", "MANAGE_CLUB_DOMAINS"],
      generatedAt: "2026-08-24T00:00:00Z",
    });
    expect(
      await screen.findByRole("button", { name: "공개 전환 미리보기" }),
    ).toBeInTheDocument();

    resolvePreview?.({
      previewId: "preview-late",
      expiresAt: "2026-08-24T01:00:00Z",
      currentVisibility: "PRIVATE",
      targetVisibility: "PUBLIC",
      impactCodes: ["PUBLIC_DISCOVERY_ENABLED"],
      requestFingerprintPrefix: "abcd1234",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "공개 전환 미리보기" }),
      ).toBeEnabled(),
    );
    expect(
      screen.queryByText("PUBLIC_DISCOVERY_ENABLED"),
    ).not.toBeInTheDocument();
  });

  it("purges visibility command state on 403 without retrying", async () => {
    vi.mocked(previewPlatformAdminClubVisibility).mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-08-24T01:00:00Z",
      currentVisibility: "PRIVATE",
      targetVisibility: "PUBLIC",
      impactCodes: ["PUBLIC_DISCOVERY_ENABLED"],
      requestFingerprintPrefix: "abcd1234",
    });
    vi.mocked(confirmPlatformAdminClubVisibility).mockRejectedValue(
      await forbiddenError(),
    );
    const { queryClient } = renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "공개 전환 미리보기" }));
    await screen.findByText("PUBLIC_DISCOVERY_ENABLED");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "공개 전환 확정" }));

    await waitFor(() => {
      expect(
        queryClient.getQueryData(platformAdminKeys.capabilities()),
      ).toBeUndefined();
      expect(
        screen.queryByText("PUBLIC_DISCOVERY_ENABLED"),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "공개 전환 확정" }),
    ).not.toBeInTheDocument();
    expect(confirmPlatformAdminClubVisibility).toHaveBeenCalledTimes(1);
  });

  it("keeps rejected visibility and domain previews inside their error surfaces", async () => {
    vi.mocked(previewPlatformAdminClubVisibility).mockRejectedValue(
      new Error("safe failure"),
    );
    vi.mocked(previewPlatformAdminDomain).mockRejectedValue(
      new Error("safe failure"),
    );
    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: "공개 전환 미리보기" }));
    expect(
      await screen.findByText(/명령 응답을 확인하지 못했습니다/),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Hostname" }), {
      target: { value: "alpha.example.test" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "도메인 추가 미리보기" }),
    );
    await waitFor(() =>
      expect(
        screen.getAllByText(/명령 응답을 확인하지 못했습니다/),
      ).toHaveLength(2),
    );
  });

  it("retains one domain recheck identity across response-loss retry", async () => {
    vi.mocked(checkPlatformAdminDomainProvisioning)
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        receiptId: "receipt-recheck",
        commandType: "club.domain.recheck",
        clubId: "c-1",
        beforeAdminRevision: 7,
        afterAdminRevision: 7,
        outcome: "SUCCEEDED",
        resultCode: "DOMAIN_CHECK_REQUESTED",
        targetId: "domain-1",
        convergenceId: "convergence-1",
        convergenceState: "PENDING",
      });
    renderRoute();

    fireEvent.click(
      screen.getByRole("button", {
        name: "상태 다시 확인: alpha.example.test",
      }),
    );
    expect(
      await screen.findByText(/명령 응답을 확인하지 못했습니다/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "상태 다시 확인: alpha.example.test",
      }),
    );
    await waitFor(() =>
      expect(checkPlatformAdminDomainProvisioning).toHaveBeenCalledTimes(2),
    );
    expect(
      vi.mocked(checkPlatformAdminDomainProvisioning).mock.calls[0]?.[1]
        .idempotencyKey,
    ).toBe(
      vi.mocked(checkPlatformAdminDomainProvisioning).mock.calls[1]?.[1]
        .idempotencyKey,
    );
  });

  it("rotates the domain recheck identity after an idempotency conflict", async () => {
    vi.mocked(checkPlatformAdminDomainProvisioning)
      .mockRejectedValueOnce({ code: "IDEMPOTENCY_CONFLICT" })
      .mockResolvedValueOnce({
        receiptId: "receipt-recheck",
        commandType: "club.domain.recheck",
        clubId: "c-1",
        beforeAdminRevision: 7,
        afterAdminRevision: 7,
        outcome: "SUCCEEDED",
        resultCode: "DOMAIN_CHECK_REQUESTED",
        targetId: "domain-1",
        convergenceId: "convergence-1",
        convergenceState: "PENDING",
      });
    renderRoute();
    const action = screen.getByRole("button", {
      name: "상태 다시 확인: alpha.example.test",
    });
    fireEvent.click(action);
    await screen.findByText(/새 명령으로 다시 시작/);
    fireEvent.click(action);
    await waitFor(() =>
      expect(checkPlatformAdminDomainProvisioning).toHaveBeenCalledTimes(2),
    );
    expect(
      vi.mocked(checkPlatformAdminDomainProvisioning).mock.calls[0]?.[1]
        .idempotencyKey,
    ).not.toBe(
      vi.mocked(checkPlatformAdminDomainProvisioning).mock.calls[1]?.[1]
        .idempotencyKey,
    );
  });

  it("names each recheck action by hostname and targets the chosen domain", async () => {
    vi.mocked(checkPlatformAdminDomainProvisioning).mockResolvedValue({
      receiptId: "receipt-recheck",
      commandType: "club.domain.recheck",
      clubId: "c-1",
      beforeAdminRevision: 7,
      afterAdminRevision: 7,
      outcome: "SUCCEEDED",
      resultCode: "DOMAIN_CHECK_REQUESTED",
      targetId: "domain-2",
      convergenceId: "convergence-2",
      convergenceState: "PENDING",
    });
    renderRoute({
      ...detail,
      domains: [
        ...detail.domains,
        { ...detail.domains[0], id: "domain-2", hostname: "beta.example.test" },
      ],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "상태 다시 확인: beta.example.test" }),
    );
    await waitFor(() =>
      expect(checkPlatformAdminDomainProvisioning).toHaveBeenCalledWith(
        "domain-2",
        expect.any(Object),
      ),
    );
  });

  it("expires a stale visibility preview and requires a fresh one", async () => {
    vi.mocked(previewPlatformAdminClubVisibility).mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-08-24T01:00:00Z",
      currentVisibility: "PRIVATE",
      targetVisibility: "PUBLIC",
      impactCodes: ["PUBLIC_DISCOVERY_ENABLED"],
      requestFingerprintPrefix: "abcd1234",
    });
    vi.mocked(confirmPlatformAdminClubVisibility).mockRejectedValue({
      code: "PREVIEW_EXPIRED",
    });
    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: "공개 전환 미리보기" }));
    await screen.findByText("PUBLIC_DISCOVERY_ENABLED");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "공개 전환 확정" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "새 미리보기를 만들어",
    );
    expect(
      screen.queryByText("PUBLIC_DISCOVERY_ENABLED"),
    ).not.toBeInTheDocument();
  });

  it("clears visibility confirmation and refreshes after revision conflict", async () => {
    vi.mocked(previewPlatformAdminClubVisibility).mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-08-24T01:00:00Z",
      currentVisibility: "PRIVATE",
      targetVisibility: "PUBLIC",
      impactCodes: ["PUBLIC_DISCOVERY_ENABLED"],
      requestFingerprintPrefix: "abcd1234",
    });
    vi.mocked(confirmPlatformAdminClubVisibility).mockRejectedValue({
      code: "REVISION_CONFLICT",
    });
    renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "공개 전환 미리보기" }));
    await screen.findByText("PUBLIC_DISCOVERY_ENABLED");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "영향을 확인했습니다" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "공개 전환 확정" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("최신 상태");
    expect(
      screen.queryByText("PUBLIC_DISCOVERY_ENABLED"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(fetchPlatformAdminClub).toHaveBeenCalledWith("c-1"),
    );
  });

  it("ignores a domain preview response that arrives after the hostname changed", async () => {
    let resolvePreview:
      | ((
          value: Awaited<ReturnType<typeof previewPlatformAdminDomain>>,
        ) => void)
      | undefined;
    vi.mocked(previewPlatformAdminDomain).mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    renderRoute();
    const hostname = screen.getByRole("textbox", { name: "Hostname" });
    fireEvent.change(hostname, { target: { value: "first.example.test" } });
    fireEvent.click(
      screen.getByRole("button", { name: "도메인 추가 미리보기" }),
    );
    fireEvent.change(hostname, { target: { value: "second.example.test" } });
    resolvePreview?.({
      previewId: "preview-domain",
      expiresAt: "2026-08-24T01:00:00Z",
      kind: "CUSTOM_DOMAIN",
      isPrimary: false,
      impactCodes: ["DOMAIN_CREATED"],
      requestFingerprintPrefix: "abcd1234",
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "도메인 추가 미리보기" }),
      ).toBeEnabled(),
    );
    expect(screen.queryByText("DOMAIN_CREATED")).not.toBeInTheDocument();
  });

  it("discards open command previews when authoritative revision changes", async () => {
    vi.mocked(previewPlatformAdminClubVisibility).mockResolvedValue({
      previewId: "preview-1",
      expiresAt: "2026-08-24T01:00:00Z",
      currentVisibility: "PRIVATE",
      targetVisibility: "PUBLIC",
      impactCodes: ["PUBLIC_DISCOVERY_ENABLED"],
      requestFingerprintPrefix: "abcd1234",
    });
    const { queryClient } = renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "공개 전환 미리보기" }));
    await screen.findByText("PUBLIC_DISCOVERY_ENABLED");
    queryClient.setQueryData(platformAdminClubDetailQuery("c-1").queryKey, {
      ...detail,
      adminRevision: 8,
    });
    await waitFor(() =>
      expect(
        screen.queryByText("PUBLIC_DISCOVERY_ENABLED"),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "공개 전환 확정" }),
    ).not.toBeInTheDocument();
  });

  it("offers an authoritative refresh after metadata revision conflict", async () => {
    vi.mocked(updatePlatformAdminClubMetadata).mockRejectedValue({
      code: "REVISION_CONFLICT",
    });
    renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "편집" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 정보 저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("최신 상태");
    fireEvent.click(screen.getByRole("button", { name: "최신 상태 불러오기" }));
    await waitFor(() =>
      expect(fetchPlatformAdminClub).toHaveBeenCalledWith("c-1"),
    );
  });
});
