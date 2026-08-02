import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberArchiveSessionDetailResponse } from "@/features/archive/api/archive-contracts";

const archiveApi = vi.hoisted(() => ({
  fetchArchiveSessions: vi.fn(),
  fetchMemberArchiveSession: vi.fn(),
  fetchMyArchiveQuestions: vi.fn(),
  fetchMyArchiveReviews: vi.fn(),
  fetchMyFeedbackDocuments: vi.fn(),
  fetchNotesFeed: vi.fn(),
}));

vi.mock("@/features/archive/api/archive-api", () => archiveApi);

import { combineArchiveListPages, fetchMemberArchiveSessionQueryData } from "./archive-queries";

const session: MemberArchiveSessionDetailResponse = {
  sessionId: "session-7",
  sessionNumber: 7,
  title: "지난 모임",
  bookTitle: "기록 책",
  bookAuthor: "기록 작가",
  bookImageUrl: null,
  date: "2026-07-01",
  state: "CLOSED",
  locationLabel: "Room 7",
  attendance: 4,
  total: 5,
  myAttendanceStatus: "ATTENDED",
  isHost: false,
  publicSummary: "공개 요약",
  publicHighlights: [{ text: "작성자가 있는 문장", sortOrder: 1, authorName: "기존 작성자", authorShortName: "기존", avatarKey: "book" }],
  clubQuestions: [],
  clubOneLiners: [],
  publicOneLiners: [],
  myQuestions: [],
  myCheckin: null,
  myOneLineReview: null,
  myLongReview: null,
  feedbackDocument: { available: false, readable: false, lockedReason: "NOT_AVAILABLE", title: null, uploadedAt: null },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("combineArchiveListPages", () => {
  it("appends next-page items per archive surface and keeps the trailing cursor", () => {
    const current = {
      sessions: { items: [{ sessionId: "s1" }], nextCursor: "s2" },
      questions: { items: [{ id: "q1" }], nextCursor: null },
      reviews: { items: [{ id: "r1" }], nextCursor: null },
      reports: { items: [{ sessionId: "f1" }], nextCursor: null },
    };
    const next = {
      sessions: { items: [{ sessionId: "s2" }], nextCursor: null },
      questions: { items: [], nextCursor: null },
      reviews: { items: [], nextCursor: null },
      reports: { items: [], nextCursor: null },
    };

    const combined = combineArchiveListPages([current, next]);

    expect(combined.sessions.items.map((item) => item.sessionId)).toEqual(["s1", "s2"]);
    expect(combined.sessions.nextCursor).toBeNull();
  });
});

describe("fetchMemberArchiveSessionQueryData", () => {
  it("always enriches an existing session with authored LONG_REVIEW notes", async () => {
    archiveApi.fetchMemberArchiveSession.mockResolvedValue(session);
    archiveApi.fetchNotesFeed.mockResolvedValue({
      items: [
        {
          sessionId: "session-7",
          sessionNumber: 7,
          bookTitle: "기록 책",
          date: "2026-07-01",
          authorName: "서평 작성자",
          authorShortName: "서평",
          avatarKey: "turtle",
          kind: "LONG_REVIEW",
          text: "공개 서평",
        },
        {
          sessionId: "session-7",
          sessionNumber: 7,
          bookTitle: "기록 책",
          date: "2026-07-01",
          authorName: null,
          authorShortName: null,
          avatarKey: "fox",
          kind: "LONG_REVIEW",
          text: "작성자가 없는 서평",
        },
      ],
      nextCursor: null,
    });

    const result = await fetchMemberArchiveSessionQueryData("session-7", { clubSlug: "reading-sai" });

    expect(result?.clubLongReviews).toEqual([
      {
        authorName: "서평 작성자",
        authorShortName: "서평",
        avatarKey: "turtle",
        body: "공개 서평",
      },
    ]);
    expect(archiveApi.fetchNotesFeed).toHaveBeenCalledWith(
      "session-7",
      { clubSlug: "reading-sai" },
      { limit: 60 },
      undefined,
    );
  });

  it("returns an enriched empty long-review collection when notes fail", async () => {
    archiveApi.fetchMemberArchiveSession.mockResolvedValue(session);
    archiveApi.fetchNotesFeed.mockRejectedValue(new Error("notes unavailable"));

    await expect(fetchMemberArchiveSessionQueryData("session-7")).resolves.toMatchObject({
      sessionId: "session-7",
      clubLongReviews: [],
    });
  });
});
