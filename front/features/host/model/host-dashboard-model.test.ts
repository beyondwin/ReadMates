import { describe, expect, it } from "vitest";
import {
  getHostDashboardChecklist,
  getHostDashboardChecklistView,
  getHostDashboardLedgerMetrics,
  getHostDashboardNextOperationAction,
  getHostDashboardPriorityItems,
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

describe("getHostDashboardPriorityItems", () => {
  it("orders actionable sources and caps the board at three items", () => {
    const items = getHostDashboardPriorityItems({
      session: currentSession,
      data: {
        ...cleanDashboard,
        rsvpPending: 4,
        publishPending: 2,
      },
      missingMembers: {
        count: 1,
        members: [],
      },
      notifications: {
        pending: 0,
        failed: 1,
        dead: 0,
        sentLast24h: 0,
        latestFailures: [],
      },
      recordAttention: {
        items: [],
        summary: {
          needsAttentionCount: 2,
          incompletePublishedCount: 1,
          draftCount: 1,
        },
      },
    });

    expect(items.map((item) => item.id)).toEqual([
      "missing-members",
      "notification-failure",
      "current-session",
    ]);
  });

  it("returns one stable action when every normalized count is zero", () => {
    expect(
      getHostDashboardPriorityItems({
        session: currentSession,
        data: {
          rsvpPending: -1,
          checkinMissing: -2,
          publishPending: -3,
          feedbackPending: -4,
        },
        missingMembers: null,
        notifications: {
          pending: 0,
          failed: 0,
          dead: 0,
          sentLast24h: 0,
          latestFailures: [],
        },
        recordAttention: {
          items: [],
          summary: {
            needsAttentionCount: 0,
            incompletePublishedCount: 0,
            draftCount: 0,
          },
        },
      }),
    ).toMatchObject([
      {
        id: "stable",
        count: 0,
        tone: "ok",
        href: "/app/host/sessions/session-7/edit",
      },
    ]);
  });
});

describe("getHostDashboardLedgerMetrics", () => {
  it("normalizes negative counts without hiding a record-query error", () => {
    expect(
      getHostDashboardLedgerMetrics(
        {
          rsvpPending: -1,
          checkinMissing: -2,
          publishPending: -3,
          feedbackPending: -4,
        },
        {
          items: [],
          summary: {
            needsAttentionCount: -5,
            incompletePublishedCount: 0,
            draftCount: -6,
          },
        },
      ).map((metric) => metric.value),
    ).toEqual([0, 0, 0, 0, 0]);

    expect(
      getHostDashboardLedgerMetrics(cleanDashboard, null)
        .find((metric) => metric.id === "record"),
    ).toMatchObject({
      value: 0,
      stateLabel: "불러오기 실패",
      tone: "warn",
    });
  });
});

describe("getHostDashboardChecklistView", () => {
  it("shows the pending step with adjacent context and retains the full timeline", () => {
    const all = getHostDashboardChecklist(currentSession, {
      ...cleanDashboard,
      rsvpPending: 2,
    });
    const view = getHostDashboardChecklistView(all);

    expect(view.all).toEqual(all);
    expect(view.highlighted).toHaveLength(3);
    expect(view.highlighted.map((item) => item.id)).toEqual([
      "question-reminder",
      "rsvp-meeting",
      "publication",
    ]);
  });
});
