import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  panelLoadStateFromQuery,
  useHostMeetingPanelQueries,
} from "./host-meeting-panel-queries";

const fetchRecordEditor = vi.fn();
const fetchHistory = vi.fn();
const fetchDispatches = vi.fn();

vi.mock("@/features/host/api/host-session-record-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/host/api/host-session-record-api")>(),
  fetchHostSessionRecordEditor: (...args: unknown[]) => fetchRecordEditor(...args),
  fetchHostSessionHistory: (...args: unknown[]) => fetchHistory(...args),
}));

vi.mock("@/features/host/api/host-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/host/api/host-api")>(),
  fetchManualNotificationDispatches: (...args: unknown[]) => fetchDispatches(...args),
}));

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const context = { clubSlug: "reading-sai" } as const;

describe("host meeting panel queries", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not fetch unopened heavy panels and enables only the current local task", async () => {
    fetchRecordEditor.mockResolvedValue({ sessionId: "session-1" });
    fetchHistory.mockResolvedValue({ items: [], nextCursor: null });
    fetchDispatches.mockResolvedValue({ items: [], nextCursor: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result, rerender } = renderHook(
      ({ task }) => useHostMeetingPanelQueries({
        task,
        sessionId: "session-1",
        context,
      }),
      {
        initialProps: { task: "overview" as const },
        wrapper: wrapper(client),
      },
    );

    expect(result.current.record.kind).toBe("loading");
    expect(fetchRecordEditor).not.toHaveBeenCalled();
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(fetchDispatches).not.toHaveBeenCalled();

    rerender({ task: "records" });
    await waitFor(() => expect(result.current.record.kind).toBe("ready"));

    expect(fetchRecordEditor).toHaveBeenCalledTimes(1);
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(fetchDispatches).not.toHaveBeenCalled();
  });

  it("keeps a failed history query unavailable instead of presenting an empty history", async () => {
    fetchRecordEditor.mockResolvedValue({ sessionId: "session-1", draft: null });
    fetchHistory.mockRejectedValue(new Error("history unavailable"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useHostMeetingPanelQueries({ task: "history", sessionId: "session-1", context }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.history.kind).toBe("unavailable"));
    await waitFor(() => expect(result.current.historyAuthority.kind).toBe("ready"));
    expect(fetchRecordEditor).toHaveBeenCalledTimes(1);
    expect(fetchDispatches).not.toHaveBeenCalled();
  });

  it("loads record authority with history so restore uses the current draft revision", async () => {
    fetchRecordEditor.mockResolvedValue({
      sessionId: "session-1",
      draft: { draftRevision: 7 },
    });
    fetchHistory.mockResolvedValue({ items: [{ id: "history-1" }], nextCursor: null });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useHostMeetingPanelQueries({ task: "history", sessionId: "session-1", context }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.historyAuthority.kind).toBe("ready"));
    expect(result.current.historyAuthority).toMatchObject({
      kind: "ready",
      data: { draft: { draftRevision: 7 } },
    });
    expect(fetchRecordEditor).toHaveBeenCalledTimes(1);
    expect(fetchHistory).toHaveBeenCalledTimes(1);
  });

  it("distinguishes known-empty and stale-cached data with a retry and observed timestamp", () => {
    const retry = vi.fn();

    expect(panelLoadStateFromQuery({
      data: { items: [], nextCursor: null },
      dataUpdatedAt: 0,
      isError: false,
      isFetching: false,
      isPending: false,
      refetch: retry,
    }, (page) => page.items.length === 0)).toEqual({
      kind: "known-empty",
      data: { items: [], nextCursor: null },
    });

    expect(panelLoadStateFromQuery({
      data: { items: [{ id: "history-1" }], nextCursor: null },
      dataUpdatedAt: Date.parse("2026-08-25T01:02:03.000Z"),
      isError: false,
      isFetching: true,
      isPending: false,
      refetch: retry,
    }, (page) => page.items.length === 0)).toEqual({
      kind: "stale-cached",
      data: { items: [{ id: "history-1" }], nextCursor: null },
      observedAt: "2026-08-25T01:02:03.000Z",
      retry: expect.any(Function),
    });
  });
});
