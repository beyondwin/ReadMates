import { describe, expect, it } from "vitest";
import type { HostMeetingRecordFacts, HostMeetingRecordReadiness } from "./host-meeting-record-readiness";
import {
  buildHostMeetingWorkspace,
  buildHostSessionWorkspace,
  type HostMeetingPrimaryAction,
  type HostMeetingWorkspaceInput,
  type HostSessionWorkspaceInput,
} from "./host-session-workspace-model";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const OBSERVED_AT = "2026-08-21T03:00:00.000Z";
const RECORD_MUTATION_KINDS = ["UPLOAD_RECORD", "FIX_RECORD", "REVIEW_RECORD", "PUBLISH_RECORD"] as const;

function readyReadiness(overrides: Partial<HostMeetingRecordFacts> = {}): HostMeetingRecordReadiness {
  return {
    status: "ready",
    observedAt: OBSERVED_AT,
    facts: {
      hasDraft: false,
      draftLiveBaseStale: false,
      validationIssueCount: 0,
      hasAppliedRecord: false,
      publicationReady: false,
      ...overrides,
    },
  };
}

const baseInput = {
  currentUrl: `https://readmates.test/clubs/alpha/app/host/sessions/${SESSION_ID}?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost#meeting`,
  meetingDate: "2026-08-21",
  today: "2026-08-20",
  unansweredResponseCount: 0,
  unknownAttendanceCount: 0,
  recordReadiness: readyReadiness(),
} satisfies Omit<HostMeetingWorkspaceInput, "state">;

const confirmingClosedAction = {
  kind: "CONFIRM_NEXT_ACTION",
  label: "다음 할 일 확인 중",
  task: "records",
  disabled: true,
} as const;

describe("buildHostMeetingWorkspace", () => {
  it("builds the six unordered semantic related task links without progress fields", () => {
    const view = buildHostMeetingWorkspace({
      ...baseInput,
      state: "OPEN",
    });

    expect(view.relatedTasks).toEqual([
      {
        task: "overview",
        label: "개요",
        href: `/clubs/alpha/app/host/sessions/${SESSION_ID}?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost#meeting`,
      },
      {
        task: "responses",
        label: "참석 응답",
        href: `/clubs/alpha/app/host/sessions/${SESSION_ID}?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=responses#meeting`,
      },
      {
        task: "attendance",
        label: "실제 출석",
        href: `/clubs/alpha/app/host/sessions/${SESSION_ID}?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=attendance#meeting`,
      },
      {
        task: "records",
        label: "모임 기록",
        href: `/clubs/alpha/app/host/sessions/${SESSION_ID}?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=records#meeting`,
      },
      {
        task: "notifications",
        label: "알림",
        href: `/clubs/alpha/app/host/sessions/${SESSION_ID}?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=notifications#meeting`,
      },
      {
        task: "history",
        label: "변경 내역",
        href: `/clubs/alpha/app/host/sessions/${SESSION_ID}?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost&section=history#meeting`,
      },
    ]);
    expect(view.tasks).toEqual(view.relatedTasks);
    expect(Object.keys(view)).not.toEqual(
      expect.arrayContaining(["progress", "ordinal", "position", "step", "completed"]),
    );
    for (const task of view.relatedTasks) {
      expect(Object.keys(task)).not.toEqual(
        expect.arrayContaining(["progress", "ordinal", "position", "step", "completed", "state"]),
      );
    }
  });

  it("uses only stored counts and ready record facts for task badges", () => {
    const storedAttention = {
      unansweredResponseCount: 5,
      unknownAttendanceCount: 2,
      recordReadiness: readyReadiness({ hasDraft: true }),
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

    const badges = (view: typeof beforeMeeting) => view.relatedTasks.map(({ task, badge }) => [task, badge]);
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
      recordReadiness: readyReadiness({ hasDraft: true, draftLiveBaseStale: true }),
    });
    expect(recordNeedsReview.relatedTasks.find(({ task }) => task === "records")?.badge).toBe("확인 필요");
  });

  it.each([
    [
      "DRAFT",
      { recordReadiness: { status: "not-required" } },
      "모임 작성 중",
      { kind: "OPEN_SESSION", label: "멤버와 준비 시작", task: "overview", disabled: false },
    ],
    [
      "OPEN",
      { meetingDate: "2026-08-21", today: "2026-08-20", unknownAttendanceCount: 2 },
      "멤버와 준비 중",
      { kind: "REVIEW_MEMBER_INPUT", label: "멤버 응답 확인하기", task: "responses", disabled: false },
    ],
    [
      "OPEN",
      { meetingDate: "2026-08-21", today: "2026-08-21", unknownAttendanceCount: 2 },
      "멤버와 준비 중",
      { kind: "CHECK_ATTENDANCE", label: "실제 출석 확인", task: "attendance", disabled: false },
    ],
    [
      "OPEN",
      { meetingDate: "2026-08-21", today: "2026-08-22", unknownAttendanceCount: 0 },
      "멤버와 준비 중",
      { kind: "FINISH_SESSION", label: "모임 마치기", task: "overview", disabled: false },
    ],
    [
      "CLOSED",
      {},
      "기록 정리 중",
      { kind: "UPLOAD_RECORD", label: "정리본 올리기", task: "records", disabled: false },
    ],
    [
      "PUBLISHED",
      { recordReadiness: readyReadiness({ hasAppliedRecord: true, publicationReady: true }) },
      "공개 완료",
      { kind: "VIEW_PUBLIC_RECORD", label: "공개 기록 보기", task: "overview", disabled: false },
    ],
  ] satisfies Array<[
    HostMeetingWorkspaceInput["state"],
    Partial<HostMeetingWorkspaceInput>,
    string,
    HostMeetingPrimaryAction,
  ]>)(
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
        disabled: false,
      },
    });
  });

  it.each([
    [
      readyReadiness({ hasDraft: true, draftLiveBaseStale: true }),
      { kind: "FIX_RECORD", label: "반영 전 확인", task: "records", disabled: false },
    ],
    [
      readyReadiness({ hasDraft: true, validationIssueCount: 2 }),
      { kind: "FIX_RECORD", label: "반영 전 확인", task: "records", disabled: false },
    ],
    [
      readyReadiness({ hasDraft: true }),
      { kind: "REVIEW_RECORD", label: "기록에 반영", task: "records", disabled: false },
    ],
    [
      readyReadiness({ hasAppliedRecord: true, publicationReady: true }),
      { kind: "PUBLISH_RECORD", label: "게스트·멤버 노트에 기록 게시", task: "records", disabled: false },
    ],
  ] satisfies Array<[HostMeetingRecordReadiness, HostMeetingPrimaryAction]>)(
    "recommends the stored CLOSED record action without deriving lifecycle",
    (recordReadiness, primaryAction) => {
      const view = buildHostMeetingWorkspace({
        ...baseInput,
        recordReadiness,
        state: "CLOSED",
      });

      expect(view.lifecycle).toBe("CLOSED");
      expect(view.primaryAction).toEqual(primaryAction);
    },
  );

  it.each([
    ["pending", { status: "pending" } satisfies HostMeetingRecordReadiness, undefined],
    ["stale", {
      status: "stale",
      facts: readyReadiness().facts,
      observedAt: OBSERVED_AT,
      retryable: true,
    } satisfies HostMeetingRecordReadiness, "마지막 확인 시각이 오래되었습니다. 다시 시도하세요."],
    ["unavailable", {
      status: "unavailable",
      observedAt: OBSERVED_AT,
      retryable: true,
    } satisfies HostMeetingRecordReadiness, "모임 기록을 확인하지 못했습니다. 다시 시도하세요."],
    ["unavailable without observation", {
      status: "unavailable",
      observedAt: null,
      retryable: true,
    } satisfies HostMeetingRecordReadiness, "모임 기록을 확인하지 못했습니다. 다시 시도하세요."],
  ])("fail-closes CLOSED %s without a record mutation", (_name, recordReadiness, reason) => {
    const view = buildHostMeetingWorkspace({
      ...baseInput,
      state: "CLOSED",
      recordReadiness,
    });

    expect(view.lifecycle).toBe("CLOSED");
    expect(view.statusLabel).toBe("기록 정리 중");
    expect(view.primaryAction).toEqual({
      ...confirmingClosedAction,
      ...(reason ? { reason } : {}),
    });
    expect(RECORD_MUTATION_KINDS).not.toContain(view.primaryAction.kind);
    expect(view.publicationReady).toBeNull();
  });

  it.each([
    ["pending", { status: "pending" } satisfies HostMeetingRecordReadiness],
    ["stale", {
      status: "stale",
      facts: readyReadiness({ hasDraft: false, hasAppliedRecord: false, publicationReady: false }).facts,
      observedAt: OBSERVED_AT,
      retryable: true,
    } satisfies HostMeetingRecordReadiness],
    ["unavailable", {
      status: "unavailable",
      observedAt: null,
      retryable: true,
    } satisfies HostMeetingRecordReadiness],
    ["ready without applied record", readyReadiness()],
  ])("keeps PUBLISHED %s view-public oriented instead of upload or publish", (_name, recordReadiness) => {
    const view = buildHostMeetingWorkspace({
      ...baseInput,
      state: "PUBLISHED",
      recordReadiness,
    });

    expect(view.statusLabel).toBe("공개 완료");
    expect(view.primaryAction).toEqual({
      kind: "VIEW_PUBLIC_RECORD",
      label: "공개 기록 보기",
      task: "overview",
      disabled: false,
    });
    expect(RECORD_MUTATION_KINDS).not.toContain(view.primaryAction.kind);
    expect(view.primaryAction.kind).not.toMatch(/UPLOAD|PUBLISH|FIX_RECORD|REVIEW_RECORD/);
  });

  it("exposes 3-5 actual fact sentences instead of a progress stepper", () => {
    const view = buildHostMeetingWorkspace({
      ...baseInput,
      state: "OPEN",
      unansweredResponseCount: 2,
      unknownAttendanceCount: 1,
      recordReadiness: { status: "not-required" },
    });

    expect(view.facts.length).toBeGreaterThanOrEqual(3);
    expect(view.facts.length).toBeLessThanOrEqual(5);
    const ids = view.facts.map((fact) => fact.id);
    expect(ids).toEqual([...new Set(ids)]);
    expect(ids).toContain("responses");
    expect(ids).toContain("attendance");
    expect(ids.indexOf("responses")).not.toBe(ids.indexOf("attendance"));

    for (const fact of view.facts) {
      expect(fact.label.endsWith("다.")).toBe(true);
      expect(fact.label).not.toMatch(/%|퍼센트|완료율/);
      expect(fact).not.toHaveProperty("ordinal");
      expect(fact).not.toHaveProperty("index");
      expect(fact).not.toHaveProperty("position");
      expect(fact).not.toHaveProperty("step");
      expect(fact).not.toHaveProperty("progress");
      expect(fact).not.toHaveProperty("state");
      expect(JSON.stringify(fact)).not.toMatch(/"done"|"current"|"next"/);
    }
    expect(view).not.toHaveProperty("progress");
  });

  it("keeps response, attendance, and publication facts on separate rows", () => {
    const view = buildHostMeetingWorkspace({
      ...baseInput,
      state: "CLOSED",
      unansweredResponseCount: 1,
      unknownAttendanceCount: 2,
      recordReadiness: readyReadiness({
        hasDraft: true,
        hasAppliedRecord: true,
        publicationReady: true,
      }),
    });

    expect(view.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "responses",
        label: "참석 응답이 없는 멤버가 1명입니다.",
        relatedTask: "responses",
      }),
      expect.objectContaining({
        id: "attendance",
        label: "실제 출석이 확인되지 않은 멤버가 2명입니다.",
        relatedTask: "attendance",
      }),
      expect.objectContaining({
        id: "record",
        relatedTask: "records",
      }),
      expect.objectContaining({
        id: "publication",
        label: "게스트·멤버 노트에 게시할 수 있습니다.",
        relatedTask: "records",
      }),
    ]));
    expect(view.facts.find((fact) => fact.id === "identity")?.label).not.toMatch(/게스트·멤버 노트|게시할 수/);
    expect(view.publicationReady).toBe(true);
  });

  it("does not treat unknown record readiness as publicationReady false", () => {
    const pending = buildHostMeetingWorkspace({
      ...baseInput,
      state: "CLOSED",
      recordReadiness: { status: "pending" },
    });
    const unavailable = buildHostMeetingWorkspace({
      ...baseInput,
      state: "CLOSED",
      recordReadiness: { status: "unavailable", observedAt: null, retryable: true },
    });

    expect(pending.publicationReady).toBeNull();
    expect(unavailable.publicationReady).toBeNull();
    expect(pending.facts.some((fact) => fact.id === "publication")).toBe(false);
    expect(unavailable.facts.some((fact) => fact.id === "publication")).toBe(false);
  });
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
  ] satisfies Array<[string, Partial<HostSessionWorkspaceInput>, { kind: string; label: string; panel: string }]>)(
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
  ] satisfies Array<[string, Partial<HostSessionWorkspaceInput>, boolean]>)(
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
  ] satisfies Array<[string, Partial<HostSessionWorkspaceInput>, string[]]>)(
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
