import { afterEach, describe, expect, it, vi } from "vitest";
import * as sessionExpiry from "@/shared/auth/session-expiry";
import {
  closeHostSession,
  commitHostSessionImport,
  confirmManualNotification,
  createHostInvitation,
  createHostSession,
  deleteHostSession,
  fetchHostClubOperations,
  fetchHostCurrentSession,
  fetchHostMembers,
  fetchHostNotificationDetail,
  fetchHostNotificationEvents,
  fetchHostNotificationItems,
  fetchHostNotificationPolicy,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  fetchHostSessions,
  fetchHostSessionScheduleDefaults,
  fetchManualNotificationDispatches,
  fetchManualNotificationOptions,
  listHostInvitationsResponse,
  openHostSession,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  previewManualNotification,
  processHostNotifications,
  publishHostSession,
  reopenHostSession,
  restoreHostNotification,
  returnHostSessionToDraft,
  retryHostNotification,
  revokeHostInvitation,
  saveHostSessionAttendance,
  saveHostSessionPublication,
  saveHostSessionAccessScope,
  saveHostSessionVisibility,
  sendHostNotificationTestMail,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  submitHostViewerAction,
  unpublishHostSession,
  updateHostSession,
  updateHostNotificationPolicy,
} from "./host-api";

function jsonResponse(body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function hostSessionDetail() {
  return {
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
  };
}

function hostMemberListItem(avatarKey: unknown = "banana-green-book") {
  return {
    membershipId: "membership-active",
    userId: "user-active",
    email: "active@example.com",
    displayName: "멤버1",
    accountName: "안멤버1",
    profileImageUrl: null,
    avatarKey,
    role: "MEMBER",
    status: "ACTIVE",
    joinedAt: "2026-04-18T12:00:00Z",
    createdAt: "2026-04-17T12:00:00Z",
    currentSessionParticipationStatus: "ACTIVE",
    canSuspend: true,
    canRestore: false,
    canDeactivate: true,
    canAddToCurrentSession: false,
    canRemoveFromCurrentSession: true,
  };
}

function stubFetch() {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve(jsonResponse(
      url.includes("/visibility") || url.includes("/access-scope")
        ? { session: hostSessionDetail(), composer: null }
        : url.includes("/attendance")
          ? { sessionId: "session-7", count: 0 }
          : init?.method === "DELETE"
            ? {
                sessionId: "session-7",
                sessionNumber: 7,
                title: "함께 읽기",
                state: "OPEN",
                trashed: true,
                deletedAt: "2026-08-21T10:00:00Z",
                purgeAfter: "2026-08-28T10:00:00Z",
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
              }
            : url.includes("/restore")
              ? hostSessionDetail()
              : { items: [], nextCursor: null },
    )));
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

  it("sends canonical guest access to the access-scope endpoint", async () => {
    const fetchMock = stubFetch();

    await saveHostSessionAccessScope(
      "session 7",
      { accessScope: "GUEST_READABLE" },
      { clubSlug: "reading-sai" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/sessions/session%207/access-scope?clubSlug=reading-sai",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ accessScope: "GUEST_READABLE" }),
      }),
    );
  });

  it("builds scoped host read URLs with query parameters", async () => {
    const fetchMock = stubFetch();
    const context = { clubSlug: "reading-sai" };

    await fetchHostCurrentSession(context);
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
    await fetchHostSessionScheduleDefaults(context);
    await fetchHostMembers(context, { limit: 25, cursor: "m2" });

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      "/api/bff/api/sessions/current?clubSlug=reading-sai",
      "/api/bff/api/host/club-operations?clubSlug=reading-sai",
      "/api/bff/api/host/notifications/summary?clubSlug=reading-sai",
      "/api/bff/api/host/notifications/policy?clubSlug=reading-sai",
      "/api/bff/api/host/notifications/items?status=FAILED&limit=20&cursor=next+page&clubSlug=reading-sai",
      "/api/bff/api/host/notifications/events?limit=10&clubSlug=reading-sai",
      "/api/bff/api/host/notifications/manual/options?sessionId=session+7&search=alice&limit=5&cursor=c1&clubSlug=reading-sai",
      "/api/bff/api/host/notifications/manual/dispatches?sessionId=session+7&eventType=SESSION_REMINDER&limit=5&cursor=c1&clubSlug=reading-sai",
      "/api/bff/api/host/notifications/test-mail/audit?limit=3&clubSlug=reading-sai",
      "/api/bff/api/host/sessions?limit=50&clubSlug=reading-sai",
      "/api/bff/api/host/sessions/schedule-defaults?clubSlug=reading-sai",
      "/api/bff/api/host/members?limit=25&cursor=m2&clubSlug=reading-sai",
    ]);
  });

  it("validates host member avatar keys as strings while preserving future keys", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [hostMemberListItem("future-avatar")], nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ items: [hostMemberListItem(42)], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHostMembers()).resolves.toMatchObject({
      items: [{ avatarKey: "future-avatar" }],
    });
    await expect(fetchHostMembers()).rejects.toThrow();
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
    await reopenHostSession(sessionId, { reasonCode: "MEETING_RESCHEDULED", reasonNote: "moved online" });
    await unpublishHostSession(sessionId, { reasonCode: "CONTENT_CORRECTION" });
    await returnHostSessionToDraft(sessionId, { reasonCode: "ACCIDENTAL_TRANSITION" });
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
      ["POST", "/api/bff/api/host/sessions/session%207/reopen"],
      ["POST", "/api/bff/api/host/sessions/session%207/unpublish"],
      ["POST", "/api/bff/api/host/sessions/session%207/return-to-draft"],
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
    expect(calls[17].body).toBe(JSON.stringify({
      reasonCode: "MEETING_RESCHEDULED",
      reasonNote: "moved online",
    }));
    expect(calls[18].body).toBe(JSON.stringify({ reasonCode: "CONTENT_CORRECTION" }));
    expect(calls[19].body).toBe(JSON.stringify({ reasonCode: "ACCIDENTAL_TRANSITION" }));
    expect(calls[21].body).toBe(JSON.stringify({ currentSessionPolicy: "NEXT_SESSION" }));
    expect(calls[23].body).toBe(JSON.stringify({ displayName: "Alice" }));
  });

  it("sends reverse lifecycle JSON and keeps forward actions body-less", async () => {
    const fetchMock = stubFetch();
    const sessionId = "session 7";
    const request = { reasonCode: "OPERATIONAL_RECOVERY" as const, reasonNote: "restored" };

    await openHostSession(sessionId);
    await closeHostSession(sessionId);
    await publishHostSession(sessionId);
    await reopenHostSession(sessionId, request);
    await unpublishHostSession(sessionId, request);
    await returnHostSessionToDraft(sessionId, request);

    const calls = fetchMock.mock.calls.map(([, init]) => init as RequestInit);
    expect(calls.slice(0, 3).map((init) => init.body)).toEqual([undefined, undefined, undefined]);
    expect(calls.slice(3).map((init) => ({
      contentType: new Headers(init.headers).get("Content-Type"),
      body: init.body,
    }))).toEqual([
      { contentType: "application/json", body: JSON.stringify(request) },
      { contentType: "application/json", body: JSON.stringify(request) },
      { contentType: "application/json", body: JSON.stringify(request) },
    ]);
  });

  it("parses visibility responses and returns the composer result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      session: hostSessionDetail(),
      composer: {
        sessionId: "session-7",
        eventType: "NEXT_BOOK_PUBLISHED",
        contentRevision: "b".repeat(64),
      },
    })));

    await expect(saveHostSessionVisibility(
      "session-7",
      { visibility: "MEMBER" },
      { clubSlug: "reading-sai" },
    )).resolves.toMatchObject({
      session: { sessionId: "session-7" },
      composer: { eventType: "NEXT_BOOK_PUBLISHED" },
    });
  });

  it("rejects invalid visibility response data through the production wrapper", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      session: hostSessionDetail(),
      composer: {
        sessionId: "session-7",
        eventType: "NEXT_BOOK_PUBLISHED",
      },
    })));

    await expect(saveHostSessionVisibility(
      "session-7",
      { visibility: "MEMBER" },
    )).rejects.toMatchObject({
      name: "ZodError",
    });
  });

  it("normalizes nested schedule-default responses and ignores top-level meeting secrets", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      automatic: {
        startTime: "19:30",
        endTime: "21:30",
        locationLabel: "온라인",
        accessScope: "GUEST_READABLE",
        suggestedDate: "2026-06-11",
        questionDeadlineOffsetDays: 1,
      },
      previousOnlineMeeting: {
        meetingUrl: "https://meeting.invalid/room",
        meetingPasscode: "room-code-2048",
      },
      hints: ["이전 모임과 같은 시간으로 넣었습니다."],
      startTime: "18:00",
      meetingUrl: "https://meeting.invalid/legacy",
      meetingPasscode: "legacy-code",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHostSessionScheduleDefaults({ clubSlug: "reading-sai" })).resolves.toEqual({
      automatic: {
        startTime: "19:30",
        endTime: "21:30",
        locationLabel: "온라인",
        accessScope: "GUEST_READABLE",
        suggestedDate: "2026-06-11",
        questionDeadlineOffsetDays: 1,
      },
      previousOnlineMeeting: {
        meetingUrl: "https://meeting.invalid/room",
        meetingPasscode: "room-code-2048",
      },
      hints: ["이전 모임과 같은 시간으로 넣었습니다."],
    });
  });

  it("normalizes a flat legacy schedule-defaults server into nested automatic fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      startTime: "19:30",
      endTime: "21:30",
      locationLabel: "온라인",
      meetingUrl: "https://meeting.invalid/room",
      meetingPasscode: "room-code-2048",
      accessScope: "GUEST_READABLE",
      suggestedDate: "2026-06-11",
      questionDeadlineOffsetDays: 1,
      hints: ["이전 모임과 같은 시간으로 넣었습니다."],
    })));

    await expect(fetchHostSessionScheduleDefaults()).resolves.toEqual({
      automatic: {
        startTime: "19:30",
        endTime: "21:30",
        locationLabel: "온라인",
        accessScope: "GUEST_READABLE",
        suggestedDate: "2026-06-11",
        questionDeadlineOffsetDays: 1,
      },
      previousOnlineMeeting: {
        meetingUrl: "https://meeting.invalid/room",
        meetingPasscode: "room-code-2048",
      },
      hints: ["이전 모임과 같은 시간으로 넣었습니다."],
    });
  });

  it("recovers a defaults-only 401 as a read session expiry", async () => {
    const spy = vi.spyOn(sessionExpiry, "signalSessionExpired");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(fetchHostSessionScheduleDefaults()).rejects.toThrow("ReadMatesSessionExpiredError");
    expect(spy).toHaveBeenCalledWith("read");
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
