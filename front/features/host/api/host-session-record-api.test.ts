import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HostSessionHistoryPageResponseSchema,
  HostSessionRecordApplyResultResponseSchema,
  HostSessionRecordEditorResponseSchema,
  SessionRecordSnapshotResponseSchema,
} from "./host-session-record-contracts";
import {
  applyHostSessionRecord,
  deleteHostSessionRecordDraft,
  fetchHostSessionHistory,
  fetchHostSessionRecordCapabilities,
  fetchHostSessionRecordEditor,
  fetchHostSessionRecordLedger,
  previewHostSessionRecordApply,
  restoreHostSessionRevisionToDraft,
  saveHostSessionRecordDraft,
} from "./host-session-record-api";
import type { SessionRecordSnapshot } from "./host-session-record-contracts";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function snapshot(): SessionRecordSnapshot {
  return {
    schema: "readmates-session-record:v1",
    visibility: "MEMBER",
    publicationSummary: "함께 읽은 기록",
    highlights: [],
    oneLineReviews: [],
    feedbackDocument: {
      fileName: "session-28.md",
      title: "28회차 피드백",
      markdown: "# 피드백",
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("host session record API", () => {
  it("uses club-scoped URLs and exact record apply bodies", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/record-editor")) {
        return Promise.resolve(jsonResponse({
          sessionId: "session-28",
          liveRevision: 2,
          liveSnapshot: snapshot(),
          draft: null,
          draftLiveBaseStale: false,
          validationSummary: { valid: true, issues: [] },
        }));
      }
      if (url.includes("/record-draft")) {
        return Promise.resolve(jsonResponse({
          sessionId: "session-28",
          baseLiveRevision: 2,
          draftRevision: 3,
          source: "MANUAL",
          restoredFromRevisionId: null,
          snapshot: snapshot(),
          updatedAt: "2026-07-23T10:00:00+09:00",
        }));
      }
      return Promise.resolve(jsonResponse({
        revisionId: "revision-3",
        liveRevision: 3,
        decisionId: "decision-1",
        notificationDecision: "SKIP",
        eventId: null,
      }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const context = { clubSlug: "reading-sai" };

    await fetchHostSessionRecordEditor("session-28", context);
    await saveHostSessionRecordDraft("session-28", {
      expectedDraftRevision: 2,
      snapshot: snapshot(),
    }, context);
    await applyHostSessionRecord("session-28", {
      previewId: "preview-1",
      expectedDraftRevision: 3,
      expectedLiveRevision: 2,
      notificationDecision: "SKIP",
    }, context);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/bff/api/host/sessions/session-28/record-editor?clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/bff/api/host/sessions/session-28/record-draft?clubSlug=reading-sai",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          expectedDraftRevision: 2,
          snapshot: snapshot(),
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/bff/api/host/sessions/session-28/record-apply?clubSlug=reading-sai",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          previewId: "preview-1",
          expectedDraftRevision: 3,
          expectedLiveRevision: 2,
          notificationDecision: "SKIP",
        }),
      }),
    );
  });

  it("encodes history pagination and session identifiers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchHostSessionHistory(
      "session/28",
      { limit: 20, cursor: "next page" },
      { clubSlug: "reading-sai" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/host/sessions/session%2F28/history?limit=20&cursor=next+page&clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("mirrors capability, ledger, preview, delete, and restore endpoints", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/capabilities")) {
        return Promise.resolve(jsonResponse({
          sessionRecordDrafts: true,
          hostActionNotificationConfirmationRequired: true,
        }));
      }
      if (url.includes("/api/host/sessions?")) {
        return Promise.resolve(jsonResponse({
          items: [],
          nextCursor: null,
          summary: {
            needsAttentionCount: 7,
            incompletePublishedCount: 4,
            draftCount: 2,
          },
        }));
      }
      if (url.includes("/record-apply-preview")) {
        return Promise.resolve(jsonResponse({
          previewId: "preview-1",
          eventType: "SESSION_RECORD_UPDATED",
          targetCount: 2,
          expectedInAppCount: 2,
          expectedEmailCount: 2,
          excludedCount: 0,
          expiresAt: "2026-07-23T10:05:00+09:00",
        }));
      }
      if (url.includes("/restore-to-draft")) {
        return Promise.resolve(jsonResponse({
          sessionId: "session/28",
          baseLiveRevision: 2,
          draftRevision: 3,
          source: "RESTORED",
          restoredFromRevisionId: "revision/2",
          snapshot: snapshot(),
          updatedAt: "2026-07-23T10:00:00+09:00",
        }));
      }
      if (init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const context = { clubSlug: "reading-sai" };

    await fetchHostSessionRecordCapabilities(context);
    const ledgerPage = await fetchHostSessionRecordLedger({
      search: "  Moby   Dick  ",
      state: "CLOSED",
      recordStatus: "INCOMPLETE",
      needsAttention: true,
      page: { limit: 50, cursor: "ledger page" },
    }, context);
    await previewHostSessionRecordApply("session/28", {
      expectedDraftRevision: 3,
      expectedLiveRevision: 2,
    }, context);
    await deleteHostSessionRecordDraft("session/28", 3, context);
    await restoreHostSessionRevisionToDraft(
      "session/28",
      "revision/2",
      { expectedDraftRevision: 3 },
      context,
    );

    expect(ledgerPage.summary).toEqual({
      needsAttentionCount: 7,
      incompletePublishedCount: 4,
      draftCount: 2,
    });
    expect(fetchMock.mock.calls.map(([url, init]) => [
      (init as RequestInit | undefined)?.method ?? "GET",
      url,
    ])).toEqual([
      ["GET", "/api/bff/api/host/capabilities?clubSlug=reading-sai"],
      [
        "GET",
        "/api/bff/api/host/sessions?search=Moby+Dick&state=CLOSED&recordStatus=INCOMPLETE&needsAttention=true&limit=50&cursor=ledger+page&clubSlug=reading-sai",
      ],
      ["POST", "/api/bff/api/host/sessions/session%2F28/record-apply-preview?clubSlug=reading-sai"],
      [
        "DELETE",
        "/api/bff/api/host/sessions/session%2F28/record-draft?expectedDraftRevision=3&clubSlug=reading-sai",
      ],
      [
        "POST",
        "/api/bff/api/host/sessions/session%2F28/revisions/revision%2F2/restore-to-draft?clubSlug=reading-sai",
      ],
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ expectedDraftRevision: 3, expectedLiveRevision: 2 }),
    }));
    expect(fetchMock.mock.calls[4]?.[1]).toEqual(expect.objectContaining({
      body: JSON.stringify({ expectedDraftRevision: 3 }),
    }));
  });

  it("preserves structured API errors when draft deletion fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: "SESSION_RECORD_DRAFT_STALE",
      message: "다른 호스트가 먼저 초안을 수정했습니다.",
      status: 409,
    }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(deleteHostSessionRecordDraft("session-28", 3, {
      clubSlug: "reading-sai",
    })).rejects.toMatchObject({
      name: "ReadmatesApiError",
      status: 409,
      code: "SESSION_RECORD_DRAFT_STALE",
      message: "다른 호스트가 먼저 초안을 수정했습니다.",
      fallback: false,
    });
  });
});

describe("host session record response schemas", () => {
  it("rejects missing page fields and history items without a type", () => {
    expect(HostSessionHistoryPageResponseSchema.safeParse({ nextCursor: null }).success).toBe(false);
    expect(HostSessionHistoryPageResponseSchema.safeParse({ items: [] }).success).toBe(false);
    expect(HostSessionHistoryPageResponseSchema.safeParse({
      items: [{
        id: "history-1",
        createdAt: "2026-07-23T10:00:00+09:00",
        actorMembershipId: "membership-1",
        changedFields: [],
        attendanceTransitions: [],
        revisionId: null,
        revisionVersion: null,
        revisionSource: null,
        restoredFromRevisionId: null,
        notificationEventId: null,
      }],
      nextCursor: null,
    }).success).toBe(false);
  });

  it("rejects negative revisions and unknown notification decisions", () => {
    expect(HostSessionRecordEditorResponseSchema.safeParse({
      sessionId: "session-28",
      liveRevision: -1,
      liveSnapshot: snapshot(),
      draft: null,
      draftLiveBaseStale: false,
      validationSummary: { valid: true, issues: [] },
    }).success).toBe(false);
    expect(HostSessionRecordApplyResultResponseSchema.safeParse({
      revisionId: "revision-3",
      liveRevision: 3,
      decisionId: "decision-1",
      notificationDecision: "LATER",
      eventId: null,
    }).success).toBe(false);
  });

  it("accepts only the v1 snapshot schema and rejects unknown snapshot fields", () => {
    expect(SessionRecordSnapshotResponseSchema.safeParse({
      ...snapshot(),
      schema: "readmates-session-record:v2",
    }).success).toBe(false);
    expect(SessionRecordSnapshotResponseSchema.safeParse({
      ...snapshot(),
      privateEvidence: "must not be silently ignored",
    }).success).toBe(false);
    expect(SessionRecordSnapshotResponseSchema.safeParse({
      ...snapshot(),
      highlights: [{
        membershipId: "membership-1",
        authorDisplayName: "Alice",
        text: "기억할 문장",
        privateEmail: "must not be silently ignored",
      }],
    }).success).toBe(false);
  });
});
