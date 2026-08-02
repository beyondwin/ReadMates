import { describe, expect, it } from "vitest";
import type { CurrentSessionResponse } from "@/shared/model/current-session-contracts";
import { GUEST_READ_SURFACE_CAPABILITIES, VIEWER_READ_SURFACE_CAPABILITIES } from "@/shared/model/read-surface-capabilities";
import {
  guestCurrentSessionReadPage,
  memberCurrentSessionReadPage,
  type GuestCurrentSessionReadSource,
} from "./current-session-read-view";

const memberResponse: CurrentSessionResponse = {
  currentSession: {
    sessionId: "session-7",
    sessionNumber: 7,
    title: "여름 읽기 모임",
    bookTitle: "책의 제목",
    bookAuthor: "책의 저자",
    bookLink: "https://books.example.com/book",
    bookImageUrl: "https://images.example.com/book.jpg",
    date: "2026-08-07",
    startTime: "19:30",
    endTime: "21:00",
    locationLabel: "Room 7",
    meetingUrl: "https://meet.example.com/secret",
    meetingPasscode: "2468",
    questionDeadlineAt: "2026-08-06T23:59:59Z",
    myRsvpStatus: "GOING",
    myCheckin: { readingProgress: 50 },
    myQuestions: [
      {
        priority: 1,
        text: "가장 인상 깊은 장면은 무엇인가요?",
        draftThought: "마지막 장면",
        authorName: "읽는이",
        authorShortName: "읽",
        avatarKey: "book",
      },
    ],
    myOneLineReview: { text: "다시 읽고 싶은 책" },
    myLongReview: { body: "개인 서평" },
    board: {
      questions: [
        {
          priority: 1,
          text: "가장 인상 깊은 장면은 무엇인가요?",
          draftThought: "마지막 장면",
          authorName: "읽는이",
          authorShortName: "읽",
          avatarKey: "book",
        },
      ],
      longReviews: [
        {
          authorName: "읽는이",
          authorShortName: "읽",
          avatarKey: "book",
          body: "함께 나누고 싶은 서평",
        },
      ],
    },
    attendees: [
      {
        membershipId: "membership-private",
        accountName: "account-private",
        displayName: "읽는이",
        avatarKey: "book",
        role: "MEMBER",
        rsvpStatus: "GOING",
        attendanceStatus: "ATTENDED",
        participationStatus: "ACTIVE",
      },
    ],
  },
};

const guestResponse: GuestCurrentSessionReadSource = {
  currentSession: {
    sessionId: "session-7",
    sessionNumber: 7,
    title: "여름 읽기 모임",
    bookTitle: "책의 제목",
    bookAuthor: "책의 저자",
    bookLink: "https://books.example.com/book",
    bookImageUrl: "https://images.example.com/book.jpg",
    date: "2026-08-07",
    startTime: "19:30",
    endTime: "21:00",
    questionDeadlineAt: "2026-08-06T23:59:59Z",
    attendees: [
      {
        displayName: "읽는이",
        avatarKey: "book",
        rsvpStatus: "GOING",
        attendanceStatus: "ATTENDED",
      },
      {
        displayName: "알 수 없음",
        avatarKey: "unknown",
        rsvpStatus: "NOT_A_RSVP",
        attendanceStatus: "NOT_AN_ATTENDANCE_STATUS",
      },
    ],
    board: {
      questions: [
        {
          priority: 1,
          text: "가장 인상 깊은 장면은 무엇인가요?",
          draftThought: "마지막 장면",
          authorName: "읽는이",
          authorShortName: "읽",
          avatarKey: "book",
        },
      ],
      longReviews: [
        {
          title: "공유 서평",
          content: "함께 나누고 싶은 서평",
          authorName: "읽는이",
          authorShortName: "읽",
          avatarKey: "book",
        },
      ],
    },
  },
};

describe("current session read view", () => {
  it("keeps guest session content public while withholding protected and personal fields", () => {
    const memberView = memberCurrentSessionReadPage(memberResponse, VIEWER_READ_SURFACE_CAPABILITIES);
    const guestView = guestCurrentSessionReadPage(guestResponse);

    expect(guestView.currentSession).toMatchObject({
      bookTitle: memberView.currentSession?.bookTitle,
      board: memberView.currentSession?.board,
      capabilities: GUEST_READ_SURFACE_CAPABILITIES,
      myRsvpStatus: null,
      myCheckin: null,
      myQuestions: [],
      myOneLineReview: null,
      myLongReview: null,
      locationLabel: null,
      meetingUrl: null,
      meetingPasscode: null,
    });
    expect(JSON.stringify(guestView)).not.toMatch(/membershipId|accountName/);
    for (const protectedValue of ["Room 7", "https://meet.example.com/secret", "2468"]) {
      expect(JSON.stringify(guestView)).not.toContain(protectedValue);
    }
    expect(guestView.currentSession?.attendees[0].renderKey).toBe("guest-0-읽는이-book");
  });

  it("maps unrecognized guest attendance values to safe read-view statuses", () => {
    const guestView = guestCurrentSessionReadPage(guestResponse);

    expect(guestView.currentSession?.attendees[1]).toMatchObject({
      rsvpStatus: "NO_RESPONSE",
      attendanceStatus: "UNKNOWN",
      participationStatus: "ACTIVE",
    });
  });
});
