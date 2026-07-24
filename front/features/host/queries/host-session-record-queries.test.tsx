import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/host/api/host-session-record-api", () => ({
  applyHostSessionRecord: vi.fn(),
  fetchHostSessionHistory: vi.fn(),
  fetchHostSessionRecordEditor: vi.fn(),
  fetchHostSessionRecordCapabilities: vi.fn(),
  fetchHostSessionRecordLedger: vi.fn(),
  saveHostSessionRecordDraft: vi.fn(),
}));

import {
  HostSessionRecordApplyPreviewResponseSchema,
  HostSessionRecordApplyResultResponseSchema,
} from "@/features/host/api/host-session-record-contracts";
import {
  applyHostSessionRecord,
  fetchHostSessionHistory,
  fetchHostSessionRecordEditor,
  fetchHostSessionRecordLedger,
  saveHostSessionRecordDraft,
} from "@/features/host/api/host-session-record-api";
import { hostSessionKeys } from "./host-session-queries";
import {
  hostSessionRecordEditorQuery,
  hostSessionRecordHistoryQuery,
  hostSessionRecordKeys,
  hostSessionRecordLedgerQuery,
  useApplyHostSessionRecordMutation,
  useSaveHostSessionRecordDraftMutation,
} from "./host-session-record-queries";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

function cacheState(client: QueryClient) {
  return client.getQueryCache().getAll().map((query) => ({
    queryKey: query.queryKey,
    data: query.state.data,
    isInvalidated: query.state.isInvalidated,
  }));
}

function draft() {
  return {
    sessionId: "session-28",
    baseLiveRevision: 2,
    draftRevision: 3,
    source: "MANUAL" as const,
    restoredFromRevisionId: null,
    snapshot: {
      schema: "readmates-session-record:v1",
      visibility: "MEMBER" as const,
      publicationSummary: "함께 읽은 기록",
      highlights: [],
      oneLineReviews: [],
      feedbackDocument: { fileName: "session-28.md", title: "피드백", markdown: "# 피드백" },
    },
    updatedAt: "2026-07-23T10:00:00+09:00",
  };
}

function editor() {
  return {
    sessionId: "session-28",
    liveRevision: 2,
    liveSnapshot: draft().snapshot,
    draft: null,
    draftLiveBaseStale: false,
    validationSummary: { valid: true, issues: [] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("host session record queries", () => {
  it("accepts the content-only preview and composer apply contracts", () => {
    expect(HostSessionRecordApplyPreviewResponseSchema.parse({
      eventType: "SESSION_RECORD_UPDATED",
      expectedDraftHash: "a".repeat(64),
    })).toEqual({
      eventType: "SESSION_RECORD_UPDATED",
      expectedDraftHash: "a".repeat(64),
    });
    expect(HostSessionRecordApplyResultResponseSchema.parse({
      revisionId: "revision-3",
      liveRevision: 3,
      composer: {
        sessionId: "session-28",
        eventType: "SESSION_RECORD_UPDATED",
        contentRevision: "b".repeat(64),
      },
    })).toMatchObject({
      revisionId: "revision-3",
      composer: { eventType: "SESSION_RECORD_UPDATED" },
    });
  });

  it("uses normalized club-scoped keys", () => {
    const context = { clubSlug: "reading-sai" };

    expect(hostSessionRecordKeys.scope(context)).toEqual(["host", "session-records", "reading-sai"]);
    expect(hostSessionRecordLedgerQuery(
      { search: "  모비 딕  ", needsAttention: true, page: { limit: 50 } },
      context,
    ).queryKey).toEqual(hostSessionRecordLedgerQuery(
      { search: "모비 딕", state: null, recordStatus: null, needsAttention: true, page: { limit: 50, cursor: null } },
      context,
    ).queryKey);
    expect(hostSessionRecordHistoryQuery("session-28", {}, context).queryKey).toEqual(
      hostSessionRecordHistoryQuery("session-28", undefined, context).queryKey,
    );
  });

  it("writes scoped ledger, editor, and history responses to normalized cache keys", async () => {
    const ledgerResponse = {
      items: [],
      nextCursor: null,
      summary: {
        needsAttentionCount: 0,
        incompletePublishedCount: 0,
        draftCount: 0,
      },
    };
    const editorResponse = editor();
    const historyResponse = { items: [], nextCursor: null };
    vi.mocked(fetchHostSessionRecordLedger).mockResolvedValue(ledgerResponse);
    vi.mocked(fetchHostSessionRecordEditor).mockResolvedValue(editorResponse);
    vi.mocked(fetchHostSessionHistory).mockResolvedValue(historyResponse);
    const context = { clubSlug: "reading-sai" };
    const { client } = createWrapper();
    const ledger = hostSessionRecordLedgerQuery({
      search: "  모비   딕  ",
      page: { limit: 50 },
    }, context);
    const editorOptions = hostSessionRecordEditorQuery("session-28", context);
    const history = hostSessionRecordHistoryQuery("session-28", { limit: 20 }, context);

    await Promise.all([
      client.fetchQuery(ledger),
      client.fetchQuery(editorOptions),
      client.fetchQuery(history),
    ]);

    expect(ledger.queryKey).toEqual(hostSessionRecordKeys.ledger({
      search: "모비 딕",
      state: null,
      recordStatus: null,
      needsAttention: null,
      page: { limit: 50, cursor: null },
    }, context));
    expect(editorOptions.queryKey).toEqual(hostSessionRecordKeys.editor("session-28", context));
    expect(history.queryKey).toEqual(hostSessionRecordKeys.history("session-28", { limit: 20 }, context));
    expect(fetchHostSessionRecordLedger).toHaveBeenCalledWith({
      search: "모비 딕",
      state: null,
      recordStatus: null,
      needsAttention: null,
      page: { limit: 50, cursor: null },
    }, context);
    expect(fetchHostSessionRecordEditor).toHaveBeenCalledWith("session-28", context);
    expect(fetchHostSessionHistory).toHaveBeenCalledWith("session-28", { limit: 20 }, context);
    expect(client.getQueryData(ledger.queryKey)).toEqual(ledgerResponse);
    expect(client.getQueryData(editorOptions.queryKey)).toEqual(editorResponse);
    expect(client.getQueryData(history.queryKey)).toEqual(historyResponse);
  });

  it("updates the editor cache after a successful draft save", async () => {
    vi.mocked(saveHostSessionRecordDraft).mockResolvedValue(draft());
    const context = { clubSlug: "reading-sai" };
    const { client, Wrapper } = createWrapper();
    client.setQueryData(hostSessionRecordKeys.editor("session-28", context), editor());
    const { result } = renderHook(() => useSaveHostSessionRecordDraftMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-28",
        request: { expectedDraftRevision: null, snapshot: draft().snapshot },
      });
    });

    expect(client.getQueryData(hostSessionRecordKeys.editor("session-28", context))).toMatchObject({
      liveRevision: 2,
      liveSnapshot: draft().snapshot,
      draft: { draftRevision: 3 },
      draftLiveBaseStale: false,
    });
  });

  it("leaves the editor cache unchanged when draft save fails", async () => {
    vi.mocked(saveHostSessionRecordDraft).mockRejectedValue(new Error("draft conflict"));
    const context = { clubSlug: "reading-sai" };
    const { client, Wrapper } = createWrapper();
    client.setQueryData(hostSessionRecordKeys.editor("session-28", context), editor());
    const before = cacheState(client);
    const { result } = renderHook(() => useSaveHostSessionRecordDraftMutation(context), { wrapper: Wrapper });

    await expect(result.current.mutateAsync({
      sessionId: "session-28",
      request: { expectedDraftRevision: null, snapshot: draft().snapshot },
    })).rejects.toThrow("draft conflict");

    expect(cacheState(client)).toEqual(before);
  });

  it("invalidates every seeded club-scoped live surface after apply", async () => {
    vi.mocked(applyHostSessionRecord).mockResolvedValue({
      revisionId: "revision-3",
      liveRevision: 3,
      composer: {
        sessionId: "session-28",
        eventType: "SESSION_RECORD_UPDATED",
        contentRevision: "b".repeat(64),
      },
    });
    const context = { clubSlug: "reading-sai" };
    const { client, Wrapper } = createWrapper();
    const editorKey = hostSessionRecordKeys.editor("session-28", context);
    const ledgerKey = hostSessionRecordKeys.ledger({ page: { limit: 50 } }, context);
    const historyKey = hostSessionRecordKeys.history("session-28", { limit: 20 }, context);
    const dashboardKey = hostSessionKeys.dashboard(context);
    const otherClubEditorKey = hostSessionRecordKeys.editor("session-28", { clubSlug: "other-club" });
    client.setQueryData(editorKey, editor());
    client.setQueryData(ledgerKey, { items: ["session-28"] });
    client.setQueryData(historyKey, { items: ["revision-2"] });
    client.setQueryData(dashboardKey, { sessions: ["session-28"] });
    client.setQueryData(otherClubEditorKey, { sessionId: "session-28", marker: "other-club" });
    const invalidateMemberAndPublicSurfaces = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useApplyHostSessionRecordMutation(context, invalidateMemberAndPublicSurfaces),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-28",
        request: {
          applyRequestId: "apply-request-1",
          expectedDraftRevision: 3,
          expectedLiveRevision: 2,
          expectedDraftHash: "a".repeat(64),
        },
      });
    });

    expect(client.getQueryState(editorKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(ledgerKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(historyKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(dashboardKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherClubEditorKey)?.isInvalidated).toBe(false);
    expect(client.getQueryData(editorKey)).toEqual(editor());
    expect(client.getQueryData(ledgerKey)).toEqual({ items: ["session-28"] });
    expect(client.getQueryData(historyKey)).toEqual({ items: ["revision-2"] });
    expect(invalidateMemberAndPublicSurfaces).toHaveBeenCalledWith({
      sessionId: "session-28",
      clubSlug: "reading-sai",
    });
  });

  it("leaves record and dashboard caches unchanged when apply fails", async () => {
    vi.mocked(applyHostSessionRecord).mockRejectedValue(new Error("apply conflict"));
    const context = { clubSlug: "reading-sai" };
    const { client, Wrapper } = createWrapper();
    client.setQueryData(hostSessionRecordKeys.editor("session-28", context), editor());
    client.setQueryData(
      hostSessionRecordKeys.ledger({ page: { limit: 50 } }, context),
      { items: ["session-28"] },
    );
    client.setQueryData(hostSessionKeys.dashboard(context), { sessions: ["session-28"] });
    const before = cacheState(client);
    const invalidateMemberAndPublicSurfaces = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useApplyHostSessionRecordMutation(context, invalidateMemberAndPublicSurfaces),
      { wrapper: Wrapper },
    );

    await expect(result.current.mutateAsync({
      sessionId: "session-28",
      request: {
        applyRequestId: "apply-request-1",
        expectedDraftRevision: 3,
        expectedLiveRevision: 2,
        expectedDraftHash: "a".repeat(64),
      },
    })).rejects.toThrow("apply conflict");

    expect(cacheState(client)).toEqual(before);
    expect(invalidateMemberAndPublicSurfaces).not.toHaveBeenCalled();
  });

  it("requires and invokes cross-feature invalidation for unscoped apply", async () => {
    vi.mocked(applyHostSessionRecord).mockResolvedValue({
      revisionId: "revision-3",
      liveRevision: 3,
      composer: {
        sessionId: "session-28",
        eventType: "SESSION_RECORD_UPDATED",
        contentRevision: "b".repeat(64),
      },
    });
    const { Wrapper } = createWrapper();
    const invalidateMemberAndPublicSurfaces = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useApplyHostSessionRecordMutation(undefined, invalidateMemberAndPublicSurfaces),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-28",
        request: {
          applyRequestId: "apply-request-1",
          expectedDraftRevision: 3,
          expectedLiveRevision: 2,
          expectedDraftHash: "a".repeat(64),
        },
      });
    });

    expect(invalidateMemberAndPublicSurfaces).toHaveBeenCalledWith({
      sessionId: "session-28",
      clubSlug: undefined,
    });
  });
});
