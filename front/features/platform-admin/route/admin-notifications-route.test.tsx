import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorFromResponse } from "@/shared/api/errors";
import type { PlatformAdminCapability } from "@/features/platform-admin/model/platform-admin-capabilities";
import type { PlatformAdminRole } from "@/features/platform-admin/model/platform-admin-domain-types";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
  platformAdminSummaryQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
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

const PREVIEW = {
  previewId: "00000000-0000-4000-8000-000000005903",
  selectionHash: "a".repeat(64),
  matchedCount: 1,
  excludedCount: 0,
  estimatedByStatus: { FAILED: 1 },
  warnings: [],
  expiresAt: "2026-05-27T00:10:00Z",
};

const RECEIPT = {
  receiptId: "00000000-0000-4000-8000-000000005904",
  replayedCount: 1,
  skippedCount: 0,
  skippedReasonCounts: {},
  originStatus: "SUCCEEDED" as const,
  effectStatus: "PENDING" as const,
  effectAvailability: "AVAILABLE" as const,
  convergenceId: "00000000-0000-4000-8000-000000005905",
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

function snapshotData() {
  return {
    generatedAt: "2026-05-27T00:00:00Z",
    outboxSummary: { pending: 1, active: 0, failed: 1, dead: 0, sentOrPublishedLast24h: 2 },
    deliverySummary: { pending: 0, active: 0, failed: 0, dead: 1, sentOrPublishedLast24h: 2 },
    relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
    failureClusters: [],
    clubHealth: [],
    recentManualDispatches: [],
  };
}

function renderRoute(
  initialEntry = "/admin/notifications?focus=outbox_backlog",
  options: {
    role?: PlatformAdminRole;
    capabilities?: PlatformAdminCapability[];
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: 3 } },
  });
  installPlatformAdminAuthorityLossHandler(queryClient);
  const role = options.role ?? "OWNER";
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
    platformRole: role,
    activeClubCount: 0,
    domainActionRequiredCount: 0,
    domainsRequiringAction: [],
  });
  queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
    schemaVersion: 1,
    role,
    status: "ACTIVE",
    capabilities: options.capabilities ?? ["VIEW_NOTIFICATION_OPERATIONS"],
    generatedAt: "2026-08-25T00:00:00Z",
  });
  queryClient.setQueryData(platformAdminNotificationSnapshotQuery().queryKey, snapshotData());
  queryClient.setQueryData(platformAdminNotificationEventsQuery().queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [null],
  });
  queryClient.setQueryData(platformAdminNotificationDeliveriesQuery().queryKey, {
    pages: [{ items: [], nextCursor: null }],
    pageParams: [null],
  });

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AdminNotificationsRoute />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function renderRouteWithPages() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  installPlatformAdminAuthorityLossHandler(queryClient);
  queryClient.setQueryData(platformAdminSummaryQuery().queryKey, {
    platformRole: "OWNER",
    activeClubCount: 0,
    domainActionRequiredCount: 0,
    domainsRequiringAction: [],
  });
  queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
    schemaVersion: 1,
    role: "OWNER",
    status: "ACTIVE",
    capabilities: ["VIEW_NOTIFICATION_OPERATIONS"],
    generatedAt: "2026-08-25T00:00:00Z",
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

const REPLAY_CAPS: PlatformAdminCapability[] = [
  "VIEW_NOTIFICATION_OPERATIONS",
  "REPLAY_NOTIFICATIONS",
];

async function previewAndFillReason() {
  fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));
  await screen.findByText(
    (_, element) => element?.textContent?.startsWith("대상 1건") === true,
    { selector: "p" },
  );
  fireEvent.change(screen.getByLabelText("처리 사유"), { target: { value: "retry delivery" } });
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

  it("does not give OWNER replay controls without REPLAY_NOTIFICATIONS and the handler makes zero requests", () => {
    renderRoute("/admin/notifications", {
      role: "OWNER",
      capabilities: ["VIEW_NOTIFICATION_OPERATIONS"],
    });

    expect(screen.getByText("현재 권한으로는 재처리를 실행할 수 없습니다.")).toBeInTheDocument();
    const preview = screen.getByRole("button", { name: "대상 확인" });
    expect(preview).toBeDisabled();
    fireEvent.click(preview);
    fireEvent.click(screen.getByRole("button", { name: "재처리 확정" }));

    expect(previewAdminNotificationReplay).not.toHaveBeenCalled();
    expect(confirmAdminNotificationReplay).not.toHaveBeenCalled();
  });

  it("lets OPERATOR preview when the exact REPLAY_NOTIFICATIONS capability is present", async () => {
    vi.mocked(previewAdminNotificationReplay).mockResolvedValue(PREVIEW);
    renderRoute("/admin/notifications", {
      role: "OPERATOR",
      capabilities: REPLAY_CAPS,
    });

    fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));

    expect(
      await screen.findByText((_, element) => element?.textContent?.startsWith("대상 1건") === true, {
        selector: "p",
      }),
    ).toBeInTheDocument();
    expect(previewAdminNotificationReplay).toHaveBeenCalledTimes(1);
  });

  it("purges preview, reason, identity, submitted flag, result, and platform-admin cache after a preview 403", async () => {
    vi.mocked(previewAdminNotificationReplay).mockRejectedValue(await forbiddenError());
    const { queryClient } = renderRoute("/admin/notifications", { capabilities: REPLAY_CAPS });
    fireEvent.change(screen.getByLabelText("처리 사유"), { target: { value: "retry delivery" } });
    fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));

    await waitFor(() => {
      expect(previewAdminNotificationReplay).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(platformAdminCapabilitiesQuery().queryKey)).toBeUndefined();
      expect(queryClient.getQueryData(platformAdminNotificationSnapshotQuery().queryKey)).toBeUndefined();
    });
    expect(screen.queryByText((_, element) => element?.textContent?.startsWith("대상 1건") === true)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("retry delivery")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
    expect(confirmAdminNotificationReplay).not.toHaveBeenCalled();

    act(() => {
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OWNER",
        status: "ACTIVE",
        capabilities: REPLAY_CAPS,
        generatedAt: "2026-08-25T00:00:00Z",
      });
      queryClient.setQueryData(platformAdminNotificationSnapshotQuery().queryKey, snapshotData());
    });
    expect(await screen.findByRole("button", { name: "대상 확인" })).toBeEnabled();
    expect(screen.getByLabelText("처리 사유")).toHaveValue("");
    expect(screen.queryByText((_, element) => element?.textContent?.startsWith("대상 1건") === true)).not.toBeInTheDocument();
    expect(previewAdminNotificationReplay).toHaveBeenCalledTimes(1);
  });

  it("purges replay command state after a confirm 403 without automatic retry", async () => {
    vi.mocked(previewAdminNotificationReplay).mockResolvedValue(PREVIEW);
    vi.mocked(confirmAdminNotificationReplay).mockRejectedValue(await forbiddenError());
    const { queryClient } = renderRoute("/admin/notifications", { capabilities: REPLAY_CAPS });
    await previewAndFillReason();
    fireEvent.click(screen.getByRole("button", { name: "재처리 확정" }));

    await waitFor(() => {
      expect(confirmAdminNotificationReplay).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(platformAdminCapabilitiesQuery().queryKey)).toBeUndefined();
    });
    expect(screen.queryByText((_, element) => element?.textContent?.startsWith("대상 1건") === true)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("retry delivery")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
    expect(previewAdminNotificationReplay).toHaveBeenCalledTimes(1);

    act(() => {
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OWNER",
        status: "ACTIVE",
        capabilities: REPLAY_CAPS,
        generatedAt: "2026-08-25T00:00:00Z",
      });
      queryClient.setQueryData(platformAdminNotificationSnapshotQuery().queryKey, snapshotData());
    });
    expect(await screen.findByRole("button", { name: "대상 확인" })).toBeEnabled();
    expect(screen.getByLabelText("처리 사유")).toHaveValue("");
    expect(confirmAdminNotificationReplay).toHaveBeenCalledTimes(1);
  });

  it("purges the same replay state when REPLAY_NOTIFICATIONS is removed from the projection", async () => {
    vi.mocked(previewAdminNotificationReplay).mockResolvedValue(PREVIEW);
    vi.mocked(confirmAdminNotificationReplay).mockResolvedValue(RECEIPT);
    const { queryClient } = renderRoute("/admin/notifications", { capabilities: REPLAY_CAPS });
    await previewAndFillReason();
    fireEvent.click(screen.getByRole("button", { name: "재처리 확정" }));
    expect(await screen.findByRole("region", { name: "명령 기록" })).toBeInTheDocument();

    act(() => {
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OWNER",
        status: "ACTIVE",
        capabilities: ["VIEW_NOTIFICATION_OPERATIONS"],
        generatedAt: "2026-08-25T00:00:00Z",
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
    });
    expect(screen.queryByText((_, element) => element?.textContent?.startsWith("대상 1건") === true)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("retry delivery")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "대상 확인" })).toBeDisabled();

    act(() => {
      queryClient.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
        schemaVersion: 1,
        role: "OWNER",
        status: "ACTIVE",
        capabilities: REPLAY_CAPS,
        generatedAt: "2026-08-25T00:00:00Z",
      });
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "대상 확인" })).toBeEnabled());
    expect(screen.getByLabelText("처리 사유")).toHaveValue("");
    expect(screen.queryByRole("region", { name: "명령 기록" })).not.toBeInTheDocument();
    expect(previewAdminNotificationReplay).toHaveBeenCalledTimes(1);
    expect(confirmAdminNotificationReplay).toHaveBeenCalledTimes(1);
  });

  it("retains one replay identity across response loss and renders the recovered receipt", async () => {
    vi.mocked(previewAdminNotificationReplay).mockResolvedValue(PREVIEW);
    vi.mocked(confirmAdminNotificationReplay)
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(RECEIPT);
    renderRoute("/admin/notifications", { capabilities: REPLAY_CAPS });

    fireEvent.click(screen.getByRole("button", { name: "대상 확인" }));
    await screen.findByText(
      (_, element) => element?.textContent?.startsWith("대상 1건") === true,
      { selector: "p" },
    );
    fireEvent.change(screen.getByLabelText("처리 사유"), { target: { value: "retry delivery" } });
    fireEvent.click(screen.getByRole("button", { name: "재처리 확정" }));
    await screen.findByText(/같은 요청으로 다시 확인/);
    expect(screen.getByRole("group", { name: "작업" }).closest("[data-state]")).toHaveAttribute(
      "data-state",
      "unknown-outcome",
    );
    const previewAgain = screen.getByRole("button", { name: "대상 확인" });
    expect(previewAgain).toBeDisabled();
    fireEvent.click(previewAgain);
    expect(previewAdminNotificationReplay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "재처리 확정" }));

    await waitFor(() => expect(confirmAdminNotificationReplay).toHaveBeenCalledTimes(2));
    expect(vi.mocked(confirmAdminNotificationReplay).mock.calls[0]?.[0].idempotencyKey).toBe(
      vi.mocked(confirmAdminNotificationReplay).mock.calls[1]?.[0].idempotencyKey,
    );
    expect(await screen.findByRole("region", { name: "명령 기록" })).toBeInTheDocument();
    expect(screen.getByText(/00000000-0000-4000-8000-000000005904/)).toBeInTheDocument();
    expect(previewAdminNotificationReplay).toHaveBeenCalledTimes(1);
  });
});
