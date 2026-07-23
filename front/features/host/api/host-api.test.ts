import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeHostSession,
  commitHostSessionImport,
  confirmManualNotification,
  createHostInvitation,
  createHostSession,
  deleteHostSession,
  fetchHostClubOperations,
  fetchHostCurrentSession,
  fetchHostDashboard,
  fetchHostMembers,
  fetchHostNotificationDetail,
  fetchHostNotificationEvents,
  fetchHostNotificationItems,
  fetchHostNotificationPolicy,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  fetchHostSessions,
  fetchManualNotificationDispatches,
  fetchManualNotificationOptions,
  listHostInvitationsResponse,
  openHostSession,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  previewManualNotification,
  processHostNotifications,
  publishHostSession,
  restoreHostNotification,
  retryHostNotification,
  revokeHostInvitation,
  saveHostSessionAttendance,
  saveHostSessionPublication,
  saveHostSessionVisibility,
  sendHostNotificationTestMail,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  submitHostViewerAction,
  updateHostSession,
  updateHostNotificationPolicy,
} from "./host-api";
import { HostSessionVisibilityUpdateResponseSchema } from "./host-contracts";

function jsonResponse(body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function stubFetch() {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ items: [], nextCursor: null })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("host api wrappers", () => {
  it("passes explicit club context through visibility PATCH", async () => {
    const fetchMock = stubFetch();

    await saveHostSessionVisibility(
      "session 7",
      { visibility: "MEMBER" },
      { clubSlug: "reading-sai" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/sessions/session%207/visibility?clubSlug=reading-sai",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ visibility: "MEMBER" }),
      }),
    );
  });

  it("builds scoped host read URLs with query parameters", async () => {
    const fetchMock = stubFetch();
    const context = { clubSlug: "reading-sai" };

    await fetchHostCurrentSession(context);
    await fetchHostDashboard(context);
    await fetchHostClubOperations(context);
    await fetchHostNotificationSummary(context);
    await fetchHostNotificationPolicy(context);
    await fetchHostNotificationItems("FAILED", context, { limit: 20, cursor: "next page" });
    await fetchHostNotificationEvents(context, { limit: 10 });
    await fetchManualNotificationOptions(context, {
      sessionId: "session 7",
      search: "alice",
      page: { limit: 5, cursor: "c1" },
    });
    await fetchManualNotificationDispatches(context, {
      sessionId: "session 7",
      eventType: "SESSION_REMINDER",
      page: { limit: 5, cursor: "c1" },
    });
    await fetchHostNotificationTestMailAudit(context, { limit: 3 });
    await fetchHostSessions(context, { limit: 50 });
    await fetchHostMembers(context, { limit: 25, cursor: "m2" });

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      "/api/bff/api/sessions/current?clubSlug=reading-sai",
      "/api/bff/api/host/dashboard?clubSlug=reading-sai",
      "/api/bff/api/host/club-operations?clubSlug=reading-sai",
      "/api/bff/api/host/notifications/summary?clubSlug=reading-sai",
      "/api/bff/api/host/notifications/policy?clubSlug=reading-sai",
      "/api/bff/api/host/notifications/items?status=FAILED&limit=20&cursor=next+page&clubSlug=reading-sai",
      "/api/bff/api/host/notifications/events?limit=10&clubSlug=reading-sai",
      "/api/bff/api/host/notifications/manual/options?sessionId=session+7&search=alice&limit=5&cursor=c1&clubSlug=reading-sai",
      "/api/bff/api/host/notifications/manual/dispatches?sessionId=session+7&eventType=SESSION_REMINDER&limit=5&cursor=c1&clubSlug=reading-sai",
      "/api/bff/api/host/notifications/test-mail/audit?limit=3&clubSlug=reading-sai",
      "/api/bff/api/host/sessions?limit=50&clubSlug=reading-sai",
      "/api/bff/api/host/members?limit=25&cursor=m2&clubSlug=reading-sai",
    ]);
  });

  it("encodes host mutation paths and request bodies", async () => {
    const fetchMock = stubFetch();
    const sessionId = "session 7";
    const membershipId = "member/7";

    await processHostNotifications();
    await updateHostNotificationPolicy(
      { sessionReminderEnabled: true },
      { clubSlug: "reading-sai" },
    );
    await previewManualNotification({ templateKey: "SESSION_REMINDER", sessionId });
    await confirmManualNotification({ previewId: "preview-1" });
    await fetchHostNotificationDetail("item/1");
    await retryHostNotification("item/1");
    await restoreHostNotification("item/1");
    await sendHostNotificationTestMail({ toEmail: "host@example.com" });
    await createHostSession({} as never);
    await updateHostSession(sessionId, {} as never);
    await deleteHostSession(sessionId);
    await saveHostSessionAttendance(sessionId, []);
    await saveHostSessionPublication(sessionId, { visibility: "PUBLIC" } as never);
    await saveHostSessionVisibility(sessionId, { visibility: "MEMBER" });
    await openHostSession(sessionId);
    await closeHostSession(sessionId);
    await publishHostSession(sessionId);
    await commitHostSessionImport(sessionId, { payload: "{}" });
    await submitHostMemberLifecycle(membershipId, "/current-session/remove", { currentSessionPolicy: "NEXT_SESSION" });
    await submitHostViewerAction(membershipId, "activate");
    await submitHostMemberProfile(membershipId, "Alice");
    await listHostInvitationsResponse({ clubSlug: "reading-sai" }, { limit: 10 });
    await createHostInvitation({ email: "new@example.com", name: "New Member", applyToCurrentSession: true });
    await revokeHostInvitation("invite/1");

    const calls = fetchMock.mock.calls.map(([url, init]) => ({
      url,
      method: (init as RequestInit | undefined)?.method ?? "GET",
      body: (init as RequestInit | undefined)?.body,
    }));
    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ["POST", "/api/bff/api/host/notifications/process"],
      ["PUT", "/api/bff/api/host/notifications/policy?clubSlug=reading-sai"],
      ["POST", "/api/bff/api/host/notifications/manual/preview"],
      ["POST", "/api/bff/api/host/notifications/manual"],
      ["GET", "/api/bff/api/host/notifications/items/item%2F1"],
      ["POST", "/api/bff/api/host/notifications/items/item%2F1/retry"],
      ["POST", "/api/bff/api/host/notifications/items/item%2F1/restore"],
      ["POST", "/api/bff/api/host/notifications/test-mail"],
      ["POST", "/api/bff/api/host/sessions"],
      ["PATCH", "/api/bff/api/host/sessions/session%207"],
      ["DELETE", "/api/bff/api/host/sessions/session%207"],
      ["POST", "/api/bff/api/host/sessions/session%207/attendance"],
      ["PUT", "/api/bff/api/host/sessions/session%207/publication"],
      ["PATCH", "/api/bff/api/host/sessions/session%207/visibility"],
      ["POST", "/api/bff/api/host/sessions/session%207/open"],
      ["POST", "/api/bff/api/host/sessions/session%207/close"],
      ["POST", "/api/bff/api/host/sessions/session%207/publish"],
      ["POST", "/api/bff/api/host/sessions/session%207/session-import/commit"],
      ["POST", "/api/bff/api/host/members/member%2F7/current-session/remove"],
      ["POST", "/api/bff/api/host/members/member%2F7/activate"],
      ["PATCH", "/api/bff/api/host/members/member%2F7/profile"],
      ["GET", "/api/bff/api/host/invitations?limit=10&clubSlug=reading-sai"],
      ["POST", "/api/bff/api/host/invitations"],
      ["POST", "/api/bff/api/host/invitations/invite%2F1/revoke"],
    ]);
    expect(calls[1].body).toBe(JSON.stringify({ sessionReminderEnabled: true }));
    expect(calls[2].body).toBe(JSON.stringify({ templateKey: "SESSION_REMINDER", sessionId }));
    expect(calls[18].body).toBe(JSON.stringify({ currentSessionPolicy: "NEXT_SESSION" }));
    expect(calls[20].body).toBe(JSON.stringify({ displayName: "Alice" }));
  });

  it("accepts visibility responses with a composer context", () => {
    const session = {
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
      state: "OPEN",
      attendees: [],
      feedbackDocument: {
        uploaded: false,
        fileName: null,
        uploadedAt: null,
      },
      visibility: "MEMBER",
    };

    expect(HostSessionVisibilityUpdateResponseSchema.parse({
      session,
      composer: {
        sessionId: "session-7",
        eventType: "NEXT_BOOK_PUBLISHED",
        contentRevision: "b".repeat(64),
      },
    })).toMatchObject({
      session: { sessionId: "session-7" },
      composer: { eventType: "NEXT_BOOK_PUBLISHED" },
    });
  });

  it("parses host invitation responses from raw Response objects", async () => {
    await expect(parseHostInvitationResponse(jsonResponse({ invitationId: "inv-1" }))).resolves.toEqual({
      invitationId: "inv-1",
    });
    await expect(parseHostInvitationListResponse(jsonResponse({ items: [], nextCursor: null }))).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
