import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { platformAdminSummaryQuery } from "@/features/platform-admin/queries/platform-admin-queries";
import {
  platformAdminNotificationDeliveriesQuery,
  platformAdminNotificationEventsQuery,
  platformAdminNotificationSnapshotQuery,
} from "@/features/platform-admin/queries/platform-admin-notifications-queries";
import { findUnnamedInteractiveElements } from "@/shared/testing/accessibility-checks";
import { AdminNotificationsRoute } from "@/features/platform-admin/route/admin-notifications-route";

vi.mock(
  "@/features/platform-admin/api/platform-admin-notifications-api",
  async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/features/platform-admin/api/platform-admin-notifications-api")>()),
    previewAdminNotificationReplay: vi.fn(),
    confirmAdminNotificationReplay: vi.fn(),
  }),
);

import {
  confirmAdminNotificationReplay,
  previewAdminNotificationReplay,
} from "@/features/platform-admin/api/platform-admin-notifications-api";

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
  queryClient.setQueryData(platformAdminNotificationEventsQuery().queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [null],
  });
  queryClient.setQueryData(platformAdminNotificationDeliveriesQuery().queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [null],
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <AdminNotificationsRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderRouteWithPages() {
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
    outboxSummary: { pending: 1, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 0 },
    deliverySummary: { pending: 0, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 0 },
    relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
    failureClusters: [],
    clubHealth: [],
    recentManualDispatches: [],
  });
  const duplicate = event("event-2", "두 번째 클럽");
  queryClient.setQueryData(platformAdminNotificationEventsQuery().queryKey, {
    pages: [
      { items: [event("event-1", "첫 번째 클럽"), duplicate], nextCursor: "page-2" },
      { items: [duplicate, event("event-3", "세 번째 클럽")], nextCursor: null },
    ],
    pageParams: [null, "page-2"],
  });
  queryClient.setQueryData(platformAdminNotificationDeliveriesQuery().queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [null],
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/notifications"]}>
        <AdminNotificationsRoute />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function event(eventId: string, clubName: string) {
  return {
    eventId,
    club: { clubId: `club-${eventId}`, slug: `slug-${eventId}`, name: clubName },
    eventType: "SESSION_REMINDER_DUE",
    source: "AUTOMATIC" as const,
    status: "FAILED",
    attemptCount: 1,
    nextAttemptAt: null,
    createdAt: "2026-05-27T00:00:00Z",
    updatedAt: "2026-05-27T00:00:00Z",
    safeErrorCode: "MAIL_RETRYABLE",
    manualDispatch: null,
  };
}

describe("AdminNotificationsRoute", () => {
  beforeEach(() => {
    vi.mocked(previewAdminNotificationReplay).mockReset();
    vi.mocked(confirmAdminNotificationReplay).mockReset();
  });

  it("passes focus from URL into the page", () => {
    const { container } = renderRoute();

    expect(screen.getAllByRole("heading").length).toBeGreaterThan(0);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
    expect(screen.getByText(/Health outbox backlog/)).toBeInTheDocument();
  });

  it("flattens multiple cursor pages and removes a duplicate boundary event", () => {
    renderRouteWithPages();

    expect(screen.getByText(/첫 번째 클럽/)).toBeInTheDocument();
    expect(screen.getAllByText(/두 번째 클럽/)).toHaveLength(1);
    expect(screen.getByText(/세 번째 클럽/)).toBeInTheDocument();
  });

  it("retains one replay identity across response loss and renders the recovered receipt", async () => {
    vi.mocked(previewAdminNotificationReplay).mockResolvedValue({
      previewId: "00000000-0000-4000-8000-000000005903",
      selectionHash: "a".repeat(64),
      matchedCount: 1,
      excludedCount: 0,
      estimatedByStatus: { FAILED: 1 },
      warnings: [],
      expiresAt: "2026-05-27T00:10:00Z",
    });
    vi.mocked(confirmAdminNotificationReplay)
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        receiptId: "00000000-0000-4000-8000-000000005904",
        replayedCount: 1,
        skippedCount: 0,
        skippedReasonCounts: {},
        originStatus: "SUCCEEDED",
        effectStatus: "PENDING",
        effectAvailability: "AVAILABLE",
        convergenceId: "00000000-0000-4000-8000-000000005905",
      });
    renderRoute("/admin/notifications");

    fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));
    await screen.findByText(
      (_, element) => element?.textContent?.startsWith("대상 1건") === true,
      { selector: "p" },
    );
    fireEvent.change(screen.getByLabelText("처리 사유"), { target: { value: "retry delivery" } });
    fireEvent.click(screen.getByRole("button", { name: "재처리 확정" }));
    await screen.findByText(/같은 요청으로 다시 확인/);
    fireEvent.click(screen.getByRole("button", { name: "재처리 확정" }));

    await waitFor(() => expect(confirmAdminNotificationReplay).toHaveBeenCalledTimes(2));
    expect(vi.mocked(confirmAdminNotificationReplay).mock.calls[0]?.[0].idempotencyKey).toBe(
      vi.mocked(confirmAdminNotificationReplay).mock.calls[1]?.[0].idempotencyKey,
    );
    expect(await screen.findByText(/00000000-0000-4000-8000-000000005904/)).toBeInTheDocument();
  });
});
