import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostSessionRequest, SessionImportRequest } from "@/features/host/api/host-contracts";
import { hostNotificationKeys } from "./host-notification-queries";

vi.mock("@/features/host/api/host-api", () => ({
  closeHostSession: vi.fn(),
  correctionPublishHostSession: vi.fn(),
  commitHostSessionImport: vi.fn(),
  createHostSession: vi.fn(),
  deleteHostSession: vi.fn(),
  openHostSession: vi.fn(),
  publishHostSession: vi.fn(),
  reopenHostSession: vi.fn(),
  returnHostSessionToDraft: vi.fn(),
  saveHostSessionAttendance: vi.fn(),
  saveHostSessionPublication: vi.fn(),
  saveHostSessionAccessScope: vi.fn(),
  saveHostSessionVisibility: vi.fn(),
  unpublishHostSession: vi.fn(),
  updateHostSession: vi.fn(),
  fetchHostSessionScheduleDefaults: vi.fn(),
  fetchHostSessionDetail: vi.fn(),
  fetchHostSessionClosingStatus: vi.fn(),
  fetchHostSessionTrash: vi.fn(),
  fetchHostSessionTrashList: vi.fn(),
  fetchHostMutationReconciliation: vi.fn(),
  retryHostPublicConvergence: vi.fn(),
  restoreHostSession: vi.fn(),
}));

import {
  closeHostSession,
  correctionPublishHostSession,
  commitHostSessionImport,
  createHostSession,
  deleteHostSession,
  fetchHostMutationReconciliation,
  retryHostPublicConvergence,
  fetchHostSessionDetail,
  fetchHostSessionClosingStatus,
  fetchHostSessionTrash,
  openHostSession,
  publishHostSession,
  reopenHostSession,
  returnHostSessionToDraft,
  restoreHostSession,
  saveHostSessionAttendance,
  saveHostSessionPublication,
  saveHostSessionAccessScope,
  saveHostSessionVisibility,
  unpublishHostSession,
  updateHostSession,
} from "@/features/host/api/host-api";
import {
  hostSessionKeys,
  publishDeletedHostSession,
  publishHostPublicConvergence,
  publishHostSessionAttendance,
  publishHostSessionCreated,
  publishHostSessionImport,
  publishHostSessionPublication,
  publishHostSessionResponse,
  publishHostSessionVisibility,
  publishRestoredHostSession,
  useCloseHostSessionMutation,
  useCorrectionPublishHostSessionMutation,
  useCommitHostSessionImportMutation,
  useCreateHostSessionMutation,
  useDeleteHostSessionMutation,
  useOpenHostSessionMutation,
  usePublishHostSessionMutation,
  useReopenHostSessionMutation,
  useReturnHostSessionToDraftMutation,
  useRetryHostPublicConvergenceMutation,
  useRestoreHostSessionMutation,
  useSaveHostSessionPublicationMutation,
  useSaveHostSessionAccessScopeMutation,
  useSaveHostSessionVisibilityMutation,
  useUnpublishHostSessionMutation,
  useUpdateHostSessionAttendanceMutation,
  useUpdateHostSessionMutation,
  executeHostMutationWithReconciliation,
} from "./host-session-queries";
import { hostSessionRecordKeys } from "./host-session-record-queries";
import { ReadmatesTransportError } from "@/shared/api/errors";

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, Wrapper };
}

const context = { clubSlug: "reading-sai" };
type CacheEntry = readonly [readonly unknown[], unknown];

function authoritativeDetail() {
  return {
    ...visibilityResult().session,
    versions: {
      sessionRevision: 3,
      exposureRevision: 2,
      participantSetRevision: 4,
      recordDraftRevision: 5,
      liveRecordRevision: 2,
      publicationRevision: 1,
    },
    attendanceSnapshotId: "attendance-snapshot-4",
    attendees: [{
      membershipId: "member-1",
      avatarKey: "banana-green-book",
      displayName: "멤버",
      accountName: "member",
      rsvpStatus: "GOING" as const,
      attendanceStatus: "UNKNOWN" as const,
      attendanceRevision: 6,
    }],
  };
}

function surfaceKeys() {
  return {
    detail: hostSessionKeys.detail("session-7", context),
    closingStatus: hostSessionKeys.closingStatus("session-7", context),
    list: hostSessionKeys.list({ limit: 50 }, context),
    dashboard: hostSessionKeys.dashboard(context),
    current: hostSessionKeys.current(context),
    manualDispatches: hostSessionKeys.manualDispatches({ sessionId: "session-7" }, context),
    recordLedger: hostSessionRecordKeys.ledger({ page: { limit: 50 } }, context),
    recordAttention: hostSessionRecordKeys.attentionPages(context),
    recordEditor: hostSessionRecordKeys.editor("session-7", context),
    recordHistory: hostSessionRecordKeys.history("session-7", { limit: 20 }, context),
    otherClubDetail: hostSessionKeys.detail("session-7", { clubSlug: "other-club" }),
    otherClubRecordLedger: hostSessionRecordKeys.ledger(
      { page: { limit: 50 } },
      { clubSlug: "other-club" },
    ),
  };
}

function seedSurfaces(client: QueryClient) {
  const keys = surfaceKeys();
  const entries = {
    detail: [keys.detail, authoritativeDetail()],
    closingStatus: [keys.closingStatus, {
      session: {
        sessionRevision: 3,
        participantSetRevision: 4,
        attendanceSnapshotId: "attendance-snapshot-4",
      },
    }],
    list: [keys.list, { surface: "list", items: ["session-7"] }],
    dashboard: [keys.dashboard, { surface: "dashboard", sessions: ["session-7"] }],
    current: [keys.current, { surface: "current", sessionId: "session-7" }],
    manualDispatches: [keys.manualDispatches, { surface: "manual-dispatches", items: ["dispatch-1"] }],
    recordLedger: [keys.recordLedger, { surface: "record-ledger", items: ["session-7"] }],
    recordAttention: [keys.recordAttention, { surface: "record-attention", pages: ["session-7"] }],
    recordEditor: [keys.recordEditor, { surface: "record-editor", sessionId: "session-7" }],
    recordHistory: [keys.recordHistory, { surface: "record-history", sessionId: "session-7" }],
    otherClubDetail: [keys.otherClubDetail, { surface: "detail", sessionId: "other-club-session-7" }],
    otherClubRecordLedger: [
      keys.otherClubRecordLedger,
      { surface: "record-ledger", items: ["other-club-session-7"] },
    ],
  } as const satisfies Record<string, CacheEntry>;
  for (const [key, value] of Object.values(entries)) {
    client.setQueryData(key, value);
  }
  return { entries, keys };
}

function cacheState(client: QueryClient) {
  return client.getQueryCache().getAll().map((query) => ({
    queryKey: query.queryKey,
    data: query.state.data,
    isInvalidated: query.state.isInvalidated,
  }));
}

function expectInvalidated(client: QueryClient, entries: readonly CacheEntry[]) {
  for (const [key, value] of entries) {
    expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    expect(client.getQueryData(key), JSON.stringify(key)).toEqual(value);
  }
}

function expectFresh(client: QueryClient, entries: readonly CacheEntry[]) {
  for (const [key, value] of entries) {
    expect(client.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    expect(client.getQueryData(key), JSON.stringify(key)).toEqual(value);
  }
}

const sessionRequest: HostSessionRequest = {
  title: "No.8 모임",
  bookTitle: "다음 책",
  bookAuthor: "테스트 저자",
  date: "2026-06-20",
};

const importRequest: SessionImportRequest = {
  expectedDraftRevision: null,
  format: "readmates-session-import:v1",
  session: {
    number: 7,
    bookTitle: "테스트 책",
    meetingDate: "2026-05-20",
  },
  publication: {
    summary: "모임 요약",
  },
  highlights: [],
  oneLineReviews: [],
  feedbackDocument: {
    fileName: "session-7.md",
    markdown: "# 모임 기록",
  },
  recordVisibility: "MEMBER",
};

function visibilityResult() {
  return {
    session: {
      sessionId: "session-7",
      sessionNumber: 7,
      title: "함께 읽기",
      bookTitle: "모비 딕",
      bookAuthor: "허먼 멜빌",
      bookLink: null,
      bookImageUrl: null,
      date: "2026-07-23",
      startTime: "19:00",
      endTime: "21:00",
      questionDeadlineAt: "2026-07-22T23:59:00+09:00",
      locationLabel: "온라인",
      meetingUrl: null,
      meetingPasscode: null,
      publication: null,
      state: "OPEN" as const,
      versions: {
        sessionRevision: 3,
        exposureRevision: 2,
        participantSetRevision: 4,
        recordDraftRevision: null,
        liveRecordRevision: 2,
        publicationRevision: 1,
      },
      attendanceSnapshotId: "attendance-snapshot-4",
      attendees: [],
      feedbackDocument: {
        uploaded: false,
        fileName: null,
        uploadedAt: null,
      },
      visibility: "MEMBER" as const,
    },
    composer: {
      sessionId: "session-7",
      eventType: "NEXT_BOOK_PUBLISHED" as const,
      contentRevision: "b".repeat(64),
    },
  };
}

beforeEach(() => {
  vi.mocked(createHostSession).mockReset();
  vi.mocked(updateHostSession).mockReset();
  vi.mocked(deleteHostSession).mockReset();
  vi.mocked(openHostSession).mockReset();
  vi.mocked(closeHostSession).mockReset();
  vi.mocked(correctionPublishHostSession).mockReset();
  vi.mocked(publishHostSession).mockReset();
  vi.mocked(reopenHostSession).mockReset();
  vi.mocked(unpublishHostSession).mockReset();
  vi.mocked(returnHostSessionToDraft).mockReset();
  vi.mocked(restoreHostSession).mockReset();
  vi.mocked(saveHostSessionVisibility).mockReset();
  vi.mocked(saveHostSessionAccessScope).mockReset();
  vi.mocked(saveHostSessionPublication).mockReset();
  vi.mocked(saveHostSessionAttendance).mockReset();
  vi.mocked(commitHostSessionImport).mockReset();
  vi.mocked(fetchHostSessionDetail).mockReset().mockResolvedValue(authoritativeDetail());
  vi.mocked(fetchHostSessionClosingStatus).mockReset().mockResolvedValue({
    session: {
      sessionRevision: 3,
      participantSetRevision: 4,
      attendanceSnapshotId: "attendance-snapshot-4",
    },
  } as never);
  vi.mocked(fetchHostSessionTrash).mockReset().mockResolvedValue({
    sessionId: "session-7",
    sessionNumber: 7,
    title: "함께 읽기",
    state: "DRAFT",
    deletedAt: "2026-08-21T10:00:00Z",
    purgeAfter: "2026-08-28T10:00:00Z",
    sessionRevision: 4,
  });
  vi.mocked(fetchHostMutationReconciliation).mockReset();
  vi.mocked(retryHostPublicConvergence).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("host session mutation hooks", () => {
  it("invalidates only the exact scoped convergence view after a bounded retry", async () => {
    const response = {
      convergenceId: "10000000-0000-4000-8000-000000000001",
      originResult: "APPLIED" as const,
      committedGeneration: 7,
      status: "PENDING" as const,
      lastAttemptAt: "2026-08-26T04:30:00Z",
      retryable: false,
    };
    vi.mocked(retryHostPublicConvergence).mockResolvedValue(response);
    const { client, Wrapper } = createWrapper();
    const exactKey = hostSessionKeys.convergence("session-7", context);
    const otherKey = hostSessionKeys.convergence("session-7", { clubSlug: "other-club" });
    client.setQueryData(exactKey, { ...response, status: "FAILED", retryable: true });
    client.setQueryData(otherKey, { ...response, status: "FAILED", retryable: true });
    const { result } = renderHook(() => useRetryHostPublicConvergenceMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: "session-7", convergenceId: response.convergenceId });
    });

    expect(retryHostPublicConvergence).toHaveBeenCalledWith("session-7", response.convergenceId, context);
    expect(client.getQueryState(exactKey)?.isInvalidated).toBe(false);
    await publishHostPublicConvergence(client, "session-7", context);
    expect(client.getQueryState(exactKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
  });

  it("reconciles correction publication with its exact operation, resource, key, and envelope", async () => {
    vi.mocked(correctionPublishHostSession)
      .mockRejectedValueOnce(new ReadmatesTransportError())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }) as never);
    vi.mocked(fetchHostMutationReconciliation).mockResolvedValueOnce({
      status: "NOT_EXECUTED",
      receipt: null,
      current: null,
      attendanceVersions: [],
      attendanceSnapshotId: null,
    });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCorrectionPublishHostSessionMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("session-7");
    });

    const firstEnvelope = vi.mocked(correctionPublishHostSession).mock.calls[0]?.[1];
    expect(firstEnvelope).toEqual({
      idempotencyKey: expect.any(String),
      expected: {
        sessionRevision: 3,
        recordDraftRevision: 5,
        liveRecordRevision: 2,
        exposureRevision: 2,
        publicationRevision: 1,
      },
      command: {},
    });
    expect(vi.mocked(correctionPublishHostSession).mock.calls[1]?.[1]).toBe(firstEnvelope);
    expect(fetchHostMutationReconciliation).toHaveBeenCalledWith(
      "SESSION_CORRECTION_PUBLISH",
      "session-7",
      firstEnvelope?.idempotencyKey,
      context,
    );
  });

  it("refetches authoritative detail after a committed correction publication response loss", async () => {
    vi.mocked(correctionPublishHostSession).mockRejectedValueOnce(new ReadmatesTransportError());
    vi.mocked(fetchHostMutationReconciliation).mockResolvedValueOnce({
      status: "COMMITTED",
      receipt: {
        resourceId: "session-7",
        projection: { attendanceSnapshotId: "att:" },
      } as never,
      current: null,
      attendanceVersions: null,
      attendanceSnapshotId: "att:",
    });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCorrectionPublishHostSessionMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("session-7");
    });

    expect(correctionPublishHostSession).toHaveBeenCalledTimes(1);
    expect(fetchHostSessionDetail).toHaveBeenCalledTimes(2);
    expect(fetchHostSessionDetail).toHaveBeenLastCalledWith("session-7", context);
  });

  it("refetches authoritative detail after COMMITTED response loss instead of trusting receipt projection", async () => {
    vi.mocked(openHostSession).mockRejectedValueOnce(new ReadmatesTransportError());
    vi.mocked(fetchHostMutationReconciliation).mockResolvedValueOnce({
      status: "COMMITTED",
      receipt: {
        resourceId: "session-7",
        projection: {
          attendanceSnapshotId: "att:",
          attendees: [{ membershipId: "stale-receipt-row" }],
        },
      } as never,
      current: null,
      attendanceVersions: null,
      attendanceSnapshotId: "att:",
    });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useOpenHostSessionMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("session-7");
    });

    expect(openHostSession).toHaveBeenCalledTimes(1);
    expect(fetchHostMutationReconciliation).toHaveBeenCalledTimes(1);
    expect(fetchHostSessionDetail).toHaveBeenCalledTimes(2);
    expect(fetchHostSessionDetail).toHaveBeenLastCalledWith("session-7", context);
  });

  it("reuses the exact idempotency envelope only after authoritative NOT_EXECUTED", async () => {
    const envelope = {
      idempotencyKey: "b6-response-loss-0001",
      expected: { sessionRevision: 3 },
      command: {},
    };
    const execute = vi.fn()
      .mockRejectedValueOnce(new ReadmatesTransportError())
      .mockResolvedValueOnce("retried");
    vi.mocked(fetchHostMutationReconciliation).mockResolvedValue({
      status: "NOT_EXECUTED",
      receipt: null,
      current: null,
      attendanceVersions: [],
      attendanceSnapshotId: null,
    });
    const states: string[] = [];

    await expect(executeHostMutationWithReconciliation({
      operation: "SESSION_OPEN",
      resourceSlot: "session-7",
      envelope,
      context,
      execute,
      acceptCommitted: () => "committed",
      onStateChange: (state) => states.push(state),
    })).resolves.toBe("retried");

    expect(execute).toHaveBeenNthCalledWith(1, envelope);
    expect(execute).toHaveBeenNthCalledWith(2, envelope);
    expect(fetchHostMutationReconciliation).toHaveBeenCalledWith(
      "SESSION_OPEN",
      "session-7",
      "b6-response-loss-0001",
      context,
    );
    expect(states).toEqual(["checking", "idle"]);
  });

  it("never retries a committed or pending response-loss result", async () => {
    const envelope = {
      idempotencyKey: "b6-response-loss-0002",
      expected: { sessionRevision: 3 },
      command: {},
    };
    const execute = vi.fn().mockRejectedValue(new ReadmatesTransportError());
    vi.mocked(fetchHostMutationReconciliation).mockResolvedValueOnce({
      status: "COMMITTED",
      receipt: {} as never,
      current: null,
      attendanceVersions: [],
      attendanceSnapshotId: null,
    });

    await expect(executeHostMutationWithReconciliation({
      operation: "SESSION_OPEN",
      resourceSlot: "session-7",
      envelope,
      context,
      execute,
      acceptCommitted: () => "committed",
    })).resolves.toBe("committed");
    expect(execute).toHaveBeenCalledTimes(1);

    vi.mocked(fetchHostMutationReconciliation).mockResolvedValueOnce({
      status: "PENDING",
      receipt: null,
      current: null,
      attendanceVersions: null,
      attendanceSnapshotId: null,
    });
    await expect(executeHostMutationWithReconciliation({
      operation: "SESSION_OPEN",
      resourceSlot: "session-7",
      envelope,
      context,
      execute,
      acceptCommitted: () => "committed",
    })).rejects.toMatchObject({ code: "HOST_MUTATION_PENDING" });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("invalidates lists and dashboard after a successful create response", async () => {
    vi.mocked(createHostSession).mockResolvedValue(new Response(JSON.stringify({ sessionId: "session-8" }), { status: 201 }) as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => useCreateHostSessionMutation(context), { wrapper: Wrapper });

    let created!: Response;
    await act(async () => { created = await result.current.mutateAsync(sessionRequest); });
    await publishHostSessionCreated(client, created, context);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createHostSession).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: expect.any(String),
      expected: {},
      command: sessionRequest,
    }), context);
    expectInvalidated(client, [entries.list, entries.dashboard]);
    expectFresh(client, [
      entries.detail,
      entries.closingStatus,
      entries.current,
      entries.manualDispatches,
      entries.recordLedger,
      entries.recordAttention,
      entries.recordEditor,
      entries.recordHistory,
      entries.otherClubDetail,
      entries.otherClubRecordLedger,
    ]);
  });

  it("allows default create consumers to start another request after an authoritative response", async () => {
    vi.mocked(createHostSession)
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionId: "session-8" }), { status: 201 }) as never)
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionId: "session-9" }), { status: 201 }) as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateHostSessionMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(sessionRequest);
      await result.current.mutateAsync({ ...sessionRequest, title: "No.9 모임" });
    });

    expect(createHostSession).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createHostSession).mock.calls[0]?.[0].idempotencyKey)
      .not.toBe(vi.mocked(createHostSession).mock.calls[1]?.[0].idempotencyKey);
  });

  it("leaves every seeded cache unchanged when create returns a non-ok response", async () => {
    vi.mocked(createHostSession).mockResolvedValue(new Response("bad request", { status: 400 }) as never);
    const { client, Wrapper } = createWrapper();
    seedSurfaces(client);
    const before = cacheState(client);
    const { result } = renderHook(() => useCreateHostSessionMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(sessionRequest);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cacheState(client)).toEqual(before);
  });

  it("keeps the exact create envelope while a delayed first commit is pending", async () => {
    vi.mocked(createHostSession).mockRejectedValueOnce(new ReadmatesTransportError());
    vi.mocked(fetchHostMutationReconciliation)
      .mockResolvedValueOnce({
        status: "PENDING",
        receipt: null,
        current: null,
        attendanceVersions: null,
        attendanceSnapshotId: null,
      })
      .mockResolvedValueOnce({
        status: "COMMITTED",
        receipt: { resourceId: "session-8" } as never,
        current: null,
        attendanceVersions: [],
        attendanceSnapshotId: null,
      });
    vi.mocked(fetchHostSessionDetail).mockResolvedValue(authoritativeDetail() as never);
    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useCreateHostSessionMutation(context, { retainUntilResolved: true }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await expect(result.current.mutateAsync(sessionRequest)).rejects.toMatchObject({
        code: "HOST_MUTATION_PENDING",
      });
    });
    const firstEnvelope = vi.mocked(createHostSession).mock.calls[0]?.[0];
    expect(result.current.hasPendingCreate).toBe(true);

    await act(async () => {
      await expect(result.current.mutateAsync({ ...sessionRequest, title: "새 key로 보내면 안 됨" }))
        .rejects.toMatchObject({ code: "HOST_MUTATION_PENDING" });
    });
    expect(createHostSession).toHaveBeenCalledTimes(1);

    let reconciled: Response | undefined;
    await act(async () => {
      reconciled = await result.current.reconcilePendingCreate();
    });
    expect(reconciled?.status).toBe(201);
    expect(fetchHostMutationReconciliation).toHaveBeenNthCalledWith(
      2,
      "SESSION_CREATE",
      "create",
      firstEnvelope?.idempotencyKey,
      context,
    );
    expect(createHostSession).toHaveBeenCalledTimes(1);

    act(() => result.current.resolvePendingCreate());
    expect(result.current.hasPendingCreate).toBe(false);
  });

  it("keeps the create envelope when reconciliation is unknown", async () => {
    vi.mocked(createHostSession).mockRejectedValueOnce(new ReadmatesTransportError());
    vi.mocked(fetchHostMutationReconciliation).mockRejectedValueOnce(new Error("malformed reconciliation"));
    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useCreateHostSessionMutation(context, { retainUntilResolved: true }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await expect(result.current.mutateAsync(sessionRequest)).rejects.toMatchObject({
        code: "HOST_MUTATION_PENDING",
      });
    });

    expect(result.current.hasPendingCreate).toBe(true);
    await act(async () => {
      await expect(result.current.mutateAsync({ ...sessionRequest, title: "새 요청 금지" }))
        .rejects.toMatchObject({ code: "HOST_MUTATION_PENDING" });
    });
    expect(createHostSession).toHaveBeenCalledTimes(1);
  });

  it("retries NOT_EXECUTED once with the retained create envelope and key", async () => {
    vi.mocked(createHostSession)
      .mockRejectedValueOnce(new ReadmatesTransportError())
      .mockResolvedValueOnce(new Response(JSON.stringify({ sessionId: "session-8" }), { status: 201 }) as never);
    vi.mocked(fetchHostMutationReconciliation)
      .mockResolvedValueOnce({
        status: "PENDING",
        receipt: null,
        current: null,
        attendanceVersions: null,
        attendanceSnapshotId: null,
      })
      .mockResolvedValueOnce({
        status: "NOT_EXECUTED",
        receipt: null,
        current: null,
        attendanceVersions: [],
        attendanceSnapshotId: null,
      });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useCreateHostSessionMutation(context, { retainUntilResolved: true }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await expect(result.current.mutateAsync(sessionRequest)).rejects.toMatchObject({
        code: "HOST_MUTATION_PENDING",
      });
    });
    const firstEnvelope = vi.mocked(createHostSession).mock.calls[0]?.[0];

    let reconciled: Response | undefined;
    await act(async () => {
      reconciled = await result.current.reconcilePendingCreate();
    });
    expect(reconciled?.status).toBe(201);
    expect(createHostSession).toHaveBeenNthCalledWith(2, firstEnvelope, context);
    expect(createHostSession).toHaveBeenCalledTimes(2);
  });

  it("invalidates detail, lists, dashboard, and current session after update", async () => {
    vi.mocked(updateHostSession).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => useUpdateHostSessionMutation(context), { wrapper: Wrapper });

    let updated!: Response;
    await act(async () => { updated = await result.current.mutateAsync({ sessionId: "session-7", request: sessionRequest }); });
    await publishHostSessionResponse(client, updated, "session-7", context);

    expect(updateHostSession).toHaveBeenCalledWith("session-7", expect.objectContaining({
      idempotencyKey: expect.any(String),
      expected: { sessionRevision: 3 },
      command: sessionRequest,
    }), context);
    expectInvalidated(client, [
      entries.detail,
      entries.closingStatus,
      entries.list,
      entries.dashboard,
      entries.current,
      entries.recordLedger,
      entries.recordAttention,
      entries.recordEditor,
      entries.recordHistory,
    ]);
    expectFresh(client, [
      entries.manualDispatches,
      entries.otherClubDetail,
      entries.otherClubRecordLedger,
    ]);
  });

  it("does not remove detail or invalidate when delete fails", async () => {
    vi.mocked(deleteHostSession).mockRejectedValue(new Error("conflict"));
    const { client, Wrapper } = createWrapper();
    seedSurfaces(client);
    const before = cacheState(client);
    const { result } = renderHook(() => useDeleteHostSessionMutation(context), { wrapper: Wrapper });

    await expect(act(async () => {
      await result.current.mutateAsync("session-7");
    })).rejects.toThrow("conflict");

    expect(cacheState(client)).toEqual(before);
  });

  it("removes deleted detail cache and invalidates dependent surfaces after delete", async () => {
    vi.mocked(deleteHostSession).mockResolvedValue({
      sessionId: "session-7",
      sessionNumber: 7,
      title: "No.7 모임",
      state: "DRAFT",
      trashed: true,
      deletedAt: "2026-08-21T10:00:00Z",
      purgeAfter: "2026-08-28T10:00:00Z",
      sessionRevision: 4,
      counts: {
        participants: 0,
        rsvpResponses: 0,
        questions: 0,
        checkins: 0,
        oneLineReviews: 0,
        longReviews: 0,
        highlights: 0,
        publications: 0,
        feedbackReports: 0,
        feedbackDocuments: 0,
      },
    });
    const { client, Wrapper } = createWrapper();
    const { entries, keys } = seedSurfaces(client);
    const { result } = renderHook(() => useDeleteHostSessionMutation(context), { wrapper: Wrapper });

    let deleted!: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => { deleted = await result.current.mutateAsync("session-7"); });
    await publishDeletedHostSession(client, deleted, "session-7", context);

    expect(deleteHostSession).toHaveBeenCalledWith("session-7", expect.objectContaining({
      idempotencyKey: expect.any(String),
      expected: { sessionRevision: 3 },
      command: {},
    }), context);
    expect(client.getQueryData(keys.detail)).toBeUndefined();
    expect(client.getQueryState(keys.detail)).toBeUndefined();
    expectInvalidated(client, [
      entries.list,
      entries.dashboard,
      entries.current,
      entries.manualDispatches,
      entries.recordLedger,
      entries.recordAttention,
    ]);
    expect(client.getQueryState(keys.recordEditor)).toBeUndefined();
    expect(client.getQueryState(keys.recordHistory)).toBeUndefined();
    expectFresh(client, [entries.closingStatus, entries.otherClubDetail, entries.otherClubRecordLedger]);
  });

  it("invalidates same-club record membership and record detail caches after trash restore", async () => {
    vi.mocked(restoreHostSession).mockResolvedValue(visibilityResult().session as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => useRestoreHostSessionMutation(context), { wrapper: Wrapper });

    let restored!: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => { restored = await result.current.mutateAsync("session-7"); });
    await publishRestoredHostSession(client, restored, "session-7", context);

    expectInvalidated(client, [entries.recordLedger, entries.recordAttention, entries.recordEditor, entries.recordHistory]);
    expectFresh(client, [entries.otherClubDetail, entries.otherClubRecordLedger]);
  });

  it.each([
    ["open", useOpenHostSessionMutation, openHostSession, false, undefined],
    ["close", useCloseHostSessionMutation, closeHostSession, true, undefined],
    ["publish", usePublishHostSessionMutation, publishHostSession, true, null],
    ["correction-publish", useCorrectionPublishHostSessionMutation, correctionPublishHostSession, true, {
      convergenceId: "10000000-0000-4000-8000-000000000001",
      originResult: "APPLIED",
      committedGeneration: 6,
      status: "SUCCEEDED",
      lastAttemptAt: "2026-08-26T04:20:00Z",
      retryable: false,
    }],
  ] as const)("invalidates session surfaces after %s", async (
    _name,
    hook,
    apiFn,
    expectsManualDispatches,
    staleConvergence,
  ) => {
    vi.mocked(apiFn).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const convergenceKey = hostSessionKeys.convergence("session-7", context);
    const otherConvergenceKey = hostSessionKeys.convergence("session-7", { clubSlug: "other-club" });
    if (staleConvergence !== undefined) {
      client.setQueryData(convergenceKey, staleConvergence);
      client.setQueryData(otherConvergenceKey, staleConvergence);
    }
    const { result } = renderHook(() => hook(context), { wrapper: Wrapper });

    let response!: Response;
    await act(async () => { response = await result.current.mutateAsync("session-7"); });
    await publishHostSessionResponse(client, response, "session-7", context, expectsManualDispatches);

    expect(apiFn).toHaveBeenCalledWith(
      "session-7",
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        expected: expect.any(Object),
        command: {},
      }),
      context,
    );
    expectInvalidated(client, [
      entries.detail,
      entries.closingStatus,
      entries.list,
      entries.dashboard,
      entries.current,
      entries.recordLedger,
      entries.recordAttention,
      entries.recordEditor,
      entries.recordHistory,
    ]);
    if (expectsManualDispatches) {
      expectInvalidated(client, [entries.manualDispatches]);
    } else {
      expectFresh(client, [entries.manualDispatches]);
    }
    expectFresh(client, [
      entries.otherClubDetail,
      entries.otherClubRecordLedger,
    ]);
    if (staleConvergence !== undefined) {
      expect(client.getQueryState(convergenceKey)?.isInvalidated).toBe(true);
      expect(client.getQueryData(convergenceKey)).toEqual(staleConvergence);
      expect(client.getQueryState(otherConvergenceKey)?.isInvalidated).toBe(false);
    }
  });

  it.each([
    ["reopen", useReopenHostSessionMutation, reopenHostSession, {
      convergenceId: "10000000-0000-4000-8000-000000000001",
      originResult: "APPLIED",
      committedGeneration: 6,
      status: "FAILED",
      lastAttemptAt: "2026-08-26T04:20:00Z",
      retryable: true,
    }],
    ["unpublish", useUnpublishHostSessionMutation, unpublishHostSession, null],
    ["return-to-draft", useReturnHostSessionToDraftMutation, returnHostSessionToDraft, undefined],
  ] as const)("invalidates session surfaces after reverse %s", async (_name, hook, apiFn, staleConvergence) => {
    const request = { reasonCode: "ACCIDENTAL_TRANSITION" as const };
    vi.mocked(apiFn).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const convergenceKey = hostSessionKeys.convergence("session-7", context);
    const otherConvergenceKey = hostSessionKeys.convergence("session-7", { clubSlug: "other-club" });
    if (staleConvergence !== undefined) {
      client.setQueryData(convergenceKey, staleConvergence);
      client.setQueryData(otherConvergenceKey, staleConvergence);
    }
    const { result } = renderHook(() => hook(context), { wrapper: Wrapper });

    let response!: Response;
    await act(async () => { response = await result.current.mutateAsync({ sessionId: "session-7", request }); });
    await publishHostSessionResponse(client, response, "session-7", context, true);

    expect(apiFn).toHaveBeenCalledWith("session-7", expect.objectContaining({
      idempotencyKey: expect.any(String),
      expected: { sessionRevision: 3 },
      command: request,
    }), context);
    expectInvalidated(client, [
      entries.detail,
      entries.closingStatus,
      entries.list,
      entries.dashboard,
      entries.current,
      entries.manualDispatches,
      entries.recordLedger,
      entries.recordAttention,
      entries.recordEditor,
      entries.recordHistory,
    ]);
    expectFresh(client, [
      entries.otherClubDetail,
      entries.otherClubRecordLedger,
    ]);
    if (staleConvergence !== undefined) {
      expect(client.getQueryState(convergenceKey)?.isInvalidated).toBe(true);
      expect(client.getQueryData(convergenceKey)).toEqual(staleConvergence);
      expect(client.getQueryState(otherConvergenceKey)?.isInvalidated).toBe(false);
    }
  });

  it("returns the visibility composer result and caches the updated session", async () => {
    vi.mocked(saveHostSessionVisibility).mockResolvedValue(visibilityResult());
    const { client, Wrapper } = createWrapper();
    const { entries, keys } = seedSurfaces(client);
    const detailKey = keys.detail;
    const manualOptionsKey = hostNotificationKeys.manualOptions(
      { sessionId: "session-7", page: { limit: 50 } },
      context,
    );
    client.setQueryData(manualOptionsKey, { contentRevision: "stale-before-publication" });
    const { result } = renderHook(() => useSaveHostSessionVisibilityMutation(context), { wrapper: Wrapper });

    let mutationResult: ReturnType<typeof visibilityResult> | undefined;
    await act(async () => {
      mutationResult = await result.current.mutateAsync({
        sessionId: "session-7",
        request: { visibility: "MEMBER" },
      });
    });

    expect(mutationResult).toEqual(visibilityResult());
    expect(saveHostSessionVisibility).toHaveBeenCalledWith(
      "session-7",
      { visibility: "MEMBER" },
      context,
    );
    await publishHostSessionVisibility(client, mutationResult!, "session-7", context);
    expect(client.getQueryData(detailKey)).toEqual(visibilityResult().session);
    expect(client.getQueryData(manualOptionsKey)).toBeUndefined();
    expectInvalidated(client, [entries.list, entries.dashboard, entries.recordLedger, entries.recordAttention, entries.recordEditor]);
    expectFresh(client, [
      [keys.detail, visibilityResult().session],
      entries.closingStatus,
      entries.current,
      entries.manualDispatches,
      entries.recordHistory,
      entries.otherClubDetail,
      entries.otherClubRecordLedger,
    ]);
  });

  it("invalidates manual dispatches after publication save", async () => {
    vi.mocked(saveHostSessionPublication).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => useSaveHostSessionPublicationMutation(context), { wrapper: Wrapper });

    let response!: Response;
    await act(async () => {
      response = await result.current.mutateAsync({
        sessionId: "session-7",
        request: { publicSummary: "요약", visibility: "MEMBER" },
      });
    });
    await publishHostSessionPublication(client, response, "session-7", context);

    expectInvalidated(client, [
      entries.detail,
      entries.list,
      entries.dashboard,
      entries.manualDispatches,
      entries.recordLedger,
      entries.recordAttention,
      entries.recordEditor,
    ]);
    expectFresh(client, [
      entries.closingStatus,
      entries.current,
      entries.recordHistory,
      entries.otherClubDetail,
      entries.otherClubRecordLedger,
    ]);
  });

  it("invalidates exact-club record projections after access-scope save", async () => {
    vi.mocked(saveHostSessionAccessScope).mockResolvedValue(visibilityResult() as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => useSaveHostSessionAccessScopeMutation(context), { wrapper: Wrapper });

    let accessResult!: ReturnType<typeof visibilityResult>;
    await act(async () => { accessResult = await result.current.mutateAsync({ sessionId: "session-7", request: { accessScope: "GUEST_READABLE" } }); });
    await publishHostSessionVisibility(client, accessResult, "session-7", context);

    expectInvalidated(client, [entries.list, entries.dashboard, entries.recordLedger, entries.recordAttention, entries.recordEditor]);
    expectFresh(client, [entries.recordHistory, entries.otherClubDetail, entries.otherClubRecordLedger]);
  });

  it("invalidates exact-club record audit projections after attendance update", async () => {
    vi.mocked(saveHostSessionAttendance).mockResolvedValue({
      sessionId: "session-7",
      count: 1,
    } as never);
    const refreshedDetail = {
      ...authoritativeDetail(),
      attendees: [{
        ...authoritativeDetail().attendees[0],
        attendanceStatus: "ATTENDED" as const,
        attendanceRevision: 7,
      }],
    };
    vi.mocked(fetchHostSessionDetail)
      .mockResolvedValueOnce(authoritativeDetail())
      .mockResolvedValueOnce(refreshedDetail);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const otherClubAttention = [
      hostSessionRecordKeys.attentionPages({ clubSlug: "other-club" }),
      { surface: "other-record-attention", pages: ["other-session-7"] },
    ] as const satisfies CacheEntry;
    client.setQueryData(...otherClubAttention);
    const { result } = renderHook(() => useUpdateHostSessionAttendanceMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-7",
        attendance: [{ membershipId: "member-1", attendanceStatus: "ATTENDED" }],
      });
    });

    expect(saveHostSessionAttendance).toHaveBeenCalledWith("session-7", expect.objectContaining({
      idempotencyKey: expect.any(String),
      expected: { rows: [{ membershipId: "member-1", attendanceRevision: 6 }] },
      command: { entries: [{
        membershipId: "member-1",
        attendanceStatus: "ATTENDED",
        expectedAttendanceRevision: 6,
      }] },
    }), context);
    await publishHostSessionAttendance(client, "session-7", [{ membershipId: "member-1", attendanceStatus: "ATTENDED" }], context);
    expect(fetchHostSessionDetail).toHaveBeenCalledWith("session-7", context);
    expectInvalidated(client, [
      entries.current,
      entries.recordHistory,
      entries.recordLedger,
      entries.recordAttention,
    ]);
    expect(client.getQueryState(entries.detail[0])?.isInvalidated).toBe(false);
    expect(client.getQueryData(entries.detail[0])).toEqual(refreshedDetail);
    expectFresh(client, [
      entries.closingStatus,
      entries.list,
      entries.dashboard,
      entries.manualDispatches,
      entries.recordEditor,
      entries.otherClubDetail,
      entries.otherClubRecordLedger,
      otherClubAttention,
    ]);
  });

  it("invalidates record-only session surfaces after import commit", async () => {
    vi.mocked(commitHostSessionImport).mockResolvedValue({
      sessionId: "session-7",
      draftRevision: 2,
      baseLiveRevision: 1,
      liveApplied: false,
    });
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => useCommitHostSessionImportMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: "session-7", request: importRequest });
    });
    await publishHostSessionImport(client, "session-7", context);

    expect(commitHostSessionImport).toHaveBeenCalledWith("session-7", importRequest, context);
    expectInvalidated(client, [
      entries.detail,
      entries.list,
      entries.dashboard,
      entries.current,
      entries.recordLedger,
      entries.recordAttention,
      entries.recordEditor,
      entries.recordHistory,
    ]);
    expectFresh(client, [
      entries.closingStatus,
      entries.manualDispatches,
      entries.otherClubDetail,
      entries.otherClubRecordLedger,
    ]);
  });

  it("leaves every seeded cache unchanged when visibility save rejects", async () => {
    vi.mocked(saveHostSessionVisibility).mockRejectedValue(new Error("visibility conflict"));
    const { client, Wrapper } = createWrapper();
    seedSurfaces(client);
    const manualOptionsKey = hostNotificationKeys.manualOptions(
      { sessionId: "session-7", page: { limit: 50 } },
      context,
    );
    client.setQueryData(manualOptionsKey, { contentRevision: "still-current" });
    const before = cacheState(client);
    const { result } = renderHook(() => useSaveHostSessionVisibilityMutation(context), { wrapper: Wrapper });

    await expect(result.current.mutateAsync({
      sessionId: "session-7",
      request: { visibility: "MEMBER" },
    })).rejects.toThrow("visibility conflict");

    expect(cacheState(client)).toEqual(before);
  });
});
