import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostSessionRequest, SessionImportRequest } from "@/features/host/api/host-contracts";
import { hostNotificationKeys } from "./host-notification-queries";

vi.mock("@/features/host/api/host-api", () => ({
  closeHostSession: vi.fn(),
  commitHostSessionImport: vi.fn(),
  createHostSession: vi.fn(),
  deleteHostSession: vi.fn(),
  openHostSession: vi.fn(),
  publishHostSession: vi.fn(),
  reopenHostSession: vi.fn(),
  returnHostSessionToDraft: vi.fn(),
  saveHostSessionAttendance: vi.fn(),
  saveHostSessionPublication: vi.fn(),
  saveHostSessionVisibility: vi.fn(),
  unpublishHostSession: vi.fn(),
  updateHostSession: vi.fn(),
  fetchHostSessionScheduleDefaults: vi.fn(),
}));

import {
  closeHostSession,
  commitHostSessionImport,
  createHostSession,
  deleteHostSession,
  openHostSession,
  publishHostSession,
  reopenHostSession,
  returnHostSessionToDraft,
  saveHostSessionAttendance,
  saveHostSessionPublication,
  saveHostSessionVisibility,
  unpublishHostSession,
  updateHostSession,
} from "@/features/host/api/host-api";
import {
  hostSessionKeys,
  useCloseHostSessionMutation,
  useCommitHostSessionImportMutation,
  useCreateHostSessionMutation,
  useDeleteHostSessionMutation,
  useOpenHostSessionMutation,
  usePublishHostSessionMutation,
  useReopenHostSessionMutation,
  useReturnHostSessionToDraftMutation,
  useSaveHostSessionPublicationMutation,
  useSaveHostSessionVisibilityMutation,
  useUnpublishHostSessionMutation,
  useUpdateHostSessionAttendanceMutation,
  useUpdateHostSessionMutation,
} from "./host-session-queries";

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

function surfaceKeys() {
  return {
    detail: hostSessionKeys.detail("session-7", context),
    closingStatus: hostSessionKeys.closingStatus("session-7", context),
    list: hostSessionKeys.list({ limit: 50 }, context),
    dashboard: hostSessionKeys.dashboard(context),
    current: hostSessionKeys.current(context),
    manualDispatches: hostSessionKeys.manualDispatches({ sessionId: "session-7" }, context),
    otherClubDetail: hostSessionKeys.detail("session-7", { clubSlug: "other-club" }),
  };
}

function seedSurfaces(client: QueryClient) {
  const keys = surfaceKeys();
  const entries = {
    detail: [keys.detail, { surface: "detail", sessionId: "session-7" }],
    closingStatus: [keys.closingStatus, { surface: "closing-status", state: "OPEN" }],
    list: [keys.list, { surface: "list", items: ["session-7"] }],
    dashboard: [keys.dashboard, { surface: "dashboard", sessions: ["session-7"] }],
    current: [keys.current, { surface: "current", sessionId: "session-7" }],
    manualDispatches: [keys.manualDispatches, { surface: "manual-dispatches", items: ["dispatch-1"] }],
    otherClubDetail: [keys.otherClubDetail, { surface: "detail", sessionId: "other-club-session-7" }],
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
  title: "8회차 모임",
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
    summary: "세션 요약",
  },
  highlights: [],
  oneLineReviews: [],
  feedbackDocument: {
    fileName: "session-7.md",
    markdown: "# 세션 기록",
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
  vi.mocked(publishHostSession).mockReset();
  vi.mocked(reopenHostSession).mockReset();
  vi.mocked(unpublishHostSession).mockReset();
  vi.mocked(returnHostSessionToDraft).mockReset();
  vi.mocked(saveHostSessionVisibility).mockReset();
  vi.mocked(saveHostSessionPublication).mockReset();
  vi.mocked(saveHostSessionAttendance).mockReset();
  vi.mocked(commitHostSessionImport).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("host session mutation hooks", () => {
  it("invalidates lists and dashboard after a successful create response", async () => {
    vi.mocked(createHostSession).mockResolvedValue(new Response(JSON.stringify({ sessionId: "session-8" }), { status: 201 }) as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => useCreateHostSessionMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(sessionRequest);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createHostSession).toHaveBeenCalledWith(sessionRequest);
    expectInvalidated(client, [entries.list, entries.dashboard]);
    expectFresh(client, [
      entries.detail,
      entries.closingStatus,
      entries.current,
      entries.manualDispatches,
      entries.otherClubDetail,
    ]);
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

  it("invalidates detail, lists, dashboard, and current session after update", async () => {
    vi.mocked(updateHostSession).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => useUpdateHostSessionMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: "session-7", request: sessionRequest });
    });

    expect(updateHostSession).toHaveBeenCalledWith("session-7", sessionRequest);
    expectInvalidated(client, [
      entries.detail,
      entries.closingStatus,
      entries.list,
      entries.dashboard,
      entries.current,
    ]);
    expectFresh(client, [entries.manualDispatches, entries.otherClubDetail]);
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
      deleted: true,
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

    await act(async () => {
      await result.current.mutateAsync("session-7");
    });

    expect(deleteHostSession).toHaveBeenCalledWith("session-7");
    expect(client.getQueryData(keys.detail)).toBeUndefined();
    expect(client.getQueryState(keys.detail)).toBeUndefined();
    expectInvalidated(client, [
      entries.list,
      entries.dashboard,
      entries.current,
      entries.manualDispatches,
    ]);
    expectFresh(client, [entries.closingStatus, entries.otherClubDetail]);
  });

  it.each([
    ["open", useOpenHostSessionMutation, openHostSession, false],
    ["close", useCloseHostSessionMutation, closeHostSession, true],
    ["publish", usePublishHostSessionMutation, publishHostSession, true],
    ["reopen", useReopenHostSessionMutation, reopenHostSession, true],
    ["unpublish", useUnpublishHostSessionMutation, unpublishHostSession, true],
    ["return-to-draft", useReturnHostSessionToDraftMutation, returnHostSessionToDraft, true],
  ] as const)("invalidates session surfaces after %s", async (_name, hook, apiFn, expectsManualDispatches) => {
    vi.mocked(apiFn).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => hook(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("session-7");
    });

    expect(apiFn).toHaveBeenCalledWith("session-7");
    expectInvalidated(client, [
      entries.detail,
      entries.closingStatus,
      entries.list,
      entries.dashboard,
      entries.current,
    ]);
    if (expectsManualDispatches) {
      expectInvalidated(client, [entries.manualDispatches]);
    } else {
      expectFresh(client, [entries.manualDispatches]);
    }
    expectFresh(client, [entries.otherClubDetail]);
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
    expect(client.getQueryData(detailKey)).toEqual(visibilityResult().session);
    expect(client.getQueryData(manualOptionsKey)).toBeUndefined();
    expectInvalidated(client, [entries.list, entries.dashboard]);
    expectFresh(client, [
      [keys.detail, visibilityResult().session],
      entries.closingStatus,
      entries.current,
      entries.manualDispatches,
      entries.otherClubDetail,
    ]);
  });

  it("invalidates manual dispatches after publication save", async () => {
    vi.mocked(saveHostSessionPublication).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => useSaveHostSessionPublicationMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-7",
        request: { publicSummary: "요약", visibility: "MEMBER" },
      });
    });

    expectInvalidated(client, [entries.detail, entries.list, entries.dashboard, entries.manualDispatches]);
    expectFresh(client, [entries.closingStatus, entries.current, entries.otherClubDetail]);
  });

  it("invalidates detail and current session after attendance update", async () => {
    vi.mocked(saveHostSessionAttendance).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const { entries } = seedSurfaces(client);
    const { result } = renderHook(() => useUpdateHostSessionAttendanceMutation(context), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-7",
        attendance: [{ membershipId: "member-1", attendanceStatus: "ATTENDED" }],
      });
    });

    expect(saveHostSessionAttendance).toHaveBeenCalledWith("session-7", [
      { membershipId: "member-1", attendanceStatus: "ATTENDED" },
    ]);
    expectInvalidated(client, [entries.detail, entries.current]);
    expectFresh(client, [
      entries.closingStatus,
      entries.list,
      entries.dashboard,
      entries.manualDispatches,
      entries.otherClubDetail,
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

    expect(commitHostSessionImport).toHaveBeenCalledWith("session-7", importRequest);
    expectInvalidated(client, [entries.detail, entries.list, entries.dashboard, entries.current]);
    expectFresh(client, [entries.closingStatus, entries.manualDispatches, entries.otherClubDetail]);
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
