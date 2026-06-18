import { describe, expect, it } from "vitest";
import {
  getMemberHomeNextReadingAction,
  getMemberHomeRecentRecordEntry,
  type MemberHomeCurrentSessionView,
  type MemberHomeNoteFeedItemView,
} from "./member-home-view-model";

const session = {
  sessionId: "session-7",
  sessionNumber: 7,
  title: "7회차 모임 · 테스트 책",
  bookTitle: "테스트 책",
  bookAuthor: "테스트 저자",
  bookLink: null,
  bookImageUrl: null,
  date: "2026-05-20",
  startTime: "20:00",
  endTime: "22:00",
  locationLabel: "온라인",
  meetingUrl: null,
  meetingPasscode: null,
  questionDeadlineAt: "2026-05-19T14:59:00Z",
  myRsvpStatus: "GOING",
  myCheckin: {
    readingProgress: 80,
  },
  myQuestions: [
    {
      priority: 1,
      text: "첫 번째 질문입니다.",
      draftThought: null,
      authorName: "이멤버5",
      authorShortName: "수",
    },
    {
      priority: 2,
      text: "두 번째 질문입니다.",
      draftThought: null,
      authorName: "이멤버5",
      authorShortName: "수",
    },
  ],
  myOneLineReview: {
    text: "함께 읽은 뒤 남긴 회고입니다.",
  },
  myLongReview: null,
  board: {
    questions: [],
    longReviews: [],
  },
  attendees: [],
} satisfies NonNullable<MemberHomeCurrentSessionView["currentSession"]>;

const noteFeedItems: MemberHomeNoteFeedItemView[] = [
  {
    sessionId: "session-6",
    sessionNumber: 6,
    bookTitle: "지난 책",
    date: "2026-04-15",
    authorName: "이멤버5",
    authorShortName: "수",
    kind: "ONE_LINE_REVIEW",
    text: "지난 세션 기록입니다.",
  },
];

describe("member-home view model", () => {
  it("uses the shared reading loop to guide prepared members toward archive and notes", () => {
    expect(
      getMemberHomeNextReadingAction({
        session,
        isViewer: false,
        canWrite: true,
        noteFeedItems,
      }),
    ).toMatchObject({
      state: "ARCHIVE_AVAILABLE",
      label: "아카이브 연결",
      message: "최근 보존된 기록을 이어 읽을 수 있어요.",
      href: "/app/notes",
      ctaLabel: "노트 보기",
    });
  });

  it("prioritizes member prep actions before ready states", () => {
    expect(
      getMemberHomeNextReadingAction({
        session: {
          ...session,
          myRsvpStatus: "NO_RESPONSE",
          myCheckin: null,
          myQuestions: [],
          myOneLineReview: null,
        },
        isViewer: false,
        canWrite: true,
        today: new Date(2026, 4, 19),
      }),
    ).toMatchObject({
      state: "MEMBER_PREP_REQUIRED",
      label: "멤버 준비 필요",
      message: "RSVP를 먼저 선택해 주세요.",
      href: "/app/session/current",
      ctaLabel: "RSVP 하기",
    });

    expect(
      getMemberHomeNextReadingAction({
        session: {
          ...session,
          myCheckin: null,
          myOneLineReview: null,
        },
        isViewer: false,
        canWrite: true,
        today: new Date(2026, 4, 19),
      }).message,
    ).toBe("읽기 진행률을 남겨 주세요.");

    expect(
      getMemberHomeNextReadingAction({
        session: {
          ...session,
          myQuestions: [],
          myOneLineReview: null,
        },
        isViewer: false,
        canWrite: true,
        today: new Date(2026, 4, 19),
      }).message,
    ).toBe("질문 2개를 더 준비해 주세요.");
  });

  it("moves prepared members from current session to notes before generic ready copy", () => {
    expect(
      getMemberHomeNextReadingAction({
        session: {
          ...session,
          myOneLineReview: { text: "짧은 회고입니다." },
          myLongReview: { body: "긴 회고입니다." },
        },
        isViewer: false,
        canWrite: true,
        noteFeedItems,
        today: new Date(2026, 4, 21),
      }),
    ).toMatchObject({
      state: "ARCHIVE_AVAILABLE",
      message: "최근 보존된 기록을 이어 읽을 수 있어요.",
      href: "/app/notes",
      ctaLabel: "노트 보기",
    });
  });

  it("points post-session members at reflection before notes when reflection is missing", () => {
    expect(
      getMemberHomeNextReadingAction({
        session: {
          ...session,
          myOneLineReview: null,
          myLongReview: null,
        },
        isViewer: false,
        canWrite: true,
        noteFeedItems,
        today: new Date(2026, 4, 21),
      }),
    ).toMatchObject({
      state: "REFLECTION_DUE",
      message: "모임 후 한줄평이나 서평을 남겨 주세요.",
      href: "/app/session/current",
      ctaLabel: "회고 남기기",
    });
  });

  it("attaches reading pace when member can write and has a checkin", () => {
    const action = getMemberHomeNextReadingAction({
      session: {
        ...session,
        date: "2026-06-06",
        myCheckin: { readingProgress: 30 },
        myOneLineReview: null,
        myLongReview: null,
      },
      isViewer: false,
      canWrite: true,
      today: new Date(2026, 5, 4),
    });

    expect(action.pace?.tier).toBe("URGENT");
  });

  it("leaves pace null when there is no session", () => {
    const action = getMemberHomeNextReadingAction({ session: null, isViewer: false, canWrite: true });

    expect(action.pace).toBeNull();
  });

  it("keeps no-session and viewer states read-safe", () => {
    expect(getMemberHomeNextReadingAction({ session: null, isViewer: false, canWrite: true })).toEqual({
      state: "NO_SESSION",
      label: "세션 대기",
      message: "호스트가 세션을 열면 준비를 시작합니다.",
      href: null,
      ctaLabel: null,
      pace: null,
    });

    expect(getMemberHomeNextReadingAction({ session, isViewer: true, canWrite: false })).toMatchObject({
      state: "SESSION_READY",
      label: "세션 준비됨",
      message: "세션을 읽고 공동 보드를 확인할 수 있어요.",
      href: "/app/session/current",
      ctaLabel: "세션 읽기",
    });
  });

  it("keeps suspended or approval-inactive members read-only even when they are not viewers", () => {
    expect(
      getMemberHomeNextReadingAction({
        session: {
          ...session,
          myCheckin: null,
          myOneLineReview: null,
        },
        isViewer: false,
        canWrite: false,
        today: new Date(2026, 4, 19),
      }),
    ).toMatchObject({
      state: "SESSION_READY",
      label: "세션 준비됨",
      message: "세션을 읽고 공동 보드를 확인할 수 있어요.",
      href: "/app/session/current",
      ctaLabel: "세션 읽기",
    });
  });

  it("keeps read-only post-session members out of write-only reflection due state", () => {
    const action = getMemberHomeNextReadingAction({
      session: {
        ...session,
        myOneLineReview: null,
        myLongReview: null,
      },
      isViewer: false,
      canWrite: false,
      today: new Date(2026, 4, 21),
    });

    expect(action).toMatchObject({
      state: "SESSION_READY",
      label: "세션 준비됨",
      message: "세션을 읽고 공동 보드를 확인할 수 있어요.",
      href: "/app/session/current",
      ctaLabel: "세션 읽기",
    });
    expect(action.state).not.toBe("REFLECTION_DUE");
    expect(action.label).not.toBe("회고 필요");
  });

  it("derives the latest preserved record entry from note feed items", () => {
    expect(getMemberHomeRecentRecordEntry(noteFeedItems)).toEqual({
      sessionId: "session-6",
      sessionNumber: 6,
      bookTitle: "지난 책",
      date: "2026-04-15",
      kindLabels: ["한줄평"],
      href: "/app/sessions/session-6",
      feedbackHref: "/app/feedback/session-6",
      feedbackState: "UNKNOWN",
      feedbackStatusLabel: "피드백 문서는 열람 화면에서 확인합니다.",
      returnStateLabel: "지난 모임 회고",
      summary: "지난 책의 기록과 피드백을 이어 읽을 수 있어요.",
    });
  });

  it("groups the latest preserved record entry by first session and dedupes labels in display order", () => {
    const items: MemberHomeNoteFeedItemView[] = [
      {
        sessionId: "session-8",
        sessionNumber: 8,
        bookTitle: "긴 제목의 다음 책",
        date: "2026-06-18",
        authorName: "이멤버5",
        authorShortName: "수",
        kind: "QUESTION",
        text: "첫 질문입니다.",
      },
      {
        sessionId: "session-8",
        sessionNumber: 8,
        bookTitle: "긴 제목의 다음 책",
        date: "2026-06-18",
        authorName: "이멤버5",
        authorShortName: "수",
        kind: "QUESTION",
        text: "두 번째 질문입니다.",
      },
      {
        sessionId: "session-8",
        sessionNumber: 8,
        bookTitle: "긴 제목의 다음 책",
        date: "2026-06-18",
        authorName: null,
        authorShortName: null,
        kind: "HIGHLIGHT",
        text: "함께 남긴 하이라이트입니다.",
      },
      {
        sessionId: "session-7",
        sessionNumber: 7,
        bookTitle: "이전 책",
        date: "2026-05-16",
        authorName: "이멤버4",
        authorShortName: "사",
        kind: "ONE_LINE_REVIEW",
        text: "이전 세션 한줄평입니다.",
      },
    ];

    expect(getMemberHomeRecentRecordEntry(items)).toEqual({
      sessionId: "session-8",
      sessionNumber: 8,
      bookTitle: "긴 제목의 다음 책",
      date: "2026-06-18",
      kindLabels: ["질문", "하이라이트"],
      href: "/app/sessions/session-8",
      feedbackHref: "/app/feedback/session-8",
      feedbackState: "UNKNOWN",
      feedbackStatusLabel: "피드백 문서는 열람 화면에서 확인합니다.",
      returnStateLabel: "지난 모임 회고",
      summary: "긴 제목의 다음 책의 기록과 피드백을 이어 읽을 수 있어요.",
    });
  });

  it("returns null when there is no preserved record entry", () => {
    expect(getMemberHomeRecentRecordEntry([])).toBeNull();
  });
});
