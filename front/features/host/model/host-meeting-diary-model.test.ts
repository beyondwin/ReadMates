import { describe, expect, it } from "vitest";
import type { HostMeetingRecordFacts, HostMeetingRecordReadiness } from "./host-meeting-record-readiness";
import {
  buildHostMeetingDiary,
  type DiaryStepId,
} from "./host-meeting-diary-model";
import {
  buildHostMeetingWorkspace,
  type HostMeetingWorkspaceInput,
} from "./host-session-workspace-model";

const SESSION_ID = "11111111-1111-1111-1111-111111111111";
const OBSERVED_AT = "2026-08-21T03:00:00.000Z";

const STEP_ORDER = [
  "create",
  "prepare",
  "responses",
  "meetingDay",
  "records",
  "publish",
] as const satisfies readonly DiaryStepId[];

const STEP_LABELS: Record<DiaryStepId, string> = {
  create: "모임 만들기",
  prepare: "멤버와 준비",
  responses: "응답 모으는 중",
  meetingDay: "모임 당일(출석)",
  records: "기록 정리",
  publish: "기록 게시",
};

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

const baseWorkspaceInput = {
  currentUrl: `https://readmates.test/clubs/alpha/app/host/sessions/${SESSION_ID}?returnTo=%2Fclubs%2Falpha%2Fapp%2Fhost#meeting`,
  meetingDate: "2026-08-25",
  today: "2026-08-20",
  unansweredResponseCount: 0,
  unknownAttendanceCount: 0,
  recordReadiness: readyReadiness(),
} satisfies Omit<HostMeetingWorkspaceInput, "state">;

function diaryFrom(overrides: Partial<HostMeetingWorkspaceInput> & { state: HostMeetingWorkspaceInput["state"] }) {
  const input = { ...baseWorkspaceInput, ...overrides };
  const workspace = buildHostMeetingWorkspace(input);
  return buildHostMeetingDiary({
    workspace,
    meetingDate: input.meetingDate,
    today: input.today,
    currentUrl: input.currentUrl,
  });
}

function expectTimeline(current: DiaryStepId, publishedAllDone = false) {
  return (view: ReturnType<typeof buildHostMeetingDiary>) => {
    expect(view.currentStep).toBe(current);
    expect(view.steps.map((step) => step.id)).toEqual([...STEP_ORDER]);
    expect(view.steps.map((step) => step.label)).toEqual(STEP_ORDER.map((id) => STEP_LABELS[id]));

    const currentIndex = STEP_ORDER.indexOf(current);
    expect(view.steps.map((step) => step.state)).toEqual(
      STEP_ORDER.map((id, index) => {
        if (publishedAllDone) return "done";
        if (index < currentIndex) return "done";
        if (index === currentIndex) return "current";
        return "upcoming";
      }),
    );
  };
}

describe("buildHostMeetingDiary", () => {
  it("maps DRAFT to create as current with later steps upcoming", () => {
    const view = diaryFrom({ state: "DRAFT", recordReadiness: { status: "not-required" } });
    expectTimeline("create")(view);
  });

  it("maps OPEN before meeting with no unanswered responses to prepare", () => {
    const view = diaryFrom({
      state: "OPEN",
      meetingDate: "2026-08-25",
      today: "2026-08-20",
      unansweredResponseCount: 0,
    });
    expectTimeline("prepare")(view);
  });

  it("maps OPEN before meeting with unanswered responses to responses", () => {
    const view = diaryFrom({
      state: "OPEN",
      meetingDate: "2026-08-25",
      today: "2026-08-20",
      unansweredResponseCount: 3,
    });
    expectTimeline("responses")(view);
  });

  it("maps OPEN on meeting day to meetingDay", () => {
    const view = diaryFrom({
      state: "OPEN",
      meetingDate: "2026-08-25",
      today: "2026-08-25",
      unansweredResponseCount: 2,
    });
    expectTimeline("meetingDay")(view);
  });

  it("maps CLOSED to records as current", () => {
    const view = diaryFrom({
      state: "CLOSED",
      meetingDate: "2026-08-20",
      today: "2026-08-25",
      recordReadiness: readyReadiness({ hasDraft: true }),
    });
    expectTimeline("records")(view);
  });

  it("maps PUBLISHED to publish with every step done", () => {
    const view = diaryFrom({
      state: "PUBLISHED",
      meetingDate: "2026-08-20",
      today: "2026-08-25",
      recordReadiness: readyReadiness({
        hasAppliedRecord: true,
        publicationReady: true,
      }),
    });
    expectTimeline("publish", true)(view);
  });
});
