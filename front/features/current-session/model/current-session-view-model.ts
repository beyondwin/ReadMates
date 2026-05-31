import {
  deriveReadingLoopState,
  READING_LOOP_LABELS,
  readingLoopDescription,
  type ReadingLoopRsvpStatus,
  type ReadingLoopState,
} from "@/shared/model/reading-loop";

export const SUSPENDED_MEMBER_NOTICE = "멤버십이 일시 정지되어 새 기록을 남길 수 없습니다.";
export const VIEWER_MEMBER_NOTICE = "둘러보기 멤버입니다. 정식 멤버가 되면 RSVP와 질문 작성 기능이 열립니다.";
export const VIEWER_MEMBER_SHORT_NOTICE = "정식 멤버가 되면 참여 기능과 작성 기능이 열립니다.";

export type CurrentSessionAccessAuth = {
  membershipStatus: string | null;
  approvalState: string | null;
  role?: string | null;
};

export type CurrentSessionBoard = {
  questions: readonly unknown[];
  longReviews: readonly unknown[];
};

export type CurrentSessionBoardTab = "questions" | "longReviews";

export type CurrentSessionSaveScope = "rsvp" | "checkin" | "question" | "longReview" | "oneLineReview";
export type CurrentSessionSaveState = "idle" | "saving" | "saved" | "error";
export type CurrentSessionReadingLoopSummary = {
  state: ReadingLoopState;
  label: string;
  body: string;
};

export type CurrentSessionReadingLoopSummaryInput = {
  rsvp: ReadingLoopRsvpStatus;
  readingProgress: number;
  writtenQuestionCount: number;
  oneLineReview: string;
  longReview: string;
  canWrite: boolean;
  sessionDate: string | null;
  today?: Date;
};

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
    { key: "longReviews", label: `서평 · ${board.longReviews.length}`, count: board.longReviews.length },
  ] satisfies Array<{ key: CurrentSessionBoardTab; label: string; count: number }>;
}

export function getCurrentSessionFeedbackAccessState(access: { isViewer: boolean; isSuspended: boolean }) {
  if (access.isViewer) {
    return {
      className: "rm-locked-state",
      title: "정식 멤버에게 열립니다",
      body: "둘러보기 멤버는 현재 세션 내용은 읽을 수 있지만, 참석자 피드백 문서와 작성 기능은 제한됩니다.",
      canOpenArchive: false,
    } as const;
  }

  if (access.isSuspended) {
    return {
      className: "rm-locked-state",
      title: "활성 멤버에게 열립니다",
      body: "멤버십이 일시 정지된 동안에는 참석자 피드백 문서를 열 수 없습니다.",
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

export function getCurrentSessionReadingLoopSummary(
  input: CurrentSessionReadingLoopSummaryInput,
): CurrentSessionReadingLoopSummary {
  if (!input.canWrite) {
    const state = deriveReadingLoopState({
      hasCurrentSession: true,
      memberCanWrite: false,
      memberRsvpStatus: input.rsvp,
      memberHasCheckin: input.readingProgress > 0,
      memberQuestionCount: input.writtenQuestionCount,
      sessionDate: input.sessionDate,
      today: input.today,
      memberHasReflection: true,
    });

    return {
      state,
      label: READING_LOOP_LABELS[state],
      body: "세션 내용을 읽고 공동 보드를 확인할 수 있습니다.",
    };
  }

  const hasReflection = Boolean(input.oneLineReview.trim() || input.longReview.trim());
  const state = deriveReadingLoopState({
    hasCurrentSession: true,
    memberCanWrite: true,
    memberRsvpStatus: input.rsvp,
    memberHasCheckin: input.readingProgress > 0,
    memberQuestionCount: input.writtenQuestionCount,
    minimumQuestionCount: 2,
    sessionDate: input.sessionDate,
    today: input.today,
    memberHasReflection: hasReflection,
  });

  if (state === "MEMBER_PREP_REQUIRED") {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      body: "RSVP, 읽기 진행률, 질문을 모임 전에 정리합니다.",
    };
  }

  if (state === "REFLECTION_DUE") {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      body: "모임 후 한줄평이나 서평을 남겨 다음 기록으로 이어갑니다.",
    };
  }

  return {
    state,
    label: READING_LOOP_LABELS[state],
    body: readingLoopDescription(state),
  };
}
