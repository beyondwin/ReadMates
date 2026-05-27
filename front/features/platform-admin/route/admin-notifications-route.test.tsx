import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import {
  platformAdminNotificationDeliveriesQuery,
  platformAdminNotificationEventsQuery,
  platformAdminNotificationSnapshotQuery,
} from "@/features/platform-admin/queries/platform-admin-notifications-queries";
import { AdminNotificationsRoute } from "@/features/platform-admin/route/admin-notifications-route";

function renderRoute(initialEntry = "/admin/notifications?focus=outbox_backlog") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
    platformRole: "OWNER",
    activeClubCount: 0,
    domainActionRequiredCount: 0,
    domainsRequiringAction: [],
  });
  queryClient.setQueryData(platformAdminNotificationSnapshotQuery().queryKey, {
    generatedAt: "2026-05-27T00:00:00Z",
    outboxSummary: { pending: 1, active: 0, failed: 1, dead: 0, sentOrPublishedLast24h: 2 },
    deliverySummary: { pending: 0, active: 0, failed: 0, dead: 1, sentOrPublishedLast24h: 2 },
    relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
    failureClusters: [],
    clubHealth: [],
    recentManualDispatches: [],
  });
  queryClient.setQueryData(platformAdminNotificationEventsQuery().queryKey, { items: [], nextCursor: null });
  queryClient.setQueryData(platformAdminNotificationDeliveriesQuery().queryKey, { items: [], nextCursor: null });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminNotificationsRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminNotificationsRoute", () => {
  it("passes focus from URL into the page", () => {
    renderRoute();

    expect(screen.getByText(/Health outbox backlog/)).toBeInTheDocument();
  });
});
