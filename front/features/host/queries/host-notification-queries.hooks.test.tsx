import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ManualNotificationConfirmRequest,
  ManualNotificationConfirmResponse,
} from "@/features/host/api/host-contracts";

vi.mock("@/features/host/api/host-api", () => ({
  confirmManualNotification: vi.fn(),
}));

import { confirmManualNotification } from "@/features/host/api/host-api";
import {
  hostNotificationKeys,
  useConfirmManualNotificationMutation,
} from "./host-notification-queries";

const mockedConfirm = vi.mocked(confirmManualNotification);

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
  audience: "ALL_ACTIVE_MEMBERS",
  channels: "BOTH",
  previewToken: "token-abc",
};

const confirmResponse: ManualNotificationConfirmResponse = {
  manualDispatchId: "dispatch-1",
  eventId: "event-manual-1",
  status: "PUBLISHED",
  createdAt: "2026-05-18T00:00:00Z",
  selection: {
    sessionId: "session-1",
    eventType: "SESSION_REMINDER_DUE",
    audience: "ALL_ACTIVE_MEMBERS",
    requestedChannels: "BOTH",
    targetCount: 3,
  },
};

describe("useConfirmManualNotificationMutation", () => {
  beforeEach(() => {
    mockedConfirm.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates overview and manual roots after a successful confirm", async () => {
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
      queryKey: hostNotificationKeys.overview({ clubSlug: "reading-sai" }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostNotificationKeys.manual({ clubSlug: "reading-sai" }),
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
        hostNotificationKeys.overview({ clubSlug: "other-club" }),
        hostNotificationKeys.manual({ clubSlug: "other-club" }),
      ]),
    );
    expect(invalidatedKeys).not.toEqual(
      expect.arrayContaining([
        hostNotificationKeys.overview({ clubSlug: "reading-sai" }),
      ]),
    );
  });
});
