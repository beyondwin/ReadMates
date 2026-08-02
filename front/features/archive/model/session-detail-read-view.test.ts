import { describe, expect, it } from "vitest";
import { GUEST_READ_SURFACE_CAPABILITIES, MEMBER_READ_SURFACE_CAPABILITIES, VIEWER_READ_SURFACE_CAPABILITIES } from "@/shared/model/read-surface-capabilities";
import {
  guestSessionDetailReadView,
  memberSessionDetailReadView,
  type GuestSessionDetailReadSource,
  type MemberSessionDetailReadSource,
} from "./session-detail-read-view";

const guestDetail: GuestSessionDetailReadSource = {
  sessionId: "guest-session-7",
  sessionNumber: 7,
  title: "지난 모임",
  bookTitle: "기록 책",
  bookAuthor: "기록 작가",
  bookImageUrl: null,
  date: "2026-07-01",
  attendance: 4,
  total: 5,
  state: "CLOSED",
  summary: "공개 요약",
  highlights: [{ text: "공개 문장", sortOrder: 1, authorName: "문장 작성자", authorShortName: "문장", avatarKey: "book" }],
  questions: [{ priority: 1, text: "공개 질문", draftThought: "공개 생각", authorName: "질문 작성자", authorShortName: "질문", avatarKey: "fox" }],
  oneLiners: [{ text: "공개 한줄평", authorName: "한줄 작성자", authorShortName: "한줄", avatarKey: "owl" }],
  longReviews: [{ title: "공개 서평 제목", content: "공개 서평", authorName: "서평 작성자", authorShortName: "서평", avatarKey: "turtle" }],
};

const memberDetail: MemberSessionDetailReadSource = {
  sessionId: "member-session-7",
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
  publicHighlights: guestDetail.highlights.map((item) => ({ ...item, avatarKey: item.avatarKey ?? "book" })),
  clubQuestions: guestDetail.questions.map((item) => ({ ...item, avatarKey: item.avatarKey ?? "fox" })),
  clubOneLiners: guestDetail.oneLiners.map((item) => ({ ...item, avatarKey: item.avatarKey ?? "owl" })),
  publicOneLiners: guestDetail.oneLiners.map((item) => ({ ...item, avatarKey: item.avatarKey ?? "owl" })),
  clubLongReviews: [{ authorName: "서평 작성자", authorShortName: "서평", avatarKey: "turtle", body: "공개 서평" }],
  myQuestions: [],
  myCheckin: { readingProgress: 100 },
  myOneLineReview: { text: "내 한줄평" },
  myLongReview: { body: "내 서평" },
  feedbackDocument: {
    available: true,
    readable: true,
    lockedReason: null,
    title: "내부 피드백",
    uploadedAt: "2026-07-02T10:00:00Z",
  },
};

describe("session detail read views", () => {
  it("maps public guest detail while clearing location, personal state, and feedback metadata", () => {
    const guestView = guestSessionDetailReadView({
      ...guestDetail,
      locationLabel: "Room 7",
      feedbackDocument: { fileName: "private.pdf", uploadedAt: "2026-07-02" },
    } as GuestSessionDetailReadSource);

    expect(guestView).toMatchObject({
      bookTitle: "기록 책",
      publicSummary: "공개 요약",
      publicHighlights: [{ text: "공개 문장", authorName: "문장 작성자", avatarKey: "book" }],
      clubQuestions: [{ text: "공개 질문", authorName: "질문 작성자", avatarKey: "fox" }],
      clubOneLiners: [{ text: "공개 한줄평", authorName: "한줄 작성자", avatarKey: "owl" }],
      publicLongReviews: [{ body: "공개 서평", authorName: "서평 작성자", avatarKey: "turtle" }],
      capabilities: GUEST_READ_SURFACE_CAPABILITIES,
      feedbackDocument: null,
      myQuestions: [],
      myCheckin: null,
      myOneLineReview: null,
      myLongReview: null,
    });
    expect(guestView?.locationLabel).toBeNull();
    expect(JSON.stringify(guestView)).not.toMatch(/fileName|uploadedAt/);
    expect(JSON.stringify(guestView)).not.toContain("Room 7");
  });

  it("rejects an unknown guest session state", () => {
    expect(guestSessionDetailReadView({ ...guestDetail, state: "ARCHIVED" })).toBeNull();
  });

  it("maps enriched member long reviews without dropping protected state", () => {
    const memberView = memberSessionDetailReadView(memberDetail, MEMBER_READ_SURFACE_CAPABILITIES);

    expect(memberView).toMatchObject({
      locationLabel: "Room 7",
      myCheckin: { readingProgress: 100 },
      feedbackDocument: { title: "내부 피드백" },
      publicLongReviews: [{ body: "공개 서평", authorName: "서평 작성자" }],
      capabilities: MEMBER_READ_SURFACE_CAPABILITIES,
    });
  });

  it("omits member feedback metadata without reading it when feedback is forbidden", () => {
    const source = { ...memberDetail };
    Object.defineProperty(source, "feedbackDocument", {
      get() {
        throw new Error("feedback metadata must stay unread");
      },
    });

    expect(memberSessionDetailReadView(source, VIEWER_READ_SURFACE_CAPABILITIES).feedbackDocument).toBeNull();
  });
});
