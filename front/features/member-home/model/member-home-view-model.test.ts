import { describe, expect, it } from "vitest";
import {
  getMemberHomeNextReadingAction,
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

  it("keeps no-session and viewer states read-safe", () => {
    expect(getMemberHomeNextReadingAction({ session: null, isViewer: false, canWrite: true })).toEqual({
      state: "NO_SESSION",
      label: "세션 대기",
      message: "호스트가 세션을 열면 준비를 시작합니다.",
      href: null,
      ctaLabel: null,
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
});
