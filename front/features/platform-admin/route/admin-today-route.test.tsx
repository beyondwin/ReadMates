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
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
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
  return queryClient;
}

describe("AdminTodayRoute", () => {
  it("renders the operations ledger from seeded admin queries", () => {
    renderRoute(seededClient(), "/admin/today?selected=club-club-ready");

    expect(screen.getByRole("heading", { name: "오늘 할 일" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "운영 작업 큐" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "선택 항목 브리프" })).toBeInTheDocument();
    expect(screen.getAllByText("Ready Club").length).toBeGreaterThan(0);
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
