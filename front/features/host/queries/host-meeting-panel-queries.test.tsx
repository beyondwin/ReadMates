import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  observeHostMeetingRecordReadiness,
  panelLoadStateFromQuery,
  useHostMeetingPanelQueries,
} from "./host-meeting-panel-queries";
import { hostSessionRecordEditorQuery } from "./host-session-record-queries";
import type { HostSessionRecordEditor } from "@/features/host/api/host-session-record-contracts";
import type { HostMeetingTask } from "@/features/host/model/host-session-workspace-model";

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
const OBSERVED_AT = "2026-08-25T01:02:03.000Z";

function editor(overrides: Partial<HostSessionRecordEditor> = {}): HostSessionRecordEditor {
  return {
    sessionId: "session-1",
    liveRevision: 0,
    liveSessionUpdatedAt: "2026-08-25T00:00:00.000Z",
    liveSnapshot: {
      schema: "readmates-session-record:v1",
      visibility: "MEMBER",
      publicationSummary: "",
      highlights: [],
      oneLineReviews: [],
      feedbackDocument: { fileName: "", title: "", markdown: "" },
    },
    draft: null,
    draftLiveBaseStale: false,
    validationSummary: { valid: true, issues: [] },
    ...overrides,
  };
}

function queryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("host meeting panel queries", () => {
  afterEach(() => {
    fetchRecordEditor.mockReset();
    fetchHistory.mockReset();
    fetchDispatches.mockReset();
  });

  it.each([
    ["DRAFT", false],
    ["OPEN", false],
  ] as const)("%s overview makes zero record calls", async (_state, recordPrerequisite) => {
    fetchRecordEditor.mockResolvedValue(editor());
    fetchHistory.mockResolvedValue({ items: [], nextCursor: null });
    fetchDispatches.mockResolvedValue({ items: [], nextCursor: null });
    const client = queryClient();

    const { result } = renderHook(
      () => useHostMeetingPanelQueries({
        task: "overview",
        sessionId: "session-1",
        context,
        recordPrerequisite,
      }),
      { wrapper: wrapper(client) },
    );

    expect(result.current.record.kind).toBe("loading");
    expect(result.current.recordReadiness).toEqual({ status: "not-required" });
    expect(fetchRecordEditor).not.toHaveBeenCalled();
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(fetchDispatches).not.toHaveBeenCalled();
  });

  it.each([
    ["CLOSED", true],
    ["PUBLISHED", true],
  ] as const)("%s overview makes one editor call and leaves history and dispatch unopened", async (_state, recordPrerequisite) => {
    fetchRecordEditor.mockResolvedValue(editor({ liveRevision: 2 }));
    fetchHistory.mockResolvedValue({ items: [], nextCursor: null });
    fetchDispatches.mockResolvedValue({ items: [], nextCursor: null });
    const client = queryClient();

    const { result } = renderHook(
      () => useHostMeetingPanelQueries({
        task: "overview",
        sessionId: "session-1",
        context,
        recordPrerequisite,
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.record.kind).toBe("ready"));

    expect(fetchRecordEditor).toHaveBeenCalledTimes(1);
    expect(fetchRecordEditor).toHaveBeenCalledWith("session-1", context);
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(fetchDispatches).not.toHaveBeenCalled();
    expect(result.current.recordReadiness.status).toBe("ready");
  });

  it("reuses the same editor query key when opening records after a CLOSED overview load", async () => {
    const recordEditor = editor({ liveRevision: 1 });
    fetchRecordEditor.mockResolvedValue(recordEditor);
    fetchHistory.mockResolvedValue({ items: [], nextCursor: null });
    fetchDispatches.mockResolvedValue({ items: [], nextCursor: null });
    const client = queryClient();
    const editorQuery = hostSessionRecordEditorQuery("session-1", context);

    const { result, rerender } = renderHook(
      ({ task }: { task: HostMeetingTask }) => useHostMeetingPanelQueries({
        task,
        sessionId: "session-1",
        context,
        recordPrerequisite: true,
      }),
      {
        initialProps: { task: "overview" },
        wrapper: wrapper(client),
      },
    );

    await waitFor(() => expect(result.current.record.kind).toBe("ready"));
    expect(client.getQueryData(editorQuery.queryKey)).toEqual(recordEditor);

    rerender({ task: "records" });
    await waitFor(() => expect(result.current.record.kind).toBe("ready"));

    expect(fetchRecordEditor).toHaveBeenCalledTimes(1);
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(fetchDispatches).not.toHaveBeenCalled();
    expect(client.getQueryData(editorQuery.queryKey)).toEqual(recordEditor);
  });

  it("does not fetch unopened heavy panels and enables only the current local task", async () => {
    fetchRecordEditor.mockResolvedValue({ sessionId: "session-1" });
    fetchHistory.mockResolvedValue({ items: [], nextCursor: null });
    fetchDispatches.mockResolvedValue({ items: [], nextCursor: null });
    const client = queryClient();

    const { result, rerender } = renderHook(
      ({ task }: { task: HostMeetingTask }) => useHostMeetingPanelQueries({
        task,
        sessionId: "session-1",
        context,
        recordPrerequisite: false,
      }),
      {
        initialProps: { task: "overview" },
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

  it("keeps last safe facts, observed time, and retry after a cached editor refetch fails", async () => {
    const recordEditor = editor({ liveRevision: 3, draftLiveBaseStale: true });
    fetchRecordEditor.mockResolvedValue(recordEditor);
    const client = queryClient();
    const editorQuery = hostSessionRecordEditorQuery("session-1", context);

    const { result } = renderHook(
      () => useHostMeetingPanelQueries({
        task: "overview",
        sessionId: "session-1",
        context,
        recordPrerequisite: true,
      }),
      { wrapper: wrapper(client) },
    );

    await waitFor(() => expect(result.current.recordReadiness.status).toBe("ready"));
    const observedAt = new Date(client.getQueryState(editorQuery.queryKey)?.dataUpdatedAt ?? 0).toISOString();
    fetchRecordEditor.mockRejectedValue(new Error("record editor unavailable"));

    await act(async () => {
      await client.refetchQueries({ queryKey: editorQuery.queryKey });
    });

    await waitFor(() => expect(result.current.record.kind).toBe("stale-cached"));
    expect(result.current.recordReadiness).toEqual({
      status: "stale",
      facts: {
        hasDraft: false,
        draftLiveBaseStale: true,
        validationIssueCount: 0,
        hasAppliedRecord: true,
        publicationReady: false,
      },
      observedAt,
      retryable: true,
    });
    expect(result.current.record.kind === "stale-cached" ? result.current.record.retry : null).toEqual(expect.any(Function));
    expect(fetchHistory).not.toHaveBeenCalled();
    expect(fetchDispatches).not.toHaveBeenCalled();
  });

  it("keeps a failed history query unavailable instead of presenting an empty history", async () => {
    fetchRecordEditor.mockResolvedValue({ sessionId: "session-1", draft: null });
    fetchHistory.mockRejectedValue(new Error("history unavailable"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(
      () => useHostMeetingPanelQueries({
        task: "history",
        sessionId: "session-1",
        context,
        recordPrerequisite: false,
      }),
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
      () => useHostMeetingPanelQueries({
        task: "history",
        sessionId: "session-1",
        context,
        recordPrerequisite: false,
      }),
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

  it("observes pending, ready, stale, and unavailable record readiness from the editor query", () => {
    const retry = vi.fn();
    const recordEditor = editor({ liveRevision: 2 });
    const snapshot = {
      data: undefined as HostSessionRecordEditor | undefined,
      dataUpdatedAt: 0,
      isError: false,
      isFetching: false,
      isPending: true,
      refetch: retry,
    };

    expect(observeHostMeetingRecordReadiness(snapshot, false)).toEqual({ status: "not-required" });
    expect(observeHostMeetingRecordReadiness(snapshot, true)).toEqual({ status: "pending" });

    expect(observeHostMeetingRecordReadiness({
      ...snapshot,
      data: recordEditor,
      dataUpdatedAt: Date.parse(OBSERVED_AT),
      isPending: false,
    }, true)).toEqual({
      status: "ready",
      observedAt: OBSERVED_AT,
      facts: {
        hasDraft: false,
        draftLiveBaseStale: false,
        validationIssueCount: 0,
        hasAppliedRecord: true,
        publicationReady: true,
      },
    });

    expect(observeHostMeetingRecordReadiness({
      ...snapshot,
      data: recordEditor,
      dataUpdatedAt: Date.parse(OBSERVED_AT),
      isError: true,
      isPending: false,
    }, true)).toEqual({
      status: "stale",
      observedAt: OBSERVED_AT,
      retryable: true,
      facts: {
        hasDraft: false,
        draftLiveBaseStale: false,
        validationIssueCount: 0,
        hasAppliedRecord: true,
        publicationReady: true,
      },
    });

    expect(observeHostMeetingRecordReadiness({
      ...snapshot,
      isError: true,
      isPending: false,
    }, true)).toEqual({
      status: "unavailable",
      observedAt: null,
      retryable: true,
    });
  });
});
