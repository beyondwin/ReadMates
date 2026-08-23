import { describe, expect, it } from "vitest";
import {
  buildHostMeetingWorkspace,
  buildHostSessionWorkspace,
  type HostMeetingWorkspaceInput,
  type HostSessionWorkspaceInput,
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

const compatibilityBaseInput = {
  meetingDate: "2026-08-21",
  today: "2026-08-20",
  unknownAttendanceCount: 0,
  hasRecordDraft: false,
  recordDraftStale: false,
  recordValidationIssueCount: 0,
  hasAppliedRecord: false,
  publicationReady: false,
} satisfies Omit<HostSessionWorkspaceInput, "state">;

describe("HostSessionWorkspace view compatibility until B8", () => {
  it("keeps the exact DRAFT CTA and focus location", () => {
    expect(buildHostSessionWorkspace({
      ...compatibilityBaseInput,
      state: "DRAFT",
    })).toMatchObject({
      statusLabel: "모임 작성 중",
      primaryAction: { kind: "OPEN_SESSION", label: "멤버와 준비 시작", panel: "focus" },
    });
  });

  it("keeps the exact pre-meeting OPEN response CTA and focus location", () => {
    expect(buildHostSessionWorkspace({
      ...compatibilityBaseInput,
      state: "OPEN",
      meetingDate: "2026-08-21",
      today: "2026-08-20",
      unknownAttendanceCount: 2,
    })).toMatchObject({
      statusLabel: "멤버와 준비 중",
      primaryAction: {
        kind: "REVIEW_MEMBER_INPUT",
        label: "멤버 응답 확인하기",
        panel: "focus",
      },
    });
  });

  it("keeps attendance current on the meeting date", () => {
    expect(buildHostSessionWorkspace({
      ...compatibilityBaseInput,
      state: "OPEN",
      meetingDate: "2026-08-21",
      today: "2026-08-21",
      unknownAttendanceCount: 2,
    })).toMatchObject({
      statusLabel: "멤버와 준비 중",
      primaryAction: { kind: "CHECK_ATTENDANCE", label: "실제 출석 확인", panel: "attendance" },
    });
  });

  it("keeps the finish CTA at focus once attendance is known", () => {
    expect(buildHostSessionWorkspace({
      ...compatibilityBaseInput,
      state: "OPEN",
      meetingDate: "2026-08-21",
      today: "2026-08-22",
      unknownAttendanceCount: 0,
    })).toMatchObject({
      statusLabel: "멤버와 준비 중",
      primaryAction: { kind: "FINISH_SESSION", label: "모임 마치기", panel: "focus" },
    });
  });

  it("keeps invalid OPEN dates on the response-review fallback", () => {
    expect(buildHostSessionWorkspace({
      ...compatibilityBaseInput,
      state: "OPEN",
      meetingDate: "08/21/2026",
      today: "not-a-date",
      unknownAttendanceCount: 3,
    })).toMatchObject({
      statusLabel: "멤버와 준비 중",
      primaryAction: {
        kind: "REVIEW_MEMBER_INPUT",
        label: "멤버 응답 확인하기",
        panel: "focus",
      },
    });
  });

  it.each([
    [
      "no draft",
      {},
      { kind: "UPLOAD_RECORD", label: "정리본 올리기", panel: "records" },
    ],
    [
      "stale draft",
      { hasRecordDraft: true, recordDraftStale: true },
      { kind: "FIX_RECORD", label: "반영 전 확인", panel: "records" },
    ],
    [
      "invalid draft",
      { hasRecordDraft: true, recordValidationIssueCount: 2 },
      { kind: "FIX_RECORD", label: "반영 전 확인", panel: "records" },
    ],
    [
      "valid draft",
      { hasRecordDraft: true },
      { kind: "REVIEW_RECORD", label: "기록에 반영", panel: "records" },
    ],
  ] satisfies Array<[string, Partial<HostSessionWorkspaceInput>, { kind: string; label: string; panel: string }]>) (
    "keeps the exact CLOSED %s CTA and records location",
    (_name, overrides, primaryAction) => {
      expect(buildHostSessionWorkspace({
        ...compatibilityBaseInput,
        ...overrides,
        state: "CLOSED",
      })).toMatchObject({
        statusLabel: "기록 정리 중",
        primaryAction,
      });
    },
  );

  it.each([
    ["consumed draft", { hasRecordDraft: false, hasAppliedRecord: true, publicationReady: true }, true],
    ["ready draft", { hasRecordDraft: true, hasAppliedRecord: true, publicationReady: true }, true],
    ["applied but blocked", { hasRecordDraft: true, hasAppliedRecord: true, publicationReady: false }, false],
  ] satisfies Array<[string, Partial<HostSessionWorkspaceInput>, boolean]>) (
    "keeps PUBLISH_RECORD for %s and preserves publication readiness",
    (_name, overrides, publicationReady) => {
      expect(buildHostSessionWorkspace({
        ...compatibilityBaseInput,
        ...overrides,
        state: "CLOSED",
      })).toMatchObject({
        statusLabel: "기록 정리 중",
        primaryAction: {
          kind: "PUBLISH_RECORD",
          label: "게스트·멤버 노트에 기록 게시",
          panel: "records",
        },
        publicationReady,
      });
    },
  );

  it("keeps the exact PUBLISHED CTA and focus location", () => {
    expect(buildHostSessionWorkspace({
      ...compatibilityBaseInput,
      state: "PUBLISHED",
      hasRecordDraft: true,
      hasAppliedRecord: true,
      publicationReady: true,
    })).toMatchObject({
      statusLabel: "게스트·멤버 노트 게시 완료",
      primaryAction: { kind: "VIEW_PUBLIC_RECORD", label: "공개 기록 보기", panel: "focus" },
    });
  });

  it("never returns an automatic compatibility lifecycle transition from dates", () => {
    const view = buildHostSessionWorkspace({
      ...compatibilityBaseInput,
      state: "OPEN",
      meetingDate: "2026-08-01",
      today: "2026-08-21",
      unknownAttendanceCount: 0,
    });
    expect(view.statusLabel).toBe("멤버와 준비 중");
    expect(view.primaryAction.kind).toBe("FINISH_SESSION");
    expect(view.primaryAction.kind).not.toMatch(/CLOSE|PUBLISH|OPEN_SESSION/);
  });

  it.each([
    ["finish", "2026-08-22", 0],
    ["attendance check", "2026-08-21", 1],
  ])("keeps the exact attendance progress positions for %s", (_name, today, unknownAttendanceCount) => {
    expect(buildHostSessionWorkspace({
      ...compatibilityBaseInput,
      state: "OPEN",
      meetingDate: "2026-08-21",
      today,
      unknownAttendanceCount,
    }).progress).toEqual([
      { id: "basic", label: "기본 정보", state: "done" },
      { id: "members", label: "멤버 준비", state: "done" },
      { id: "attendance", label: "출석", state: "current" },
      { id: "records", label: "기록", state: "next" },
      { id: "publish", label: "공개", state: "next" },
    ]);
  });

  it.each([
    [
      "DRAFT",
      {},
      ["current", "next", "next", "next", "next"],
    ],
    [
      "CLOSED record work",
      { state: "CLOSED", hasRecordDraft: true },
      ["done", "done", "done", "current", "next"],
    ],
    [
      "CLOSED publication",
      { state: "CLOSED", hasRecordDraft: true, hasAppliedRecord: true },
      ["done", "done", "done", "done", "current"],
    ],
    [
      "PUBLISHED",
      { state: "PUBLISHED", hasAppliedRecord: true },
      ["done", "done", "done", "done", "done"],
    ],
  ] satisfies Array<[string, Partial<HostSessionWorkspaceInput>, string[]]>) (
    "keeps the exact compatibility progress positions for %s",
    (_name, overrides, expectedStates) => {
      const state = overrides.state ?? "DRAFT";
      const view = buildHostSessionWorkspace({
        ...compatibilityBaseInput,
        ...overrides,
        state,
      });
      expect(view.progress.map(({ state: progressState }) => progressState)).toEqual(expectedStates);
    },
  );
});
