import { describe, expect, it } from "vitest";
import {
  getHostDashboardNextOperationAction,
  type HostDashboardCurrentSession,
  type HostDashboardData,
  type MissingCurrentSessionMembersSummary,
} from "./host-dashboard-model";

const cleanDashboard = {
  rsvpPending: 0,
  checkinMissing: 0,
  publishPending: 0,
  feedbackPending: 0,
} satisfies HostDashboardData;

const currentSession = {
  sessionId: "session-7",
  sessionNumber: 7,
  bookTitle: "테스트 책",
  bookAuthor: "테스트 저자",
  date: "2026-06-17",
  startTime: "20:00",
  locationLabel: "온라인",
  meetingUrl: "https://meet.google.com/readmates-host",
  myCheckin: {
    readingProgress: 62,
  },
  attendees: [
    {
      rsvpStatus: "GOING",
    },
  ],
  board: {
    questions: [],
  },
} satisfies HostDashboardCurrentSession;

describe("getHostDashboardNextOperationAction", () => {
  it("marks missing current-session members as host setup required in the reading loop", () => {
    const missingMembers = {
      count: 1,
      members: [
        {
          membershipId: "membership-new",
          displayName: "새 멤버",
          email: "new-member@example.com",
        },
      ],
    } satisfies MissingCurrentSessionMembersSummary;

    expect(getHostDashboardNextOperationAction(currentSession, cleanDashboard, missingMembers)).toMatchObject({
      title: "새 멤버의 이번 세션 참여 여부 결정",
      loopState: "HOST_SETUP_REQUIRED",
      loopLabel: "호스트 준비 필요",
      loopBridge: "호스트가 세션 정보, 멤버 상태, 공개 범위, 운영 대기 항목을 먼저 닫아야 합니다.",
    });
  });

  it("keeps pending host operation counts in host setup state", () => {
    expect(
      getHostDashboardNextOperationAction(
        currentSession,
        {
          ...cleanDashboard,
          rsvpPending: 2,
        },
        null,
      ),
    ).toMatchObject({
      title: "RSVP 미응답 확인",
      loopState: "HOST_SETUP_REQUIRED",
      loopLabel: "호스트 준비 필요",
    });
  });

  it("marks a clean current session as ready in the reading loop", () => {
    expect(getHostDashboardNextOperationAction(currentSession, cleanDashboard, null)).toMatchObject({
      title: "대기 중인 운영 항목 없음",
      loopState: "SESSION_READY",
      loopLabel: "세션 준비됨",
      loopBridge: "호스트 운영과 멤버 준비가 큰 문제 없이 모임을 기다릴 수 있는 상태입니다.",
    });
  });
});
