import { describe, expect, it } from "vitest";
import { getSessionClosingBoardView, type SessionClosingStatusInput } from "./session-closing-model";

const baseStatus: SessionClosingStatusInput = {
  schema: "host.session_closing_status.v1",
  session: {
    sessionId: "11111111-1111-1111-1111-111111111111",
    sessionNumber: 7,
    bookTitle: "E2E Book",
    meetingDate: "2026-06-18",
    state: "CLOSED",
    recordVisibility: "PUBLIC",
  },
  overall: {
    state: "READY",
    label: "Ready",
    primaryAction: "SEND_NOTIFICATION",
  },
  checklist: [
    {
      id: "SESSION_CLOSED",
      state: "DONE",
      label: "Session closed",
      detail: "Closed",
      href: "/app/host/sessions/11111111-1111-1111-1111-111111111111/edit",
    },
    {
      id: "MEMBER_NOTIFICATION_SENT",
      state: "ACTION_REQUIRED",
      label: "Member notification",
      detail: "Pending",
      href: "/app/host/notifications",
    },
  ],
  evidence: {
    summaryPublished: true,
    highlightCount: 2,
    oneLinerCount: 1,
    feedbackDocumentState: "AVAILABLE",
    latestNotificationEvent: null,
    publicRecordHref: "/clubs/club-a/sessions/11111111-1111-1111-1111-111111111111",
    memberReflectionHref: "/clubs/club-a/app/sessions/11111111-1111-1111-1111-111111111111",
  },
};

describe("getSessionClosingBoardView", () => {
  it("builds primary action and surface cards without leaking internal details", () => {
    const view = getSessionClosingBoardView(baseStatus);

    expect(view.title).toBe("No.07 · E2E Book");
    expect(view.statusTone).toBe("accent");
    expect(view.primaryAction.label).toBe("멤버 알림 확인");
    expect(view.surfaces.map((surface) => surface.id)).toEqual(["HOST", "MEMBER", "PUBLIC"]);
    expect(JSON.stringify(view)).not.toContain("member1@example.com");
    expect(JSON.stringify(view)).not.toContain("ADMIN_ROUTE");
  });

  it("marks blocked feedback as danger tone", () => {
    const view = getSessionClosingBoardView({
      ...baseStatus,
      overall: { state: "BLOCKED", label: "Blocked", primaryAction: "IMPORT_RECORDS" },
      evidence: { ...baseStatus.evidence, feedbackDocumentState: "INVALID" },
    });

    expect(view.statusTone).toBe("danger");
    expect(view.evidence.find((item) => item.label === "피드백 문서")?.value).toBe("확인 필요");
  });

  it.each([
    [
      "CLOSE_SESSION",
      "세션 종료 확인",
      "열린 세션을 먼저 닫아야 기록 패키지와 알림 상태를 판단할 수 있습니다.",
    ],
    [
      "IMPORT_RECORDS",
      "기록 패키지 검토",
      "요약, 하이라이트, 한줄평, 피드백 문서가 아직 마감 증거로 충분하지 않습니다.",
    ],
    [
      "PUBLISH_RECORDS",
      "기록 공개 범위 확인",
      "멤버 또는 공개 표면에 기록을 열기 전 공개 범위를 점검해야 합니다.",
    ],
    [
      "SEND_NOTIFICATION",
      "멤버 알림 확인",
      "멤버가 지난 모임 회고로 돌아갈 알림 흐름이 아직 완성되지 않았습니다.",
    ],
    [
      "REVIEW_PUBLIC_PAGE",
      "공개 기록 확인",
      "공개 표면에 발행된 기록이 의도대로 보이는지 최종 확인합니다.",
    ],
    [
      "NONE",
      "추가 조치 없음",
      "마감에 필요한 증거가 준비되어 있습니다.",
    ],
  ] satisfies Array<[SessionClosingStatusInput["overall"]["primaryAction"], string, string]>)(
    "maps %s to Korean operating copy",
    (primaryAction, label, reason) => {
      const view = getSessionClosingBoardView({
        ...baseStatus,
        overall: { ...baseStatus.overall, primaryAction },
      });

      expect(view.primaryAction.label).toBe(label);
      expect(view.primaryAction.reason).toBe(reason);
    },
  );

  it("uses Korean checklist state labels and action labels", () => {
    const view = getSessionClosingBoardView({
      ...baseStatus,
      checklist: [
        { id: "done", state: "DONE", label: "세션 종료", detail: "닫힘", href: "/app/host/sessions/s1/edit" },
        { id: "needed", state: "ACTION_REQUIRED", label: "멤버 알림", detail: "대기", href: "/app/host/notifications" },
        { id: "blocked", state: "BLOCKED", label: "피드백 문서", detail: "확인 필요", href: null },
        { id: "na", state: "NOT_APPLICABLE", label: "공개 기록", detail: "비공개", href: null },
      ],
    });

    expect(view.checklist.map((item) => item.stateLabel)).toEqual(["완료", "조치 필요", "차단", "해당 없음"]);
    expect(view.checklist.map((item) => item.actionLabel)).toEqual(["확인하기", "확인하기", "상태 확인", "상태 확인"]);
  });

  it("describes host member and public surfaces with role-centered Korean copy", () => {
    const view = getSessionClosingBoardView(baseStatus);

    expect(view.surfaces).toEqual([
      expect.objectContaining({
        id: "HOST",
        title: "호스트 문서",
        detail: "호스트가 기록 패키지와 마감 상태를 관리할 수 있습니다.",
        actionLabel: "호스트 문서 확인",
      }),
      expect.objectContaining({
        id: "MEMBER",
        title: "멤버 회고",
        detail: "멤버가 지난 모임 기록과 피드백으로 돌아갈 수 있습니다.",
        actionLabel: "멤버 회고 확인",
      }),
      expect.objectContaining({
        id: "PUBLIC",
        title: "공개 기록",
        detail: "공개 기록 표면에서 발행 상태를 확인할 수 있습니다.",
        actionLabel: "공개 기록 확인",
      }),
    ]);
  });

  it("shows honest copy when member and public links are absent", () => {
    const view = getSessionClosingBoardView({
      ...baseStatus,
      evidence: {
        ...baseStatus.evidence,
        memberReflectionHref: null,
        publicRecordHref: null,
      },
    });

    expect(view.surfaces.find((surface) => surface.id === "MEMBER")).toEqual(
      expect.objectContaining({
        detail: "멤버 회고 진입은 아직 확인되지 않았습니다.",
        href: null,
      }),
    );
    expect(view.surfaces.find((surface) => surface.id === "PUBLIC")).toEqual(
      expect.objectContaining({
        detail: "공개 표면에는 아직 발행되지 않았습니다.",
        href: null,
      }),
    );
  });

  it("uses Korean evidence labels and public-safe aggregate values", () => {
    const view = getSessionClosingBoardView(baseStatus);

    expect(view.evidence).toEqual([
      { label: "공개 요약", value: "저장됨" },
      { label: "하이라이트", value: "2" },
      { label: "한줄평", value: "1" },
      { label: "피드백 문서", value: "열람 가능" },
      { label: "최근 멤버 알림", value: "없음" },
    ]);
    expect(displayStrings(view)).not.toContain("member1@example.com");
    expect(displayStrings(view)).not.toContain("ADMIN_ROUTE");
    expect(displayStrings(view)).not.toContain("{\"");
  });
});

function displayStrings(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(displayStrings).join("\n");
  if (value && typeof value === "object") return Object.values(value).map(displayStrings).join("\n");
  return "";
}
