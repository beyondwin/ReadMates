import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/host/api/host-api", () => ({
  fetchHostCurrentSession: vi.fn(),
  fetchHostDashboard: vi.fn(),
  fetchHostSessions: vi.fn(),
  fetchHostSessionDetail: vi.fn(),
  fetchHostSessionDeletionPreview: vi.fn(),
  fetchManualNotificationDispatches: vi.fn(),
}));

import {
  fetchHostCurrentSession,
  fetchHostDashboard,
  fetchHostSessions,
  fetchHostSessionDetail,
  fetchHostSessionDeletionPreview,
  fetchManualNotificationDispatches,
} from "@/features/host/api/host-api";
import {
  hostCurrentSessionQuery,
  hostDashboardQuery,
  hostSessionDeletionPreviewQuery,
  hostSessionDetailQuery,
  hostSessionKeys,
  hostSessionListQuery,
  hostSessionManualDispatchesQuery,
  invalidateHostCurrentSession,
  invalidateHostSessionDashboard,
  invalidateHostSessionDetail,
  invalidateHostSessionLists,
  invalidateHostSessionManualDispatches,
  invalidateHostSessionSurface,
} from "./host-session-queries";

async function runQuery(query: { queryFn?: (context: never) => unknown }) {
  if (!query.queryFn) {
    throw new Error("Missing queryFn");
  }
  return query.queryFn({} as never);
}

describe("host session query keys", () => {
  it("scopes all host session keys by club slug", () => {
    expect(hostSessionKeys.list({ limit: 50 }, { clubSlug: "reading-sai" })).toEqual([
      "host",
      "sessions",
      "scope",
      "reading-sai",
      "list",
      { limit: 50, cursor: null },
    ]);
    expect(hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" })).toEqual([
      "host",
      "sessions",
      "scope",
      "reading-sai",
      "detail",
      "session-7",
    ]);
    expect(hostSessionKeys.current({ clubSlug: "reading-sai" })).toEqual([
      "host",
      "sessions",
      "scope",
      "reading-sai",
      "current",
    ]);
  });

  it("uses a null club scope for unscoped host routes", () => {
    expect(hostSessionKeys.scope()).toEqual(["host", "sessions", "scope", null]);
  });

  it("normalizes equivalent first page requests to the same key", () => {
    expect(hostSessionListQuery(undefined, { clubSlug: "reading-sai" }).queryKey).toEqual(
      hostSessionListQuery({}, { clubSlug: "reading-sai" }).queryKey,
    );
  });

  it("normalizes manual dispatch request filters", () => {
    expect(hostSessionManualDispatchesQuery(
      { sessionId: "session-7", page: { limit: 20 } },
      { clubSlug: "reading-sai" },
    ).queryKey).toEqual(
      hostSessionManualDispatchesQuery(
        { sessionId: "session-7", eventType: null, page: { limit: 20 } },
        { clubSlug: "reading-sai" },
      ).queryKey,
    );
  });

  it("query functions call host API wrappers with context and normalized pages", async () => {
    vi.mocked(fetchHostCurrentSession).mockResolvedValue({ currentSession: null });
    vi.mocked(fetchHostDashboard).mockResolvedValue({
      rsvpPending: 0,
      checkinMissing: 0,
      publishPending: 0,
      feedbackPending: 0,
    });
    vi.mocked(fetchHostSessions).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(fetchHostSessionDetail).mockResolvedValue({
      sessionId: "session-7",
      sessionNumber: 7,
      title: "7회차 모임",
      bookTitle: "테스트 책",
      bookAuthor: "테스트 저자",
      bookLink: null,
      bookImageUrl: null,
      locationLabel: "온라인",
      meetingUrl: null,
      meetingPasscode: null,
      date: "2026-05-20",
      startTime: "20:00",
      endTime: "22:00",
      questionDeadlineAt: "2026-05-19T14:59:00Z",
      visibility: "HOST_ONLY",
      publication: null,
      state: "OPEN",
      attendees: [],
      feedbackDocument: { uploaded: false, fileName: null, uploadedAt: null },
    });
    vi.mocked(fetchHostSessionDeletionPreview).mockResolvedValue(new Response("{}", { status: 200 }) as never);
    vi.mocked(fetchManualNotificationDispatches).mockResolvedValue({ items: [], nextCursor: null });

    await runQuery(hostCurrentSessionQuery({ clubSlug: "reading-sai" }));
    await runQuery(hostDashboardQuery({ clubSlug: "reading-sai" }));
    await runQuery(hostSessionListQuery({ limit: 50 }, { clubSlug: "reading-sai" }));
    await runQuery(hostSessionDetailQuery("session-7", { clubSlug: "reading-sai" }));
    await runQuery(hostSessionDeletionPreviewQuery("session-7", { clubSlug: "reading-sai" }));
    await runQuery(hostSessionManualDispatchesQuery(
      { sessionId: "session-7", page: { limit: 20 } },
      { clubSlug: "reading-sai" },
    ));

    expect(fetchHostCurrentSession).toHaveBeenCalledWith({ clubSlug: "reading-sai" });
    expect(fetchHostDashboard).toHaveBeenCalledWith({ clubSlug: "reading-sai" });
    expect(fetchHostSessions).toHaveBeenCalledWith({ clubSlug: "reading-sai" }, { limit: 50 });
    expect(fetchHostSessionDetail).toHaveBeenCalledWith("session-7", { clubSlug: "reading-sai" });
    expect(fetchHostSessionDeletionPreview).toHaveBeenCalledWith("session-7", { clubSlug: "reading-sai" });
    expect(fetchManualNotificationDispatches).toHaveBeenCalledWith(
      { clubSlug: "reading-sai" },
      { sessionId: "session-7", page: { limit: 20 } },
    );
  });

  it("does not retain deletion preview results between fetches", () => {
    const options = hostSessionDeletionPreviewQuery("session-7", { clubSlug: "reading-sai" });
    expect(options.staleTime).toBe(0);
    expect(options.gcTime).toBe(0);
  });

  it("invalidates each host session surface with scoped keys", async () => {
    const client = {
      invalidateQueries: vi.fn().mockResolvedValue(undefined),
    };

    await invalidateHostSessionLists(client as never, { clubSlug: "reading-sai" });
    await invalidateHostSessionDetail(client as never, "session-7", { clubSlug: "reading-sai" });
    await invalidateHostCurrentSession(client as never, { clubSlug: "reading-sai" });
    await invalidateHostSessionDashboard(client as never, { clubSlug: "reading-sai" });
    await invalidateHostSessionManualDispatches(client as never, { clubSlug: "reading-sai" });
    await invalidateHostSessionSurface(client as never, { clubSlug: "reading-sai" });

    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.lists({ clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.detail("session-7", { clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.current({ clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.dashboard({ clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.manualDispatchesRoot({ clubSlug: "reading-sai" }),
    });
    expect(client.invalidateQueries).toHaveBeenCalledWith({
      queryKey: hostSessionKeys.scope({ clubSlug: "reading-sai" }),
    });
  });
});
