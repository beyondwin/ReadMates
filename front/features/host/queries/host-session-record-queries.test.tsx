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
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("host session record queries", () => {
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

  it("calls the scoped API wrappers from query options", async () => {
    vi.mocked(fetchHostSessionRecordLedger).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(fetchHostSessionRecordEditor).mockResolvedValue({} as never);
    vi.mocked(fetchHostSessionHistory).mockResolvedValue({ items: [], nextCursor: null });
    const context = { clubSlug: "reading-sai" };
    const ledger = hostSessionRecordLedgerQuery({
      search: "  모비   딕  ",
      page: { limit: 50 },
    }, context);
    const editor = hostSessionRecordEditorQuery("session-28", context);
    const history = hostSessionRecordHistoryQuery("session-28", { limit: 20 }, context);

    await ledger.queryFn?.({} as never);
    await editor.queryFn?.({} as never);
    await history.queryFn?.({} as never);

    expect(fetchHostSessionRecordLedger).toHaveBeenCalledWith({
      search: "모비 딕",
      state: null,
      recordStatus: null,
      needsAttention: null,
      page: { limit: 50, cursor: null },
    }, context);
    expect(fetchHostSessionRecordEditor).toHaveBeenCalledWith("session-28", context);
    expect(fetchHostSessionHistory).toHaveBeenCalledWith("session-28", { limit: 20 }, context);
  });

  it("updates the editor cache after a successful draft save", async () => {
    vi.mocked(saveHostSessionRecordDraft).mockResolvedValue(draft());
    const context = { clubSlug: "reading-sai" };
    const { client, Wrapper } = createWrapper();
    client.setQueryData(hostSessionRecordKeys.editor("session-28", context), {
      sessionId: "session-28",
      liveRevision: 2,
      liveSnapshot: draft().snapshot,
      draft: null,
      draftLiveBaseStale: false,
      validationSummary: { valid: true, issues: [] },
    });
    const { result } = renderHook(() => useSaveHostSessionRecordDraftMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-28",
        request: { expectedDraftRevision: null, snapshot: draft().snapshot },
      });
    });

    expect(client.getQueryData(hostSessionRecordKeys.editor("session-28", context))).toMatchObject({
      draft: { draftRevision: 3 },
    });
  });

  it("invalidates all club-scoped live surfaces after apply", async () => {
    vi.mocked(applyHostSessionRecord).mockResolvedValue({
      revisionId: "revision-3",
      liveRevision: 3,
      decisionId: "decision-1",
      notificationDecision: "SKIP",
      eventId: null,
    });
    const context = { clubSlug: "reading-sai" };
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const invalidateMemberAndPublicSurfaces = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useApplyHostSessionRecordMutation(context, invalidateMemberAndPublicSurfaces),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-28",
        request: {
          previewId: "preview-1",
          expectedDraftRevision: 3,
          expectedLiveRevision: 2,
          notificationDecision: "SKIP",
        },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostSessionRecordKeys.editor("session-28", context),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostSessionRecordKeys.ledgers(context),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostSessionRecordKeys.historyRoot("session-28", context),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.dashboard(context),
    });
    expect(invalidateMemberAndPublicSurfaces).toHaveBeenCalledWith({
      sessionId: "session-28",
      clubSlug: "reading-sai",
    });
  });

  it("requires and invokes cross-feature invalidation for unscoped apply", async () => {
    vi.mocked(applyHostSessionRecord).mockResolvedValue({
      revisionId: "revision-3",
      liveRevision: 3,
      decisionId: "decision-1",
      notificationDecision: "SKIP",
      eventId: null,
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
          previewId: "preview-1",
          expectedDraftRevision: 3,
          expectedLiveRevision: 2,
          notificationDecision: "SKIP",
        },
      });
    });

    expect(invalidateMemberAndPublicSurfaces).toHaveBeenCalledWith({
      sessionId: "session-28",
      clubSlug: undefined,
    });
  });
});
