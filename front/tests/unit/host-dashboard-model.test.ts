import { describe, expect, it } from "vitest";
import {
  formatHostSessionDday,
  getHostDashboardChecklist,
  getHostDashboardNextOperationAction,
  getHostDashboardPublicationFeedbackRows,
  getHostDashboardSessionMetrics,
  getHostDashboardSessionPhase,
  getMissingCurrentSessionMembersSummary,
  type HostDashboardCurrentSession,
  type HostDashboardData,
} from "@/features/host/model/host-dashboard-model";

const emptyDashboard: HostDashboardData = {
  rsvpPending: 0,
  checkinMissing: 0,
  publishPending: 0,
  feedbackPending: 0,
};

const session: HostDashboardCurrentSession = {
  sessionId: "session-7",
  sessionNumber: 7,
  bookTitle: "테스트 책",
  bookAuthor: "테스트 저자",
  date: "2026-05-20",
  startTime: "20:00",
  locationLabel: "온라인",
  meetingUrl: "https://meet.google.com/readmates-host",
  myCheckin: {
    readingProgress: 62,
  },
  attendees: [{ rsvpStatus: "NO_RESPONSE" }, { rsvpStatus: "GOING" }],
  board: {
    questions: [{ priority: 1 }, { priority: 2 }],
    oneLineReviews: [{ authorName: "안멤버1" }],
  },
};

describe("host dashboard model", () => {
  it("builds no-session phase, next action, and checklist guidance", () => {
    expect(getHostDashboardSessionPhase(null)).toMatchObject({
      eyebrow: "EMPTY",
      title: "열린 세션 없음",
      status: "세션 필요",
      tone: "default",
    });
    expect(getHostDashboardNextOperationAction(null, emptyDashboard, null)).toMatchObject({
      title: "새 세션 문서 만들기",
      href: null,
      unavailableReason: "아래 세션 준비 문서에서 새 세션 만들기를 사용하세요.",
    });
    expect(getHostDashboardChecklist(null, emptyDashboard).find((item) => item.id === "session-basics")).toMatchObject({
      state: "guidance",
      statusLabel: "안내",
      helper: "세션을 만들면 상태를 확인할 수 있습니다.",
    });
  });

  it("builds upcoming session phase and metrics", () => {
    const phase = getHostDashboardSessionPhase(session, new Date(2026, 4, 17, 12));

    expect(session.myCheckin).not.toHaveProperty("note");
    expect(session.board).not.toHaveProperty("checkins");
    expect(formatHostSessionDday(session.date, new Date(2026, 4, 17, 12))).toBe("D-3");
    expect(phase).toMatchObject({
      eyebrow: "No.07 · D-3",
      title: "다가오는 세션",
      status: "준비 중",
      tone: "accent",
    });
    expect(getHostDashboardSessionMetrics(session, phase.status)).toEqual([
      ["참석", "1/2"],
      ["읽기", "1/2"],
      ["질문", "2/10"],
      ["상태", "준비 중"],
    ]);
  });

  it("derives the reading metric from myCheckin only", () => {
    expect(getHostDashboardSessionMetrics({ ...session, myCheckin: null }, "준비 중")).toContainEqual(["읽기", "0/2"]);
    expect(getHostDashboardSessionMetrics(session, "준비 중")).toContainEqual(["읽기", "1/2"]);
  });

  it("builds D-day session phase", () => {
    expect(getHostDashboardSessionPhase(session, new Date(2026, 4, 20, 8))).toMatchObject({
      eyebrow: "No.07 · D-day",
      title: "오늘 진행 세션",
      status: "진행 중",
      tone: "warn",
    });
  });

  it("builds overdue session phase", () => {
    expect(getHostDashboardSessionPhase(session, new Date(2026, 4, 23, 8))).toMatchObject({
      eyebrow: "No.07 · D+3",
      title: "종료일이 지난 열린 세션",
      status: "마감 필요",
      tone: "warn",
    });
  });

  it("keeps pending publication as aggregate guidance", () => {
    const data = { ...emptyDashboard, publishPending: 2 };

    expect(getHostDashboardPublicationFeedbackRows(data)[0]).toEqual({
      label: "공개 기록",
      value: "2개 대기",
      helper: "공개 요약과 하이라이트 편집이 필요합니다.",
      tone: "accent",
    });
    expect(getHostDashboardNextOperationAction(session, data, null)).toMatchObject({
      title: "공개 요약 정리",
      href: null,
      label: "세션 기록에서 선택",
    });
    expect(getHostDashboardChecklist(session, data).find((item) => item.id === "publication")).toMatchObject({
      state: "pending",
      statusLabel: "확인 필요",
      helper: "공개 대기 세션 2개",
    });
  });

  it("keeps pending feedback as aggregate guidance", () => {
    const data = { ...emptyDashboard, feedbackPending: 3 };

    expect(getHostDashboardPublicationFeedbackRows(data)[1]).toEqual({
      label: "피드백 문서",
      value: "3개 대기",
      helper: "회차 피드백 문서 업로드가 필요합니다.",
      tone: "warn",
    });
    expect(getHostDashboardNextOperationAction(session, data, null)).toMatchObject({
      title: "피드백 문서 등록",
      href: null,
      label: "세션 기록에서 선택",
    });
    expect(getHostDashboardChecklist(session, data).find((item) => item.id === "feedback")).toMatchObject({
      state: "pending",
      statusLabel: "확인 필요",
      helper: "피드백 문서 등록 대기 3개",
    });
  });

  it("summarizes missing current-session members and resolved members", () => {
    const data = {
      ...emptyDashboard,
      currentSessionMissingMemberCount: 2,
      currentSessionMissingMembers: [
        { membershipId: "membership-new-1", displayName: "새 멤버1", email: "new1@example.com" },
        { membershipId: "membership-new-2", displayName: "새 멤버2", email: "new2@example.com" },
      ],
    };

    expect(getMissingCurrentSessionMembersSummary(data, new Set(["membership-new-1"]))).toEqual({
      count: 1,
      members: [{ membershipId: "membership-new-2", displayName: "새 멤버2", email: "new2@example.com" }],
    });
    expect(getHostDashboardNextOperationAction(session, data, getMissingCurrentSessionMembersSummary(data, new Set()))).toMatchObject({
      title: "새 멤버의 이번 세션 참여 여부 결정",
      href: null,
      label: "알림에서 처리",
    });
  });
});
