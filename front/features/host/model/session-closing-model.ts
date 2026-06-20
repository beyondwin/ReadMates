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
    href: string | null;
  };
  checklist: Array<{
    id: string;
    label: string;
    detail: string;
    state: SessionClosingStatusInput["checklist"][number]["state"];
    tone: SessionClosingTone;
    href: string | null;
  }>;
  surfaces: Array<{
    id: "HOST" | "MEMBER" | "PUBLIC";
    title: string;
    detail: string;
    tone: SessionClosingTone;
    href: string | null;
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
      tone: checklistTone(item.state),
      href: item.href,
    })),
    surfaces: [
      {
        id: "HOST",
        title: "Host",
        detail: hostSurfaceDetail(status),
        tone: overallTone(status.overall.state),
        href: `/app/host/sessions/${status.session.sessionId}/edit`,
      },
      {
        id: "MEMBER",
        title: "Member",
        detail: status.evidence.memberReflectionHref ? "Member reflection entry is ready." : "Member reflection entry is not confirmed yet.",
        tone: status.evidence.memberReflectionHref ? "ok" : "muted",
        href: status.evidence.memberReflectionHref,
      },
      {
        id: "PUBLIC",
        title: "Public",
        detail: status.evidence.publicRecordHref ? "Visible on the public record surface." : "Not visible on the public surface yet.",
        tone: status.evidence.publicRecordHref ? "ok" : "muted",
        href: status.evidence.publicRecordHref,
      },
    ],
    evidence: [
      { label: "Public summary", value: status.evidence.summaryPublished ? "Saved" : "Missing" },
      { label: "Highlights", value: `${nonNegative(status.evidence.highlightCount)}` },
      { label: "One-liners", value: `${nonNegative(status.evidence.oneLinerCount)}` },
      { label: "Feedback document", value: feedbackLabel(status.evidence.feedbackDocumentState) },
      { label: "Latest notification", value: status.evidence.latestNotificationEvent?.status ?? "None" },
    ],
  };
}

function primaryAction(status: SessionClosingStatusInput) {
  switch (status.overall.primaryAction) {
    case "CLOSE_SESSION":
      return { label: "세션 종료 확인", href: `/app/host/sessions/${status.session.sessionId}/edit` };
    case "IMPORT_RECORDS":
      return { label: "기록 패키지 검토", href: `/app/host/sessions/${status.session.sessionId}/edit?records=json` };
    case "PUBLISH_RECORDS":
      return { label: "기록 공개 설정 확인", href: `/app/host/sessions/${status.session.sessionId}/edit` };
    case "SEND_NOTIFICATION":
      return { label: "멤버 알림 상태 확인", href: "/app/host/notifications" };
    case "REVIEW_PUBLIC_PAGE":
      return { label: "공개 기록 확인", href: status.evidence.publicRecordHref };
    case "NONE":
      return { label: "추가 조치 없음", href: null };
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

function feedbackLabel(state: SessionClosingStatusInput["evidence"]["feedbackDocumentState"]) {
  if (state === "AVAILABLE") return "Ready";
  if (state === "INVALID") return "Needs review";
  if (state === "LOCKED") return "Locked";
  return "Missing";
}

function visibilityLabel(value: SessionClosingStatusInput["session"]["recordVisibility"]) {
  if (value === "PUBLIC") return "Public";
  if (value === "MEMBER") return "Members";
  return "Host only";
}

function hostSurfaceDetail(status: SessionClosingStatusInput) {
  return status.overall.state === "BLOCKED"
    ? "Resolve the blocking item before closing this session."
    : "Host checklist and recovery links are available.";
}

function nonNegative(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}
