import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  platformAdminAiOpsJobsQuery,
  platformAdminAiOpsSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-ai-ops-queries";
import { platformAdminNotificationSnapshotQuery } from "@/features/platform-admin/queries/platform-admin-notifications-queries";
import {
  platformAdminClubsQuery,
  platformAdminKeys,
  platformAdminSummaryQuery,
  platformAdminTodayClosingRisksQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminTodayRoute } from "./admin-today-route";

function renderRoute(client: QueryClient, initialEntry = "/admin/today") {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminTodayRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function seededClient() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
    platformRole: "OWNER",
    activeClubCount: 1,
    domainActionRequiredCount: 0,
    domains: [],
    domainsRequiringAction: [],
  });
  queryClient.setQueryData(platformAdminClubsQuery().queryKey, {
    items: [{
      clubId: "club-ready",
      slug: "ready-club",
      name: "Ready Club",
      tagline: "함께 읽는 클럽",
      about: "공개 소개가 입력되어 있습니다.",
      status: "ACTIVE",
      publicVisibility: "PRIVATE",
      domainCount: 0,
      domainActionRequiredCount: 0,
      notificationFailureCount: 0,
      aiFailureCount: 0,
      firstHostOnboardingState: "ASSIGNED",
    }],
  });
  queryClient.setQueryData(platformAdminNotificationSnapshotQuery().queryKey, {
    generatedAt: "2026-05-27T00:00:00Z",
    outboxSummary: { pending: 0, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 1 },
    deliverySummary: { pending: 0, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 1 },
    relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
    failureClusters: [],
    clubHealth: [],
    recentManualDispatches: [],
  });
  queryClient.setQueryData(platformAdminAiOpsSummaryQuery().queryKey, {
    activeJobCount: 0,
    failedLast24h: 0,
    monthToDateCostEstimateUsd: "0.0000",
    failureCodes: [],
    providerCosts: [],
    staleCandidateCount: 0,
  });
  queryClient.setQueryData(platformAdminAiOpsJobsQuery().queryKey, { items: [], nextCursor: null });
  queryClient.setQueryData(platformAdminTodayClosingRisksQuery().queryKey, {
    schema: "admin.today_closing_risks.v1",
    generatedAt: "2026-06-20T00:00:00Z",
    items: [{
      clubId: "club-ready",
      clubSlug: "ready-club",
      clubName: "Ready Club",
      sessionId: "session-risk-1",
      sessionNumber: 12,
      bookTitle: "모던 자바스크립트",
      meetingDate: "2026-06-20",
      overallState: "BLOCKED",
      primaryBlocker: "PRIVATE_SENTINEL_TOKEN",
      hostClosingHref: "/clubs/ready-club/app/host/sessions/session-risk-1/closing",
      firstDetectedAt: "2026-06-18T00:00:00Z",
      lastSeenAt: "2026-06-21T00:00:00Z",
      resolvedAt: null,
      ageDays: 3,
      occurrenceCount: 2,
      ledgerState: "ACTIVE",
    }],
  });
  return queryClient;
}

describe("AdminTodayRoute", () => {
  it("renders the operations ledger from seeded admin queries", () => {
    const { container } = renderRoute(seededClient(), "/admin/today?selected=club-club-ready");

    expect(screen.getByRole("heading", { name: "오늘 할 일" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    expect(screen.getByRole("region", { name: "운영 작업 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "선택 항목 브리프" })).toBeInTheDocument();
    expect(screen.getAllByText("Ready Club").length).toBeGreaterThan(0);
  });

  it("renders seeded closing-risk query data without leaking raw blocker codes", () => {
    renderRoute(seededClient(), "/admin/today?selected=closing-risk-session-risk-1");

    expect(screen.getByRole("region", { name: "운영 작업 큐" })).toBeInTheDocument();
    expect(screen.getAllByText(/모던 자바스크립트/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("호스트 클로징 보드").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/3일째 차단/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/반복 2회/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("확인 필요").length).toBeGreaterThan(0);
    expect(screen.queryByText("PRIVATE_SENTINEL_TOKEN")).not.toBeInTheDocument();
  });

  it("renders a partial warning when the optional closing-risk query is unavailable", () => {
    const client = seededClient();
    client.setQueryData(platformAdminTodayClosingRisksQuery().queryKey, {
      schema: "admin.today_closing_risks.v1",
      generatedAt: "2026-06-20T00:00:00Z",
      items: [],
    });
    client.setQueryData(platformAdminKeys.todayClosingRisksUnavailable(), true);

    renderRoute(client);

    expect(screen.getByRole("button", { name: /클로징 리스크/ })).toBeInTheDocument();
    expect(screen.getByText("오늘 클로징 리스크 큐를 확인하지 못했습니다.")).toBeInTheDocument();
    expect(screen.getByText("클로징 확인 불가")).toBeInTheDocument();
  });

  it("renders notification risk from the notification snapshot", () => {
    const client = seededClient();
    client.setQueryData(platformAdminNotificationSnapshotQuery().queryKey, {
      generatedAt: "2026-05-27T00:00:00Z",
      outboxSummary: { pending: 0, active: 0, failed: 1, dead: 0, sentOrPublishedLast24h: 1 },
      deliverySummary: { pending: 0, active: 0, failed: 0, dead: 1, sentOrPublishedLast24h: 1 },
      relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
      failureClusters: [],
      clubHealth: [{
        clubId: "club-ready",
        slug: "ready-club",
        name: "Ready Club",
        pending: 0,
        failed: 1,
        dead: 1,
        lastSuccessAt: null,
      }],
      recentManualDispatches: [],
    });

    renderRoute(client);

    expect(screen.getAllByText("Ready Club").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/알림 실패 1건/).length).toBeGreaterThan(0);
  });
});
