import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiErrorFromResponse } from "@/shared/api/errors";
import {
  installPlatformAdminAuthorityLossHandler,
  platformAdminCapabilitiesQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";

vi.mock("@/features/platform-admin/api/platform-admin-notifications-api", () => ({
  confirmAdminNotificationReplay: vi.fn(),
  fetchAdminNotificationDeliveries: vi.fn(),
  fetchAdminNotificationEvents: vi.fn(),
  fetchAdminNotificationSnapshot: vi.fn(),
  previewAdminNotificationReplay: vi.fn(),
}));

import {
  confirmAdminNotificationReplay,
  previewAdminNotificationReplay,
} from "@/features/platform-admin/api/platform-admin-notifications-api";
import {
  platformAdminNotificationSnapshotQuery,
  platformAdminNotificationsKeys,
  publishPlatformAdminNotifications,
  useConfirmAdminNotificationReplayMutation,
  usePreviewAdminNotificationReplayMutation,
} from "./platform-admin-notifications-queries";

const snapshot = {
  generatedAt: "2026-05-27T00:00:00Z",
  outboxSummary: { pending: 1, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 0 },
  deliverySummary: { pending: 0, active: 0, failed: 0, dead: 0, sentOrPublishedLast24h: 0 },
  relaySummary: { publishing: 0, sending: 0, stalePublishing: 0, staleSending: 0 },
  failureClusters: [],
  clubHealth: [],
  recentManualDispatches: [],
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

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
      mutations: { retry: 3 },
    },
  });
  installPlatformAdminAuthorityLossHandler(client);
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

describe("platform admin notification queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not retry a failed preview mutation, including 403", async () => {
    vi.mocked(previewAdminNotificationReplay).mockRejectedValue(await forbiddenError());
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminCapabilitiesQuery().queryKey, {
      schemaVersion: 1,
      role: "OWNER",
      status: "ACTIVE",
      capabilities: ["VIEW_NOTIFICATION_OPERATIONS", "REPLAY_NOTIFICATIONS"],
      generatedAt: "2026-08-25T00:00:00Z",
    });
    client.setQueryData(platformAdminNotificationSnapshotQuery().queryKey, snapshot);
    const { result } = renderHook(() => usePreviewAdminNotificationReplayMutation(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({}).catch(() => undefined);
    });

    expect(previewAdminNotificationReplay).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(platformAdminCapabilitiesQuery().queryKey)).toBeUndefined();
    expect(client.getQueryData(platformAdminNotificationSnapshotQuery().queryKey)).toBeUndefined();
  });

  it("does not retry a failed confirm mutation, including 403", async () => {
    vi.mocked(confirmAdminNotificationReplay).mockRejectedValue(await forbiddenError());
    const { client, Wrapper } = createWrapper();
    client.setQueryData(platformAdminNotificationSnapshotQuery().queryKey, snapshot);
    const { result } = renderHook(() => useConfirmAdminNotificationReplayMutation(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current
        .mutateAsync({
          previewId: "preview-1",
          selectionHash: "a".repeat(64),
          reason: "retry delivery",
          idempotencyKey: "intent-1",
        })
        .catch(() => undefined);
    });

    expect(confirmAdminNotificationReplay).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(platformAdminNotificationSnapshotQuery().queryKey)).toBeUndefined();
  });

  it("invalidates notification reads after confirm succeeds and keys stay under platform-admin", async () => {
    vi.mocked(confirmAdminNotificationReplay).mockResolvedValue({
      receiptId: "00000000-0000-4000-8000-000000005904",
      replayedCount: 1,
      skippedCount: 0,
      skippedReasonCounts: {},
      originStatus: "SUCCEEDED",
      effectStatus: "PENDING",
      effectAvailability: "AVAILABLE",
      convergenceId: "00000000-0000-4000-8000-000000005905",
    });
    const { client, Wrapper } = createWrapper();
    const snapshotKey = platformAdminNotificationSnapshotQuery().queryKey;
    client.setQueryData(snapshotKey, snapshot);
    const { result } = renderHook(() => useConfirmAdminNotificationReplayMutation(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        previewId: "preview-1",
        selectionHash: "a".repeat(64),
        reason: "retry delivery",
        idempotencyKey: "intent-1",
      });
    });

    expect(platformAdminNotificationsKeys.all[0]).toBe("platform-admin");
    expect(client.getQueryState(snapshotKey)?.isInvalidated).toBe(false);
    await publishPlatformAdminNotifications(client);
    expect(client.getQueryState(snapshotKey)?.isInvalidated).toBe(true);
    expect(client.getQueryData(snapshotKey)).toEqual(snapshot);
  });
});
