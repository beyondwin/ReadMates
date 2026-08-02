import { describe, expect, it } from "vitest";
import {
  guestMemberHomeReadView,
  memberHomeReadViewFromRouteData,
  type GuestMemberHomeReadSource,
} from "./member-home-read-view";
import { GUEST_READ_SURFACE_CAPABILITIES, MEMBER_READ_SURFACE_CAPABILITIES } from "@/shared/model/read-surface-capabilities";

const guestHome = {
  current: {
    currentSession: {
      sessionId: "session-7",
      sessionNumber: 7,
      title: "파도를 읽는 밤",
      bookTitle: "파도",
      bookAuthor: "작가",
      bookLink: null,
      bookImageUrl: null,
      date: "2026-08-09",
      startTime: "19:00",
      endTime: "21:00",
      questionDeadlineAt: "2026-08-08T23:59:00Z",
      locationLabel: "Room 7",
      meetingUrl: "https://private.example.test/meeting",
      meetingPasscode: "private-passcode",
      accountName: "private-account",
      membershipId: "private-membership",
      attendees: [
        {
          displayName: "읽는이",
          avatarKey: "hedgehog-green-book",
          rsvpStatus: "GOING",
          attendanceStatus: "UNKNOWN",
          membershipId: "private-attendee-membership",
        },
      ],
      board: { questions: [], longReviews: [] },
    },
  },
  upcoming: {
    items: [
      {
        sessionId: "session-8",
        sessionNumber: 8,
        title: "다음 모임",
        bookTitle: "다음 책",
        bookAuthor: "다음 작가",
        bookImageUrl: null,
        date: "2026-09-09",
        startTime: "19:00",
        endTime: "21:00",
        locationLabel: "Room 7",
      },
    ],
    nextCursor: null,
  },
  recentNotes: {
    items: [
      {
        sessionId: "session-6",
        sessionNumber: 6,
        bookTitle: "지난 책",
        date: "2026-07-09",
        authorName: null,
        authorShortName: null,
        avatarKey: null,
        kind: "HIGHLIGHT" as const,
        text: "공개된 기록",
      },
    ],
    nextCursor: null,
  },
} satisfies GuestMemberHomeReadSource & Record<string, unknown>;

describe("member home read view adapters", () => {
  it("projects guest public home data without private or personal state", () => {
    const view = guestMemberHomeReadView(guestHome);

    expect(view).toMatchObject({
      displayName: null,
      isHost: false,
      current: { currentSession: { bookTitle: "파도" } },
      capabilities: GUEST_READ_SURFACE_CAPABILITIES,
      upcomingSessions: [{ bookTitle: "다음 책", locationLabel: null }],
    });
    expect(view.current.currentSession).toMatchObject({
      locationLabel: null,
      meetingUrl: null,
      meetingPasscode: null,
      myRsvpStatus: null,
      myCheckin: null,
      myQuestions: [],
    });
    expect(JSON.stringify(view)).not.toMatch(/accountName|membershipId/);
    expect(JSON.stringify(view)).not.toContain("Room 7");
  });

  it("preserves member identity, private session values, and write capabilities", () => {
    const view = memberHomeReadViewFromRouteData({
      auth: {
        authenticated: true,
        userId: "user-1",
        membershipId: "membership-1",
        clubId: "club-1",
        email: "member@example.test",
        displayName: "수",
        accountName: "회원 계정",
        role: "HOST",
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
        avatarKey: "hedgehog-green-book",
      },
      current: {
        currentSession: {
          sessionId: "session-7",
          sessionNumber: 7,
          title: "파도를 읽는 밤",
          bookTitle: "파도",
          bookAuthor: "작가",
          bookLink: null,
          bookImageUrl: null,
          date: "2026-08-09",
          startTime: "19:00",
          endTime: "21:00",
          locationLabel: "Room 7",
          meetingUrl: "https://meet.example.test/room",
          meetingPasscode: "member-passcode",
          questionDeadlineAt: "2026-08-08T23:59:00Z",
          myRsvpStatus: "GOING",
          myCheckin: { readingProgress: 40 },
          myQuestions: [],
          myOneLineReview: null,
          myLongReview: null,
          board: { questions: [], longReviews: [] },
          attendees: [],
        },
      },
      noteFeedItems: [],
      upcomingSessions: [],
    });

    expect(view).toMatchObject({
      displayName: "수",
      isHost: true,
      capabilities: MEMBER_READ_SURFACE_CAPABILITIES,
      current: {
        currentSession: {
          locationLabel: "Room 7",
          meetingUrl: "https://meet.example.test/room",
          meetingPasscode: "member-passcode",
          myRsvpStatus: "GOING",
          myCheckin: { readingProgress: 40 },
        },
      },
    });
  });
});
