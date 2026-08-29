import { afterEach, describe, expect, it, vi } from "vitest";
import * as sessionExpiry from "@/shared/auth/session-expiry";
import { __resetHostClientContractCapabilityForTest } from "@/shared/api/host-client-contract";
import { subscribeHostAuthorityLoss } from "@/shared/api/host-authority-event";
import {
  closeHostSession,
  correctionPublishHostSession,
  createHostSession,
  deleteHostSession,
  fetchHostClubOperations,
  fetchHostCurrentSession,
  fetchHostMutationReconciliation,
  fetchHostMembers,
  fetchHostNotificationEvents,
  fetchHostNotificationItems,
  fetchHostNotificationPolicy,
  fetchHostNotificationSummary,
  fetchHostNotificationTestMailAudit,
  fetchHostPublicConvergence,
  fetchHostSessions,
  fetchHostSessionList,
  fetchHostSessionScheduleDefaults,
  fetchManualNotificationDispatches,
  fetchManualNotificationOptions,
  openHostSession,
  processHostNotifications,
  parseHostInvitationListResponse,
  parseHostInvitationResponse,
  publishHostSession,
  retryHostPublicConvergence,
  reopenHostSession,
  restoreHostSession,
  saveHostSessionAttendance,
  saveHostSessionPublication,
  saveHostSessionAccessScope,
  saveHostSessionVisibility,
  submitHostMemberLifecycle,
  submitHostMemberProfile,
  createHostInvitation,
  updateHostSession,
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
    scheduleRevision: 7,
    scheduleSeenAvailability: "AVAILABLE" as const,
    scheduleSeenSummary: {
      currentCount: 1,
      staleCount: 0,
      unseenCount: 0,
      eligibleCount: 1,
    },
    versions: {
      sessionRevision: 3,
      scheduleRevision: 7,
      exposureRevision: 2,
      participantSetRevision: 1,
      recordDraftRevision: null,
      liveRecordRevision: null,
      publicationRevision: 0,
    },
    attendanceSnapshotId: "attendance-snapshot-1",
    attendees: [
      {
        membershipId: "membership-1",
        avatarKey: "banana-green-book",
        displayName: "멤버1",
        accountName: "안멤버1",
        rsvpStatus: "GOING" as const,
        attendanceStatus: "UNKNOWN" as const,
        participationStatus: "ACTIVE" as const,
        attendanceRevision: 2,
        seenScheduleRevision: 7,
        scheduleSeenAt: "2026-07-22T12:00:00Z",
        scheduleSeenState: "CURRENT" as const,
      },
    ],
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
    Promise.resolve(url.includes("/__internal/client-contract-status")
      ? new Response(JSON.stringify({
          schemaVersion: 1,
          supportedHostClientContracts: ["v2", "v3"],
        }), { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } })
      : jsonResponse(
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
              }
            : url.includes("/restore")
              ? hostSessionDetail()
              : { items: [], nextCursor: null },
    )));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  __resetHostClientContractCapabilityForTest();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("host api wrappers", () => {
  it.each([
    "HOST_AUTHORITY_REVOKED",
    "MEMBERSHIP_SUSPENDED",
    "CROSS_CLUB_SCOPE",
  ] as const)("emits %s with the explicit club from a normal query helper", async (code) => {
    const listener = vi.fn();
    const unsubscribe = subscribeHostAuthorityLoss(listener);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code,
      message: code,
      status: 403,
    }), { status: 403, headers: { "Content-Type": "application/json" } })));

    await expect(fetchHostMembers({ clubSlug: "reading-sai" })).rejects.toMatchObject({ code });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      code,
      clubSlug: "reading-sai",
    }));
    unsubscribe();
  });

  it("emits one authority event from every raw host mutation response boundary", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHostAuthorityLoss(listener);
    const problem = {
      code: "HOST_AUTHORITY_REVOKED",
      message: "host authority revoked",
      status: 403,
    };
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.includes("/__internal/client-contract-status")
        ? new Response(JSON.stringify({
            schemaVersion: 1,
            supportedHostClientContracts: ["v3"],
          }), { headers: { "Cache-Control": "no-store", "Content-Type": "application/json" } })
        : new Response(JSON.stringify(problem), {
            status: 403,
            headers: { "Content-Type": "application/json" },
          }),
    )));
    const context = { clubSlug: "reading-sai" };

    await expect(submitHostMemberLifecycle(
      "member-1",
      "/suspend",
      undefined,
      context,
    )).rejects.toMatchObject({ code: problem.code });
    await expect(submitHostMemberProfile("member-1", "새 이름", context))
      .rejects.toMatchObject({ code: problem.code });
    await expect(createHostInvitation({ name: "초대", email: "invite@example.test" }, context))
      .rejects.toMatchObject({ code: problem.code });
    await expect(processHostNotifications(context)).rejects.toMatchObject({ code: problem.code });
    await expect(createHostSession({
      idempotencyKey: "b7-host-create-0001",
      expected: {},
      command: {
        title: "함께 읽기",
        bookTitle: "모비 딕",
        bookAuthor: "허먼 멜빌",
        date: "2026-08-30",
      },
    }, context)).rejects.toMatchObject({ code: problem.code });

    expect(listener).toHaveBeenCalledTimes(5);
    expect(listener.mock.calls.map(([event]) => event)).toEqual([
      expect.objectContaining({ clubSlug: "reading-sai", requestKind: "MEMBER_LIFECYCLE" }),
      expect.objectContaining({ clubSlug: "reading-sai", requestKind: "MEMBER_PROFILE" }),
      expect.objectContaining({ clubSlug: "reading-sai", requestKind: "INVITATION_CREATE" }),
      expect.objectContaining({ clubSlug: "reading-sai", requestKind: "NOTIFICATIONS_PROCESS" }),
      expect.objectContaining({ clubSlug: "reading-sai", requestKind: "SESSION_CREATE" }),
    ]);
    unsubscribe();
  });

  it("parses an exact club-scoped mutation reconciliation response", async () => {
    const receipt = {
      receiptId: "receipt-1",
      operation: "SESSION_OPEN",
      resourceId: "session-7",
      resultingVersions: {
        sessionRevision: 4,
        scheduleRevision: 7,
        exposureRevision: 1,
        participantSetRevision: 2,
        recordDraftRevision: null,
        liveRecordRevision: null,
        publicationRevision: 0,
      },
      notificationDecision: "NOT_SENT",
      projection: {
        snapshotId: "snapshot-1",
        sessionId: "session-7",
        sessionNumber: 7,
        title: "함께 읽기",
        bookTitle: "모비 딕",
        bookAuthor: "허먼 멜빌",
        date: "2026-08-30",
        startTime: "19:00",
        endTime: "21:00",
        locationLabel: "온라인",
        state: "OPEN",
        versions: {
          sessionRevision: 4,
          scheduleRevision: 7,
          exposureRevision: 1,
          participantSetRevision: 2,
          recordDraftRevision: null,
          liveRecordRevision: null,
          publicationRevision: 0,
        },
        accessScope: "HOST_ONLY",
        siteVisibility: "HIDDEN",
        visibility: "HOST_ONLY",
      },
    } as const;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      status: "COMMITTED",
      receipt,
      current: receipt.projection,
      attendanceVersions: [],
      attendanceSnapshotId: "attendance-snapshot-1",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHostMutationReconciliation(
      "SESSION_OPEN",
      "session/7",
      "b6-reconcile-0001",
      { clubSlug: "reading-sai" },
    )).resolves.toMatchObject({ status: "COMMITTED", receipt });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/mutations/SESSION_OPEN/session%2F7/b6-reconcile-0001?clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({
      status: "COMMITTED",
      receipt: { ...receipt, resourceId: undefined },
      current: receipt.projection,
      attendanceVersions: [],
      attendanceSnapshotId: null,
    }));
    await expect(fetchHostMutationReconciliation(
      "SESSION_OPEN",
      "session-7",
      "b6-reconcile-0002",
      { clubSlug: "reading-sai" },
    )).rejects.toThrow();
  });

  it("sends strict v3 envelopes with explicit club context for adopted session mutations", async () => {
    const fetchMock = stubFetch();
    const context = { clubSlug: "reading-sai" };
    const sessionId = "session 7";
    const command = {
      title: "함께 읽기",
      bookTitle: "모비 딕",
      bookAuthor: "허먼 멜빌",
      date: "2026-08-30",
    };
    const key = (suffix: string) => `b6-key-${suffix}-0001`;

    await createHostSession({ idempotencyKey: key("create"), expected: {}, command }, context);
    await updateHostSession(sessionId, {
      idempotencyKey: key("update"),
      expected: { sessionRevision: 3 },
      command,
    }, context);
    await deleteHostSession(sessionId, {
      idempotencyKey: key("trash"),
      expected: { sessionRevision: 3 },
      command: {},
    }, context);
    await saveHostSessionAttendance(sessionId, {
      idempotencyKey: key("attendance"),
      expected: { rows: [{ membershipId: "membership-1", attendanceRevision: 2 }] },
      command: {
        entries: [{
          membershipId: "membership-1",
          attendanceStatus: "ATTENDED",
          expectedAttendanceRevision: 2,
        }],
      },
    }, context);
    await saveHostSessionAccessScope(sessionId, {
      idempotencyKey: key("access"),
      expected: { exposureRevision: 4 },
      command: { accessScope: "GUEST_READABLE" },
    }, context);
    await saveHostSessionPublication(sessionId, {
      idempotencyKey: key("publication"),
      expected: { publicationRevision: 5 },
      command: { publicSummary: "함께 읽은 기록", siteVisibility: "PUBLIC_RECORD" },
    }, context);
    await openHostSession(sessionId, {
      idempotencyKey: key("open"),
      expected: { sessionRevision: 3 },
      command: {},
    }, context);
    await closeHostSession(sessionId, {
      idempotencyKey: key("close"),
      expected: { sessionRevision: 4, participantSetRevision: 5, attendanceSnapshotId: "snapshot-5" },
      command: {},
    }, context);
    await publishHostSession(sessionId, {
      idempotencyKey: key("publish"),
      expected: { sessionRevision: 5, liveRecordRevision: 2, exposureRevision: 4, publicationRevision: 5 },
      command: {},
    }, context);
    await reopenHostSession(sessionId, {
      idempotencyKey: key("reverse"),
      expected: { sessionRevision: 6 },
      command: { reasonCode: "OPERATIONAL_RECOVERY" },
    }, context);
    await restoreHostSession(sessionId, {
      idempotencyKey: key("restore"),
      expected: { sessionRevision: 7 },
      command: {},
    }, context);

    const writeCalls = fetchMock.mock.calls.filter(([url]) => !String(url).includes("/__internal/"));
    expect(writeCalls).toHaveLength(11);
    expect(writeCalls.every(([url]) => String(url).includes("clubSlug=reading-sai"))).toBe(true);
    expect(writeCalls.map(([, init]) => JSON.parse(String((init as RequestInit).body)))).toEqual([
      { idempotencyKey: key("create"), expected: {}, command },
      { idempotencyKey: key("update"), expected: { sessionRevision: 3 }, command },
      { idempotencyKey: key("trash"), expected: { sessionRevision: 3 }, command: {} },
      {
        idempotencyKey: key("attendance"),
        expected: { rows: [{ membershipId: "membership-1", attendanceRevision: 2 }] },
        command: {
          entries: [{
            membershipId: "membership-1",
            attendanceStatus: "ATTENDED",
            expectedAttendanceRevision: 2,
          }],
        },
      },
      { idempotencyKey: key("access"), expected: { exposureRevision: 4 }, command: { accessScope: "GUEST_READABLE" } },
      {
        idempotencyKey: key("publication"),
        expected: { publicationRevision: 5 },
        command: { publicSummary: "함께 읽은 기록", siteVisibility: "PUBLIC_RECORD" },
      },
      { idempotencyKey: key("open"), expected: { sessionRevision: 3 }, command: {} },
      {
        idempotencyKey: key("close"),
        expected: { sessionRevision: 4, participantSetRevision: 5, attendanceSnapshotId: "snapshot-5" },
        command: {},
      },
      {
        idempotencyKey: key("publish"),
        expected: { sessionRevision: 5, liveRecordRevision: 2, exposureRevision: 4, publicationRevision: 5 },
        command: {},
      },
      {
        idempotencyKey: key("reverse"),
        expected: { sessionRevision: 6 },
        command: { reasonCode: "OPERATIONAL_RECOVERY" },
      },
      { idempotencyKey: key("restore"), expected: { sessionRevision: 7 }, command: {} },
    ]);
  });

  it("rejects missing, extra, and wrong-domain revisions before a host write", async () => {
    const fetchMock = stubFetch();
    const context = { clubSlug: "reading-sai" };
    const invalid = [
      { idempotencyKey: "b6-invalid-missing", expected: {}, command: {} },
      {
        idempotencyKey: "b6-invalid-extra",
        expected: { sessionRevision: 3, exposureRevision: 4 },
        command: {},
      },
      {
        idempotencyKey: "b6-invalid-domain",
        expected: { publicationRevision: 4 },
        command: {},
      },
    ];

    for (const envelope of invalid) {
      expect(() => openHostSession("session-7", envelope as never, context)).toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("submits only an exact correction publication vector to the correction endpoint", async () => {
    const fetchMock = stubFetch();
    const context = { clubSlug: "reading-sai" };
    const validEnvelope = {
      idempotencyKey: "test-value",
      expected: {
        sessionRevision: 5,
        recordDraftRevision: 7,
        liveRecordRevision: 3,
        exposureRevision: 4,
        publicationRevision: 6,
      },
      command: {},
    };

    await correctionPublishHostSession("session 7", validEnvelope, context);

    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/bff/api/host/sessions/session%207/correction-publish?clubSlug=reading-sai",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(validEnvelope),
      }),
    );

    const invalidEnvelopes = [
      {
        ...validEnvelope,
        idempotencyKey: "test-missing",
        expected: {
          sessionRevision: 5,
          liveRecordRevision: 3,
          exposureRevision: 4,
          publicationRevision: 6,
        },
      },
      {
        ...validEnvelope,
        idempotencyKey: "test-extra",
        expected: { ...validEnvelope.expected, participantSetRevision: 9 },
      },
      {
        ...validEnvelope,
        idempotencyKey: "test-domain",
        expected: {
          sessionRevision: 5,
          recordDraftRevision: 7,
          liveRecordRevision: 3,
          exposureRevision: 4,
          attendanceRevision: 6,
        },
      },
    ];

    for (const envelope of invalidEnvelopes) {
      expect(() => correctionPublishHostSession("session-7", envelope as never, context)).toThrow();
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

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
      {
        idempotencyKey: "b6-access-scope-0001",
        expected: { exposureRevision: 2 },
        command: { accessScope: "GUEST_READABLE" },
      },
      { clubSlug: "reading-sai" },
    );

    expect(fetchMock).toHaveBeenNthCalledWith(2,
      "/api/bff/api/host/sessions/session%207/access-scope?clubSlug=reading-sai",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          idempotencyKey: "b6-access-scope-0001",
          expected: { exposureRevision: 2 },
          command: { accessScope: "GUEST_READABLE" },
        }),
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
      eventType: "SESSION_REMINDER_DUE",
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
      "/api/bff/api/host/notifications/manual/dispatches?sessionId=session+7&eventType=SESSION_REMINDER_DUE&limit=5&cursor=c1&clubSlug=reading-sai",
      "/api/bff/api/host/notifications/test-mail/audit?limit=3&clubSlug=reading-sai",
      "/api/bff/api/host/sessions?limit=50&clubSlug=reading-sai",
      "/api/bff/api/host/sessions/schedule-defaults?clubSlug=reading-sai",
      "/api/bff/api/host/members?limit=25&cursor=m2&clubSlug=reading-sai",
    ]);
  });

  it("parses the bounded convergence view and treats no linked work as absent", async () => {
    const view = {
      convergenceId: "10000000-0000-4000-8000-000000000001",
      originResult: "APPLIED",
      committedGeneration: 7,
      status: "PENDING",
      lastAttemptAt: null,
      retryable: false,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(view))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHostPublicConvergence("session 7", { clubSlug: "reading-sai" })).resolves.toEqual(view);
    await expect(fetchHostPublicConvergence("session 8", { clubSlug: "reading-sai" })).resolves.toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/bff/api/host/sessions/session%207/publication/convergence?clubSlug=reading-sai",
      "/api/bff/api/host/sessions/session%208/publication/convergence?clubSlug=reading-sai",
    ]);
  });

  it("retries one exact convergence id without accepting provider detail", async () => {
    const view = {
      convergenceId: "10000000-0000-4000-8000-000000000001",
      originResult: "APPLIED",
      committedGeneration: 7,
      status: "PENDING",
      lastAttemptAt: "2026-08-26T04:30:00Z",
      retryable: false,
    };
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.includes("/__internal/client-contract-status")
        ? new Response(JSON.stringify({ schemaVersion: 1, supportedHostClientContracts: ["v3"] }), {
            headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
          })
        : jsonResponse(view),
    ));
    vi.stubGlobal("fetch", fetchMock);

    await expect(retryHostPublicConvergence(
      "session 7",
      view.convergenceId,
      { clubSlug: "reading-sai" },
    )).resolves.toEqual(view);
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      "/api/bff/api/host/sessions/session%207/publication/convergence/10000000-0000-4000-8000-000000000001/retry?clubSlug=reading-sai",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends one exact server-owned list mode and preserves opaque cursors", async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({
      items: [],
      nextCursor: null,
      summary: { needsAttentionCount: 0, incompletePublishedCount: 0, draftCount: 0 },
    })));
    vi.stubGlobal("fetch", fetchMock);
    const opaqueCursor = "eyJlcG9jaCI6IjErLz0ifQ==";

    await fetchHostSessionList("meeting", { clubSlug: "reading-sai" }, {
      limit: 25,
      cursor: opaqueCursor,
    });
    await fetchHostSessionList("record", { clubSlug: "reading-sai" }, {
      limit: 10,
      cursor: "record+cursor/==",
    });

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual([
      "/api/bff/api/host/sessions?mode=meeting&limit=25&cursor=eyJlcG9jaCI6IjErLz0ifQ%3D%3D&clubSlug=reading-sai",
      "/api/bff/api/host/sessions?mode=record&limit=10&cursor=record%2Bcursor%2F%3D%3D&clubSlug=reading-sai",
    ]);
    for (const url of urls) {
      expect(url).not.toMatch(/[?&]states?=/);
    }
  });

  it("validates host member avatar keys as strings while preserving future keys", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ items: [hostMemberListItem("future-avatar")], nextCursor: null }))
      .mockResolvedValueOnce(jsonResponse({ items: [hostMemberListItem(42)], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchHostMembers({ clubSlug: "reading-sai" })).resolves.toMatchObject({
      items: [{ avatarKey: "future-avatar" }],
    });
    await expect(fetchHostMembers({ clubSlug: "reading-sai" })).rejects.toThrow();
  });

  it("parses visibility responses and returns the composer result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.includes("/__internal/client-contract-status")
        ? new Response(JSON.stringify({ schemaVersion: 1, supportedHostClientContracts: ["v3"] }), {
            headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
          })
        : jsonResponse({
            session: hostSessionDetail(),
            composer: {
              sessionId: "session-7",
              eventType: "NEXT_BOOK_PUBLISHED",
              contentRevision: "b".repeat(64),
            },
          }),
    )));

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
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve(
      url.includes("/__internal/client-contract-status")
        ? new Response(JSON.stringify({ schemaVersion: 1, supportedHostClientContracts: ["v3"] }), {
            headers: { "Cache-Control": "no-store", "Content-Type": "application/json" },
          })
        : jsonResponse({
            session: hostSessionDetail(),
            composer: {
              sessionId: "session-7",
              eventType: "NEXT_BOOK_PUBLISHED",
            },
          }),
    )));

    await expect(saveHostSessionVisibility(
      "session-7",
      { visibility: "MEMBER" },
      { clubSlug: "reading-sai" },
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

  it("recovers a defaults-only 401 as a read session expiry", async () => {
    const spy = vi.spyOn(sessionExpiry, "signalSessionExpired");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    await expect(fetchHostSessionScheduleDefaults({ clubSlug: "reading-sai" })).rejects.toThrow("ReadMatesSessionExpiredError");
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
