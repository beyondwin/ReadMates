import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HostSessionRequest, SessionImportRequest } from "@/features/host/api/host-contracts";

vi.mock("@/features/host/api/host-api", () => ({
  closeHostSession: vi.fn(),
  commitHostSessionImport: vi.fn(),
  createHostSession: vi.fn(),
  deleteHostSession: vi.fn(),
  openHostSession: vi.fn(),
  publishHostSession: vi.fn(),
  saveHostSessionAttendance: vi.fn(),
  saveHostSessionPublication: vi.fn(),
  saveHostSessionVisibility: vi.fn(),
  updateHostSession: vi.fn(),
}));

import {
  closeHostSession,
  commitHostSessionImport,
  createHostSession,
  deleteHostSession,
  openHostSession,
  publishHostSession,
  saveHostSessionAttendance,
  saveHostSessionPublication,
  saveHostSessionVisibility,
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
  useSaveHostSessionPublicationMutation,
  useSaveHostSessionVisibilityMutation,
  useUpdateHostSessionAttendanceMutation,
  useUpdateHostSessionMutation,
} from "./host-session-queries";

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

const sessionRequest: HostSessionRequest = {
  title: "8회차 모임",
  bookTitle: "다음 책",
  bookAuthor: "테스트 저자",
  date: "2026-06-20",
};

const importRequest: SessionImportRequest = {
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

beforeEach(() => {
  vi.mocked(createHostSession).mockReset();
  vi.mocked(updateHostSession).mockReset();
  vi.mocked(deleteHostSession).mockReset();
  vi.mocked(openHostSession).mockReset();
  vi.mocked(closeHostSession).mockReset();
  vi.mocked(publishHostSession).mockReset();
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
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateHostSessionMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(sessionRequest);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createHostSession).toHaveBeenCalledWith(sessionRequest);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
  });

  it("does not invalidate lists when create returns a non-ok response", async () => {
    vi.mocked(createHostSession).mockResolvedValue(new Response("bad request", { status: 400 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreateHostSessionMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync(sessionRequest);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("invalidates detail, lists, dashboard, and current session after update", async () => {
    vi.mocked(updateHostSession).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateHostSessionMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: "session-7", request: sessionRequest });
    });

    expect(updateHostSession).toHaveBeenCalledWith("session-7", sessionRequest);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }) });
  });

  it("does not remove detail or invalidate when delete returns a non-ok response", async () => {
    vi.mocked(deleteHostSession).mockResolvedValue(new Response("conflict", { status: 409 }) as never);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }), { sessionId: "session-7" });
    const removeSpy = vi.spyOn(client, "removeQueries");
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeleteHostSessionMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("session-7");
    });

    expect(removeSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it("removes deleted detail cache and invalidates dependent surfaces after delete", async () => {
    vi.mocked(deleteHostSession).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    client.setQueryData(hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }), { sessionId: "session-7" });
    const removeSpy = vi.spyOn(client, "removeQueries");
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useDeleteHostSessionMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("session-7");
    });

    expect(deleteHostSession).toHaveBeenCalledWith("session-7");
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.manualDispatchesRoot({ clubSlug: "reading-sai" }) });
  });

  it.each([
    ["open", useOpenHostSessionMutation, openHostSession, false],
    ["close", useCloseHostSessionMutation, closeHostSession, true],
    ["publish", usePublishHostSessionMutation, publishHostSession, true],
  ] as const)("invalidates session surfaces after %s", async (_name, hook, apiFn, expectsManualDispatches) => {
    vi.mocked(apiFn).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => hook({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("session-7");
    });

    expect(apiFn).toHaveBeenCalledWith("session-7");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }) });
    // close/publish must also invalidate manual dispatches (notification ledger refresh);
    // open must NOT. Guards against accidental removal of `{ manualDispatches: true }`
    // from either hook.
    const manualDispatchesCall = invalidateSpy.mock.calls.find(
      ([arg]) =>
        JSON.stringify(arg?.queryKey) ===
        JSON.stringify(hostSessionKeys.manualDispatchesRoot({ clubSlug: "reading-sai" })),
    );
    if (expectsManualDispatches) {
      expect(manualDispatchesCall).toBeDefined();
    } else {
      expect(manualDispatchesCall).toBeUndefined();
    }
  });

  it("invalidates detail, lists, and dashboard after visibility save", async () => {
    vi.mocked(saveHostSessionVisibility).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSaveHostSessionVisibilityMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: "session-7", request: { visibility: "MEMBER" } });
    });

    expect(saveHostSessionVisibility).toHaveBeenCalledWith(
      "session-7",
      { visibility: "MEMBER" },
      { clubSlug: "reading-sai" },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
  });

  it("invalidates manual dispatches after publication save", async () => {
    vi.mocked(saveHostSessionPublication).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSaveHostSessionPublicationMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-7",
        request: { publicSummary: "요약", visibility: "MEMBER" },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.manualDispatchesRoot({ clubSlug: "reading-sai" }) });
  });

  it("invalidates detail and current session after attendance update", async () => {
    vi.mocked(saveHostSessionAttendance).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateHostSessionAttendanceMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        sessionId: "session-7",
        attendance: [{ membershipId: "member-1", attendanceStatus: "ATTENDED" }],
      });
    });

    expect(saveHostSessionAttendance).toHaveBeenCalledWith("session-7", [
      { membershipId: "member-1", attendanceStatus: "ATTENDED" },
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }) });
  });

  it("invalidates the full host session surface after import commit", async () => {
    vi.mocked(commitHostSessionImport).mockResolvedValue({
      sessionId: "session-7",
      draftRevision: 2,
      baseLiveRevision: 1,
      liveApplied: false,
    });
    const { client, Wrapper } = createWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCommitHostSessionImportMutation({ clubSlug: "reading-sai" }), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sessionId: "session-7", request: importRequest });
    });

    expect(commitHostSessionImport).toHaveBeenCalledWith("session-7", importRequest);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }) });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: hostSessionKeys.manualDispatchesRoot({ clubSlug: "reading-sai" }) });
  });
});
