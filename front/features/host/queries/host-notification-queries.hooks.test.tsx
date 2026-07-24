import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HostNotificationPolicyResponse,
  ManualNotificationConfirmRequest,
  ManualNotificationConfirmResponse,
} from "@/features/host/api/host-contracts";

vi.mock("@/features/host/api/host-api", () => ({
  confirmManualNotification: vi.fn(),
  updateHostNotificationPolicy: vi.fn(),
}));

import {
  confirmManualNotification,
  updateHostNotificationPolicy,
} from "@/features/host/api/host-api";
import {
  hostNotificationKeys,
  useConfirmManualNotificationMutation,
  useUpdateHostNotificationPolicyMutation,
} from "./host-notification-queries";

const mockedConfirm = vi.mocked(confirmManualNotification);
const mockedUpdatePolicy = vi.mocked(updateHostNotificationPolicy);

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

const confirmRequest: ManualNotificationConfirmRequest = {
  sessionId: "session-1",
  eventType: "SESSION_REMINDER_DUE",
  contentRevision: "a".repeat(64),
  audience: "ALL_ACTIVE_MEMBERS",
  requestedChannels: "BOTH",
  selectedMembershipIds: [],
  excludedMembershipIds: [],
  includedMembershipIds: [],
  sendMode: "NOW",
  previewId: "preview-1",
  resendConfirmed: false,
};

const confirmResponse: ManualNotificationConfirmResponse = {
  manualDispatchId: "dispatch-1",
  eventId: "event-manual-1",
  status: "PUBLISHED",
  createdAt: "2026-05-18T00:00:00Z",
  summary: {
    targetCount: 3,
    requestedChannels: "BOTH",
    expectedInAppCount: 3,
    expectedEmailCount: 2,
  },
};

describe("useConfirmManualNotificationMutation", () => {
  beforeEach(() => {
    mockedConfirm.mockReset();
    mockedUpdatePolicy.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates dispatch, event, delivery, and summary keys after a successful confirm", async () => {
    mockedConfirm.mockResolvedValue(confirmResponse);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(
      () => useConfirmManualNotificationMutation({ clubSlug: "reading-sai" }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync(confirmRequest);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockedConfirm).toHaveBeenCalledWith(confirmRequest);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.manualDispatchesRoot({ clubSlug: "reading-sai" }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.eventsRoot({ clubSlug: "reading-sai" }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.deliveriesRoot({ clubSlug: "reading-sai" }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.summary({ clubSlug: "reading-sai" }),
    });
  });

  it("does not invalidate caches when confirm fails", async () => {
    mockedConfirm.mockRejectedValue(new Error("server error"));
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(
      () => useConfirmManualNotificationMutation({ clubSlug: "reading-sai" }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync(confirmRequest).catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("scopes invalidation to the provided club context", async () => {
    mockedConfirm.mockResolvedValue(confirmResponse);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    const { result } = renderHook(
      () => useConfirmManualNotificationMutation({ clubSlug: "other-club" }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync(confirmRequest);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        hostNotificationKeys.manualDispatchesRoot({ clubSlug: "other-club" }),
        hostNotificationKeys.eventsRoot({ clubSlug: "other-club" }),
        hostNotificationKeys.deliveriesRoot({ clubSlug: "other-club" }),
        hostNotificationKeys.summary({ clubSlug: "other-club" }),
      ]),
    );
    expect(invalidatedKeys).not.toEqual(
      expect.arrayContaining([
        hostNotificationKeys.summary({ clubSlug: "reading-sai" }),
      ]),
    );
  });
});

describe("useUpdateHostNotificationPolicyMutation", () => {
  it("invalidates only the club-scoped policy key after success", async () => {
    const response: HostNotificationPolicyResponse = {
      sessionReminderEnabled: true,
      updatedAt: "2026-07-24T10:00:00+09:00",
    };
    mockedUpdatePolicy.mockResolvedValue(response);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(
      () => useUpdateHostNotificationPolicyMutation({ clubSlug: "reading-sai" }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ sessionReminderEnabled: true });
    });

    expect(mockedUpdatePolicy).toHaveBeenCalledWith(
      { sessionReminderEnabled: true },
      { clubSlug: "reading-sai" },
    );
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.policy({ clubSlug: "reading-sai" }),
    });
  });
});
