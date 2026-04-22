export type FeedbackDocumentView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  subtitle: string;
  bookTitle: string;
  date: string;
  fileName: string;
  uploadedAt: string;
  metadata: Array<{
    label: string;
    value: string;
  }>;
  observerNotes: string[];
  participants: Array<{
    number: number;
    name: string;
    role: string;
    style: string[];
    contributions: string[];
    problems: Array<{
      title: string;
      core: string;
      evidence: string;
      interpretation: string;
    }>;
    actionItems: string[];
    revealingQuote: {
      quote: string;
      context: string;
      note: string;
    };
  }>;
};

export type FeedbackUnavailableReason = "forbidden" | "missing";

export type ReadmatesReturnState = {
  readmatesReturnTo: string;
  readmatesReturnLabel: string;
  readmatesReturnState?: ReadmatesReturnState;
};

export type ReadmatesReturnTarget = {
  href: string;
  label: string;
  state?: ReadmatesReturnState;
};

export const archiveReportReturnTarget: ReadmatesReturnTarget = {
  href: "/app/archive?view=report",
  label: "아카이브로 돌아가기",
};

export function appFeedbackHref(sessionId: string, printMode = false) {
  return `/app/feedback/${encodeURIComponent(sessionId)}${printMode ? "/print" : ""}`;
}

export function readmatesReturnState(target: ReadmatesReturnTarget): ReadmatesReturnState {
  const state: ReadmatesReturnState = {
    readmatesReturnTo: target.href,
    readmatesReturnLabel: target.label,
  };

  if (target.state) {
    state.readmatesReturnState = target.state;
  }

  return state;
}

export function feedbackUnavailableCopy(reason: FeedbackUnavailableReason) {
  return reason === "forbidden"
    ? {
        eyebrow: "열람 제한",
        title: "피드백 문서는 정식 멤버와 참석자에게만 열립니다.",
        body: "둘러보기 멤버는 전체 세션 기록을 읽을 수 있지만, 회차 피드백 문서는 볼 수 없습니다.",
      }
    : {
        eyebrow: "피드백 문서",
        title: "아직 열람 가능한 피드백 문서가 없습니다.",
        body: "호스트가 피드백 문서를 등록하면 이 화면에서 확인할 수 있습니다.",
      };
}
