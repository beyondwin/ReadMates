import { describe, expect, it } from "vitest";
import {
  buildHostMeetingWorkspace,
  type HostMeetingWorkspaceInput,
} from "./host-session-workspace-model";

const baseInput = {
  currentUrl: "https://readmates.test/clubs/alpha/app/host/sessions/session-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost#meeting",
  meetingDate: "2026-08-21",
  today: "2026-08-20",
  unansweredResponseCount: 0,
  unknownAttendanceCount: 0,
  hasRecordDraft: false,
  recordDraftStale: false,
  recordValidationIssueCount: 0,
  hasAppliedRecord: false,
  publicationReady: false,
} satisfies Omit<HostMeetingWorkspaceInput, "state">;

describe("buildHostMeetingWorkspace", () => {
  it("builds the six unordered semantic task links without progress fields", () => {
    const view = buildHostMeetingWorkspace({
      ...baseInput,
      state: "OPEN",
    });

    expect(view.tasks).toEqual([
      {
        task: "overview",
        label: "개요",
        href: "/clubs/alpha/app/host/sessions/session-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost#meeting",
      },
      {
        task: "responses",
        label: "참석 응답",
        href: "/clubs/alpha/app/host/sessions/session-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=responses#meeting",
      },
      {
        task: "attendance",
        label: "실제 출석",
        href: "/clubs/alpha/app/host/sessions/session-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=attendance#meeting",
      },
      {
        task: "records",
        label: "모임 기록",
        href: "/clubs/alpha/app/host/sessions/session-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=records#meeting",
      },
      {
        task: "notifications",
        label: "알림",
        href: "/clubs/alpha/app/host/sessions/session-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=notifications#meeting",
      },
      {
        task: "history",
        label: "변경 내역",
        href: "/clubs/alpha/app/host/sessions/session-1?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=history#meeting",
      },
    ]);
    expect(Object.keys(view)).not.toEqual(
      expect.arrayContaining(["progress", "ordinal", "position", "step", "completed"]),
    );
    for (const task of view.tasks) {
      expect(Object.keys(task)).not.toEqual(
        expect.arrayContaining(["progress", "ordinal", "position", "step", "completed", "state"]),
      );
    }
  });

  it("uses only stored counts and states for task badges", () => {
    const storedAttention = {
      unansweredResponseCount: 5,
      unknownAttendanceCount: 2,
      hasRecordDraft: true,
      recordDraftStale: false,
      recordValidationIssueCount: 0,
    };
    const beforeMeeting = buildHostMeetingWorkspace({
      ...baseInput,
      ...storedAttention,
      state: "OPEN",
      meetingDate: "2026-08-25",
      today: "2026-08-20",
    });
    const afterMeeting = buildHostMeetingWorkspace({
      ...baseInput,
      ...storedAttention,
      state: "CLOSED",
      meetingDate: "2026-08-10",
      today: "2026-08-20",
    });

    const badges = (view: typeof beforeMeeting) => view.tasks.map(({ task, badge }) => [task, badge]);
    expect(badges(beforeMeeting)).toEqual([
      ["overview", undefined],
      ["responses", "미응답 5"],
      ["attendance", "확인 필요"],
      ["records", "초안 있음"],
      ["notifications", undefined],
      ["history", undefined],
    ]);
    expect(badges(afterMeeting)).toEqual(badges(beforeMeeting));

    const recordNeedsReview = buildHostMeetingWorkspace({
      ...baseInput,
      state: "CLOSED",
      hasRecordDraft: true,
      recordDraftStale: true,
    });
    expect(recordNeedsReview.tasks.find(({ task }) => task === "records")?.badge).toBe("확인 필요");
  });

  it.each([
    [
      "DRAFT",
      {},
      "모임 작성 중",
      { kind: "OPEN_SESSION", label: "멤버와 준비 시작", task: "overview" },
    ],
    [
      "OPEN",
      { meetingDate: "2026-08-21", today: "2026-08-20", unknownAttendanceCount: 2 },
      "멤버와 준비 중",
      { kind: "REVIEW_MEMBER_INPUT", label: "멤버 응답 확인하기", task: "responses" },
    ],
    [
      "OPEN",
      { meetingDate: "2026-08-21", today: "2026-08-21", unknownAttendanceCount: 2 },
      "멤버와 준비 중",
      { kind: "CHECK_ATTENDANCE", label: "실제 출석 확인", task: "attendance" },
    ],
    [
      "OPEN",
      { meetingDate: "2026-08-21", today: "2026-08-22", unknownAttendanceCount: 0 },
      "멤버와 준비 중",
      { kind: "FINISH_SESSION", label: "모임 마치기", task: "overview" },
    ],
    [
      "CLOSED",
      {},
      "기록 정리 중",
      { kind: "UPLOAD_RECORD", label: "정리본 올리기", task: "records" },
    ],
    [
      "PUBLISHED",
      { hasAppliedRecord: true, publicationReady: true },
      "게스트·멤버 노트 게시 완료",
      { kind: "VIEW_PUBLIC_RECORD", label: "공개 기록 보기", task: "overview" },
    ],
  ] satisfies Array<[
    HostMeetingWorkspaceInput["state"],
    Partial<HostMeetingWorkspaceInput>,
    string,
    { kind: string; label: string; task: string },
  ]>) (
    "keeps %s as the authoritative lifecycle while recommending its primary action",
    (state, overrides, statusLabel, primaryAction) => {
      const view = buildHostMeetingWorkspace({
        ...baseInput,
        ...overrides,
        state,
      });

      expect(view.lifecycle).toBe(state);
      expect(view.statusLabel).toBe(statusLabel);
      expect(view.primaryAction).toEqual(primaryAction);
      expect(view).not.toHaveProperty("nextLifecycle");
    },
  );

  it("keeps OPEN when dates are invalid and recommends response review", () => {
    const view = buildHostMeetingWorkspace({
      ...baseInput,
      state: "OPEN",
      meetingDate: "08/21/2026",
      today: "not-a-date",
      unknownAttendanceCount: 3,
    });

    expect(view).toMatchObject({
      lifecycle: "OPEN",
      statusLabel: "멤버와 준비 중",
      primaryAction: {
        kind: "REVIEW_MEMBER_INPUT",
        label: "멤버 응답 확인하기",
        task: "responses",
      },
    });
  });

  it.each([
    [
      { hasRecordDraft: true, recordDraftStale: true },
      { kind: "FIX_RECORD", label: "반영 전 확인", task: "records" },
    ],
    [
      { hasRecordDraft: true, recordValidationIssueCount: 2 },
      { kind: "FIX_RECORD", label: "반영 전 확인", task: "records" },
    ],
    [
      { hasRecordDraft: true },
      { kind: "REVIEW_RECORD", label: "기록에 반영", task: "records" },
    ],
    [
      { hasRecordDraft: false, hasAppliedRecord: true, publicationReady: true },
      { kind: "PUBLISH_RECORD", label: "게스트·멤버 노트에 기록 게시", task: "records" },
    ],
  ] satisfies Array<[Partial<HostMeetingWorkspaceInput>, { kind: string; label: string; task: string }]>) (
    "recommends the stored CLOSED record action without deriving lifecycle",
    (overrides, primaryAction) => {
      const view = buildHostMeetingWorkspace({
        ...baseInput,
        ...overrides,
        state: "CLOSED",
      });

      expect(view.lifecycle).toBe("CLOSED");
      expect(view.primaryAction).toEqual(primaryAction);
    },
  );
});
