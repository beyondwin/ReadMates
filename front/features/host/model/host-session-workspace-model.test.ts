import { describe, expect, it } from "vitest";
import {
  buildHostSessionWorkspace,
  type HostSessionWorkspaceInput,
} from "./host-session-workspace-model";

const baseInput = {
  meetingDate: "2026-08-21",
  today: "2026-08-20",
  unknownAttendanceCount: 0,
  hasRecordDraft: false,
  recordDraftStale: false,
  recordValidationIssueCount: 0,
  hasAppliedRecord: false,
  publicationReady: false,
} satisfies Omit<HostSessionWorkspaceInput, "state">;

describe("buildHostSessionWorkspace", () => {
  it("maps DRAFT to open-session without a lifecycle transition", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "DRAFT",
      }),
    ).toMatchObject({
      statusLabel: "모임 작성 중",
      primaryAction: { kind: "OPEN_SESSION", label: "멤버와 준비 시작", panel: "focus" },
    });
  });

  it("reviews member input while OPEN before the meeting date", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "OPEN",
        meetingDate: "2026-08-21",
        today: "2026-08-20",
        unknownAttendanceCount: 2,
      }),
    ).toMatchObject({
      statusLabel: "멤버와 준비 중",
      primaryAction: {
        kind: "REVIEW_MEMBER_INPUT",
        label: "멤버 응답 확인하기",
        panel: "focus",
      },
    });
  });

  it("prioritizes attendance on meeting day without changing OPEN", () => {
    expect(
      buildHostSessionWorkspace({
        state: "OPEN",
        meetingDate: "2026-08-21",
        today: "2026-08-21",
        unknownAttendanceCount: 2,
        hasRecordDraft: false,
        recordDraftStale: false,
        recordValidationIssueCount: 0,
        hasAppliedRecord: false,
        publicationReady: false,
      }),
    ).toMatchObject({
      statusLabel: "멤버와 준비 중",
      primaryAction: { kind: "CHECK_ATTENDANCE", label: "출석 확인하기", panel: "attendance" },
    });
  });

  it("finishes the session on or after the meeting date once attendance is known", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "OPEN",
        meetingDate: "2026-08-21",
        today: "2026-08-22",
        unknownAttendanceCount: 0,
      }),
    ).toMatchObject({
      statusLabel: "멤버와 준비 중",
      primaryAction: { kind: "FINISH_SESSION", label: "모임 마치기", panel: "focus" },
    });
  });

  it("keeps OPEN when dates are invalid and falls back to lifecycle-only priority", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "OPEN",
        meetingDate: "08/21/2026",
        today: "not-a-date",
        unknownAttendanceCount: 3,
      }),
    ).toMatchObject({
      statusLabel: "멤버와 준비 중",
      primaryAction: {
        kind: "REVIEW_MEMBER_INPUT",
        label: "멤버 응답 확인하기",
        panel: "focus",
      },
    });
  });

  it("uploads a record first when CLOSED has no draft", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "CLOSED",
      }),
    ).toMatchObject({
      statusLabel: "기록 정리 중",
      primaryAction: { kind: "UPLOAD_RECORD", label: "정리본 올리기", panel: "records" },
    });
  });

  it("fixes a stale CLOSED draft before apply", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "CLOSED",
        hasRecordDraft: true,
        recordDraftStale: true,
        recordValidationIssueCount: 0,
      }),
    ).toMatchObject({
      statusLabel: "기록 정리 중",
      primaryAction: { kind: "FIX_RECORD", label: "반영 전 확인", panel: "records" },
    });
  });

  it("fixes an invalid CLOSED draft before apply", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "CLOSED",
        hasRecordDraft: true,
        recordDraftStale: false,
        recordValidationIssueCount: 2,
      }),
    ).toMatchObject({
      statusLabel: "기록 정리 중",
      primaryAction: { kind: "FIX_RECORD", label: "반영 전 확인", panel: "records" },
    });
  });

  it("reviews a valid CLOSED draft before apply", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "CLOSED",
        hasRecordDraft: true,
        hasAppliedRecord: false,
      }),
    ).toMatchObject({
      statusLabel: "기록 정리 중",
      primaryAction: { kind: "REVIEW_RECORD", label: "기록에 반영", panel: "records" },
    });
  });

  it("publishes when CLOSED is ready", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "CLOSED",
        hasRecordDraft: true,
        hasAppliedRecord: true,
        publicationReady: true,
      }),
    ).toMatchObject({
      statusLabel: "기록 정리 중",
      primaryAction: { kind: "PUBLISH_RECORD", label: "기록 공개", panel: "records" },
      publicationReady: true,
    });
  });

  it("keeps PUBLISH_RECORD when applied but not publication-ready", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "CLOSED",
        hasRecordDraft: true,
        hasAppliedRecord: true,
        publicationReady: false,
      }),
    ).toMatchObject({
      statusLabel: "기록 정리 중",
      primaryAction: { kind: "PUBLISH_RECORD", label: "기록 공개", panel: "records" },
      publicationReady: false,
    });
  });

  it("views the public record when PUBLISHED", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "PUBLISHED",
        hasRecordDraft: true,
        hasAppliedRecord: true,
        publicationReady: true,
      }),
    ).toMatchObject({
      statusLabel: "공개 완료",
      primaryAction: { kind: "VIEW_PUBLIC_RECORD", label: "공개 기록 보기", panel: "focus" },
    });
  });

  it("never returns an automatic lifecycle transition from dates alone", () => {
    const view = buildHostSessionWorkspace({
      ...baseInput,
      state: "OPEN",
      meetingDate: "2026-08-01",
      today: "2026-08-21",
      unknownAttendanceCount: 0,
    });
    expect(view.statusLabel).toBe("멤버와 준비 중");
    expect(view.primaryAction.kind).toBe("FINISH_SESSION");
    expect(view.primaryAction.kind).not.toMatch(/CLOSE|PUBLISH|OPEN_SESSION/);
  });

  it("marks attendance current while the finish CTA is shown", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "OPEN",
        meetingDate: "2026-08-21",
        today: "2026-08-22",
        unknownAttendanceCount: 0,
      }).progress,
    ).toEqual([
      { id: "basic", label: "기본 정보", state: "done" },
      { id: "members", label: "멤버 준비", state: "done" },
      { id: "attendance", label: "출석", state: "current" },
      { id: "records", label: "기록", state: "next" },
      { id: "publish", label: "공개", state: "next" },
    ]);
  });

  it("exposes progress markers for the current focus step", () => {
    expect(
      buildHostSessionWorkspace({
        ...baseInput,
        state: "OPEN",
        meetingDate: "2026-08-21",
        today: "2026-08-21",
        unknownAttendanceCount: 1,
      }).progress,
    ).toEqual([
      { id: "basic", label: "기본 정보", state: "done" },
      { id: "members", label: "멤버 준비", state: "done" },
      { id: "attendance", label: "출석", state: "current" },
      { id: "records", label: "기록", state: "next" },
      { id: "publish", label: "공개", state: "next" },
    ]);
  });
});
