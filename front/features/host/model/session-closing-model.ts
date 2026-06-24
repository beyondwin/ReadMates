export type SessionClosingTone = "ok" | "accent" | "warn" | "danger" | "muted";

export type SessionClosingStatusInput = {
  schema: "host.session_closing_status.v1";
  session: {
    sessionId: string;
    sessionNumber: number;
    bookTitle: string;
    meetingDate: string;
    state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
    recordVisibility: "HOST_ONLY" | "MEMBER" | "PUBLIC";
  };
  overall: {
    state: "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "READY" | "PUBLISHED";
    label: string;
    primaryAction: "CLOSE_SESSION" | "IMPORT_RECORDS" | "PUBLISH_RECORDS" | "SEND_NOTIFICATION" | "REVIEW_PUBLIC_PAGE" | "NONE";
  };
  checklist: Array<{
    id: string;
    state: "DONE" | "ACTION_REQUIRED" | "BLOCKED" | "NOT_APPLICABLE";
    label: string;
    detail: string;
    href: string | null;
  }>;
  evidence: {
    summaryPublished: boolean;
    highlightCount: number;
    oneLinerCount: number;
    feedbackDocumentState: "AVAILABLE" | "MISSING" | "LOCKED" | "INVALID";
    latestNotificationEvent: {
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED" | "NEXT_BOOK_PUBLISHED";
      status: "PENDING" | "PUBLISHED" | "FAILED" | "DEAD";
      createdAt: string;
    } | null;
    publicRecordHref: string | null;
    memberReflectionHref: string | null;
  };
};

export type SessionClosingBoardView = {
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: SessionClosingTone;
  primaryAction: {
    label: string;
    reason: string;
    tone: SessionClosingTone;
    href: string | null;
  };
  checklist: Array<{
    id: string;
    label: string;
    detail: string;
    state: SessionClosingStatusInput["checklist"][number]["state"];
    stateLabel: string;
    tone: SessionClosingTone;
    href: string | null;
    actionLabel: string;
  }>;
  surfaces: Array<{
    id: "HOST" | "MEMBER" | "PUBLIC";
    title: string;
    detail: string;
    tone: SessionClosingTone;
    href: string | null;
    actionLabel: string;
  }>;
  evidence: Array<{
    label: string;
    value: string;
  }>;
};

export function getSessionClosingBoardView(status: SessionClosingStatusInput): SessionClosingBoardView {
  return {
    title: `No.${String(status.session.sessionNumber).padStart(2, "0")} · ${status.session.bookTitle}`,
    subtitle: `${status.session.meetingDate} · ${visibilityLabel(status.session.recordVisibility)}`,
    statusLabel: status.overall.label,
    statusTone: overallTone(status.overall.state),
    primaryAction: primaryAction(status),
    checklist: status.checklist.map((item) => ({
      id: item.id,
      label: item.label,
      detail: item.detail,
      state: item.state,
      stateLabel: checklistStateLabel(item.state),
      tone: checklistTone(item.state),
      href: item.href,
      actionLabel: checklistActionLabel(item.href),
    })),
    surfaces: surfaceCards(status),
    evidence: [
      { label: "공개 요약", value: status.evidence.summaryPublished ? "저장됨" : "없음" },
      { label: "하이라이트", value: `${nonNegative(status.evidence.highlightCount)}` },
      { label: "한줄평", value: `${nonNegative(status.evidence.oneLinerCount)}` },
      { label: "피드백 문서", value: feedbackLabel(status.evidence.feedbackDocumentState) },
      { label: "최근 멤버 알림", value: notificationLabel(status.evidence.latestNotificationEvent) },
    ],
  };
}

function primaryAction(status: SessionClosingStatusInput): SessionClosingBoardView["primaryAction"] {
  const fallback = {
    label: "확인 필요",
    reason: "마감 상태를 다시 확인해야 합니다.",
    tone: overallTone(status.overall.state),
    href: null,
  };

  switch (status.overall.primaryAction) {
    case "CLOSE_SESSION":
      return {
        label: "세션 종료 확인",
        reason: "열린 세션을 먼저 닫아야 기록 패키지와 알림 상태를 판단할 수 있습니다.",
        tone: "warn",
        href: `/app/host/sessions/${status.session.sessionId}/edit`,
      };
    case "IMPORT_RECORDS":
      return {
        label: "기록 패키지 검토",
        reason: "요약, 하이라이트, 한줄평, 피드백 문서가 아직 마감 증거로 충분하지 않습니다.",
        tone: "danger",
        href: `/app/host/sessions/${status.session.sessionId}/edit?records=json`,
      };
    case "PUBLISH_RECORDS":
      return {
        label: "기록 공개 범위 확인",
        reason: "멤버 또는 공개 표면에 기록을 열기 전 공개 범위를 점검해야 합니다.",
        tone: "warn",
        href: `/app/host/sessions/${status.session.sessionId}/edit`,
      };
    case "SEND_NOTIFICATION":
      return {
        label: "멤버 알림 확인",
        reason: "멤버가 지난 모임 회고로 돌아갈 알림 흐름이 아직 완성되지 않았습니다.",
        tone: "warn",
        href: "/app/host/notifications",
      };
    case "REVIEW_PUBLIC_PAGE":
      return {
        label: "공개 기록 확인",
        reason: "공개 표면에 발행된 기록이 의도대로 보이는지 최종 확인합니다.",
        tone: "accent",
        href: status.evidence.publicRecordHref,
      };
    case "NONE":
      return {
        label: "추가 조치 없음",
        reason: "마감에 필요한 증거가 준비되어 있습니다.",
        tone: "ok",
        href: null,
      };
    default:
      return fallback;
  }
}

function overallTone(state: SessionClosingStatusInput["overall"]["state"]): SessionClosingTone {
  if (state === "PUBLISHED") return "ok";
  if (state === "READY") return "accent";
  if (state === "BLOCKED") return "danger";
  if (state === "IN_PROGRESS") return "warn";
  return "muted";
}

function checklistTone(state: SessionClosingStatusInput["checklist"][number]["state"]): SessionClosingTone {
  if (state === "DONE") return "ok";
  if (state === "BLOCKED") return "danger";
  if (state === "ACTION_REQUIRED") return "warn";
  return "muted";
}

function checklistStateLabel(state: SessionClosingStatusInput["checklist"][number]["state"]): string {
  switch (state) {
    case "DONE":
      return "완료";
    case "ACTION_REQUIRED":
      return "조치 필요";
    case "BLOCKED":
      return "차단";
    case "NOT_APPLICABLE":
      return "해당 없음";
    default:
      return "확인 필요";
  }
}

function checklistActionLabel(href: string | null): string {
  return href ? "확인하기" : "상태 확인";
}

function surfaceCards(status: SessionClosingStatusInput): SessionClosingBoardView["surfaces"] {
  return [
    {
      id: "HOST",
      title: "호스트 문서",
      detail: "호스트가 기록 패키지와 마감 상태를 관리할 수 있습니다.",
      tone: overallTone(status.overall.state),
      href: `/app/host/sessions/${status.session.sessionId}/edit`,
      actionLabel: "호스트 문서 확인",
    },
    {
      id: "MEMBER",
      title: "멤버 회고",
      detail: status.evidence.memberReflectionHref
        ? "멤버가 지난 모임 기록과 피드백으로 돌아갈 수 있습니다."
        : "멤버 회고 진입은 아직 확인되지 않았습니다.",
      tone: status.evidence.memberReflectionHref ? "ok" : "muted",
      href: status.evidence.memberReflectionHref,
      actionLabel: "멤버 회고 확인",
    },
    {
      id: "PUBLIC",
      title: "공개 기록",
      detail: status.evidence.publicRecordHref
        ? "공개 기록 표면에서 발행 상태를 확인할 수 있습니다."
        : "공개 표면에는 아직 발행되지 않았습니다.",
      tone: status.evidence.publicRecordHref ? "ok" : "muted",
      href: status.evidence.publicRecordHref,
      actionLabel: "공개 기록 확인",
    },
  ];
}

function feedbackLabel(state: SessionClosingStatusInput["evidence"]["feedbackDocumentState"]) {
  if (state === "AVAILABLE") return "열람 가능";
  if (state === "INVALID") return "확인 필요";
  if (state === "LOCKED") return "잠김";
  return "없음";
}

function notificationLabel(event: SessionClosingStatusInput["evidence"]["latestNotificationEvent"]): string {
  if (!event) return "없음";
  switch (event.status) {
    case "PUBLISHED":
      return "발송됨";
    case "PENDING":
      return "대기 중";
    case "FAILED":
      return "실패";
    case "DEAD":
      return "중단됨";
    default:
      return "확인 필요";
  }
}

function visibilityLabel(value: SessionClosingStatusInput["session"]["recordVisibility"]) {
  if (value === "PUBLIC") return "Public";
  if (value === "MEMBER") return "Members";
  return "Host only";
}

function nonNegative(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
