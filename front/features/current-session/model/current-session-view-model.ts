export const SUSPENDED_MEMBER_NOTICE = "멤버십이 일시 정지되어 새 활동을 저장할 수 없습니다.";
export const VIEWER_MEMBER_NOTICE = "둘러보기 멤버입니다. 정식 멤버가 되면 RSVP와 질문 작성이 열립니다.";
export const VIEWER_MEMBER_SHORT_NOTICE = "정식 멤버가 되면 참여와 작성이 열립니다.";

export type CurrentSessionAccessAuth = {
  membershipStatus: string | null;
  approvalState: string | null;
  role?: string | null;
};

export type CurrentSessionBoard = {
  questions: readonly unknown[];
  oneLineReviews: readonly unknown[];
  highlights: readonly unknown[];
};

export type CurrentSessionBoardTab = "questions" | "oneLineReviews" | "highlights";

export type CurrentSessionSaveScope = "rsvp" | "checkin" | "question" | "longReview" | "oneLineReview";
export type CurrentSessionSaveState = "idle" | "saving" | "saved" | "error";

const saveScopeLabels: Record<CurrentSessionSaveScope, string> = {
  rsvp: "RSVP",
  checkin: "진행률",
  question: "질문",
  longReview: "서평",
  oneLineReview: "한줄평",
};

export function getCurrentSessionAccessState(auth?: CurrentSessionAccessAuth) {
  const isViewer = auth?.membershipStatus === "VIEWER";
  const isSuspended = auth?.membershipStatus === "SUSPENDED";
  const isHost = auth?.role === "HOST";
  const canWrite = auth ? auth.membershipStatus === "ACTIVE" && auth.approvalState === "ACTIVE" : true;

  return {
    isViewer,
    isSuspended,
    isHost,
    canWrite,
  };
}

export function getBlockedWriteValidationMessage(access: { isViewer: boolean }) {
  return access.isViewer ? VIEWER_MEMBER_NOTICE : "";
}

export function getCurrentSessionMemberNotice(access: { isViewer: boolean; isSuspended: boolean }) {
  if (access.isSuspended) {
    return {
      kind: "suspended",
      message: SUSPENDED_MEMBER_NOTICE,
    } as const;
  }

  if (access.isViewer) {
    return {
      kind: "viewer",
      message: VIEWER_MEMBER_SHORT_NOTICE,
    } as const;
  }

  return null;
}

export function getCurrentSessionBoardTabs(board: CurrentSessionBoard) {
  return [
    { key: "questions", label: `질문 · ${board.questions.length}`, count: board.questions.length },
    { key: "oneLineReviews", label: `한줄평 · ${board.oneLineReviews.length}`, count: board.oneLineReviews.length },
    { key: "highlights", label: `하이라이트 · ${board.highlights.length}`, count: board.highlights.length },
  ] satisfies Array<{ key: CurrentSessionBoardTab; label: string; count: number }>;
}

export function getCurrentSessionFeedbackAccessState(isViewer: boolean) {
  if (isViewer) {
    return {
      className: "rm-locked-state",
      title: "정식 멤버에게 열립니다",
      body: "둘러보기 멤버는 현재 세션 내용은 읽을 수 있지만, 참석자 피드백 문서와 작성 기능은 제한됩니다.",
      canOpenArchive: false,
    } as const;
  }

  return {
    className: "surface-quiet",
    title: "참석한 세션의 피드백 문서를 보존합니다",
    body: "이번 세션 피드백은 모임 이후 호스트가 업로드하면 참석자 기준으로 열립니다.",
    canOpenArchive: true,
  } as const;
}

export function getCurrentSessionSaveStatusLabel(scope: CurrentSessionSaveScope, status: CurrentSessionSaveState) {
  if (status === "saving") {
    return `${saveScopeLabels[scope]} 변경사항을 저장하는 중`;
  }

  if (status === "saved") {
    return `${saveScopeLabels[scope]} 저장됨`;
  }

  if (status === "error") {
    return `${saveScopeLabels[scope]} 저장 실패 · 다시 시도해 주세요`;
  }

  return "";
}
