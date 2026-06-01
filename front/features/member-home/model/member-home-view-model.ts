import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { CurrentSessionResponse } from "@/shared/model/current-session-contracts";
import {
  READING_LOOP_LABELS,
  deriveReadingLoopState,
  getReadingLoopNextAction,
  type ReadingLoopMissingWork,
  type ReadingLoopState,
} from "@/shared/model/reading-loop";

export type MemberHomeAuth = AuthMeResponse;
export type MemberHomeMembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";

export type MemberHomeCurrentSessionView = CurrentSessionResponse;

export type MemberHomeNoteFeedItemView = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  authorName: string | null;
  authorShortName: string | null;
  kind: "QUESTION" | "ONE_LINE_REVIEW" | "HIGHLIGHT";
  text: string;
};

export type MemberHomeUpcomingSessionView = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookImageUrl: string | null;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  visibility: "MEMBER" | "PUBLIC";
};

export type MemberHomeView = {
  auth: MemberHomeAuth;
  current: MemberHomeCurrentSessionView;
  noteFeedItems: MemberHomeNoteFeedItemView[];
  upcomingSessions: MemberHomeUpcomingSessionView[];
};

export type MemberHomeNextReadingAction = {
  state: ReadingLoopState;
  label: string;
  message: string;
  href: string | null;
  ctaLabel: string | null;
};

export type MemberHomeNextReadingActionInput = {
  session: MemberHomeCurrentSessionView["currentSession"];
  isViewer: boolean;
  canWrite: boolean;
  noteFeedItems?: MemberHomeNoteFeedItemView[];
  today?: Date;
};

export function memberHomeViewFromRouteData(view: MemberHomeView): MemberHomeView {
  return view;
}

function missingWorkForMemberHome(
  session: NonNullable<MemberHomeCurrentSessionView["currentSession"]>,
): ReadingLoopMissingWork {
  if (session.myRsvpStatus === "NO_RESPONSE") {
    return "RSVP";
  }

  if (!session.myCheckin) {
    return "CHECKIN";
  }

  if (session.myQuestions.length < 2) {
    return "QUESTION";
  }

  if (!session.myOneLineReview && !session.myLongReview) {
    return "REFLECTION";
  }

  return "ARCHIVE";
}

export function getMemberHomeNextReadingAction({
  session,
  isViewer,
  canWrite,
  noteFeedItems = [],
  today = new Date(),
}: MemberHomeNextReadingActionInput): MemberHomeNextReadingAction {
  const state = deriveReadingLoopState({
    hasCurrentSession: session !== null,
    memberCanWrite: canWrite,
    memberRsvpStatus: session?.myRsvpStatus,
    memberHasCheckin: session ? session.myCheckin !== null : undefined,
    memberQuestionCount: session?.myQuestions.length,
    minimumQuestionCount: 2,
    sessionDate: session?.date,
    today,
    memberHasReflection: session ? !canWrite || session.myOneLineReview !== null || session.myLongReview !== null : undefined,
    archiveItemCount: noteFeedItems.length,
  });

  if (!session) {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: isViewer ? "다음 세션이 열리면 읽기 전용으로 확인할 수 있어요." : "호스트가 세션을 열면 준비를 시작합니다.",
      href: null,
      ctaLabel: null,
    };
  }

  if (!canWrite && state !== "ARCHIVE_AVAILABLE") {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "세션을 읽고 공동 보드를 확인할 수 있어요.",
      href: "/app/session/current",
      ctaLabel: "세션 읽기",
    };
  }

  if (state === "MEMBER_PREP_REQUIRED") {
    const missing = missingWorkForMemberHome(session);
    const action = getReadingLoopNextAction({ state, missing });

    if (missing === "RSVP") {
      return {
        state,
        label: READING_LOOP_LABELS[state],
        message: "RSVP를 먼저 선택해 주세요.",
        href: action.href,
        ctaLabel: action.label,
      };
    }

    if (missing === "CHECKIN") {
      return {
        state,
        label: READING_LOOP_LABELS[state],
        message: "읽기 진행률을 남겨 주세요.",
        href: action.href,
        ctaLabel: action.label,
      };
    }

    if (missing === "QUESTION") {
      return {
        state,
        label: READING_LOOP_LABELS[state],
        message: `질문 ${2 - session.myQuestions.length}개를 더 준비해 주세요.`,
        href: action.href,
        ctaLabel: action.label,
      };
    }
  }

  if (state === "REFLECTION_DUE") {
    const action = getReadingLoopNextAction({ state, missing: "REFLECTION" });

    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "모임 후 한줄평이나 서평을 남겨 주세요.",
      href: action.href,
      ctaLabel: action.label,
    };
  }

  if (state === "ARCHIVE_AVAILABLE") {
    const action = getReadingLoopNextAction({ state, missing: "ARCHIVE" });

    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "최근 보존된 기록을 이어 읽을 수 있어요.",
      href: action.href,
      ctaLabel: action.label,
    };
  }

  const action = getReadingLoopNextAction({ state, missing: "NONE" });

  return {
    state,
    label: READING_LOOP_LABELS[state],
    message: "준비가 정리되었습니다. 모임 전까지 수정할 수 있어요.",
    href: action.href,
    ctaLabel: action.label,
  };
}
