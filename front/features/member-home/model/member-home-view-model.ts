import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { READING_LOOP_LABELS, deriveReadingLoopState, type ReadingLoopState } from "@/shared/model/reading-loop";
import type { AttendanceStatus, RsvpStatus } from "@/shared/model/readmates-types";

export type MemberHomeAuth = AuthMeResponse;
export type MemberHomeMemberRole = "HOST" | "MEMBER";
export type MemberHomeMembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type MemberHomeSessionParticipationStatus = "ACTIVE" | "REMOVED";

export type MemberHomeCurrentSessionView = {
  currentSession: null | {
    sessionId: string;
    sessionNumber: number;
    title: string;
    bookTitle: string;
    bookAuthor: string;
    bookLink: string | null;
    bookImageUrl: string | null;
    date: string;
    startTime: string;
    endTime: string;
    locationLabel: string;
    meetingUrl: string | null;
    meetingPasscode: string | null;
    questionDeadlineAt: string;
    myRsvpStatus: RsvpStatus;
    myCheckin: null | {
      readingProgress: number;
    };
    myQuestions: Array<{
      priority: number;
      text: string;
      draftThought: string | null;
      authorName: string;
      authorShortName: string;
    }>;
    myOneLineReview: null | {
      text: string;
    };
    myLongReview: null | {
      body: string;
    };
    board: {
      questions: Array<{
        priority: number;
        text: string;
        draftThought: string | null;
        authorName: string;
        authorShortName: string;
      }>;
      oneLineReviews: Array<{
        authorName: string;
        authorShortName: string;
        text: string;
      }>;
      highlights: Array<{
        text: string;
        sortOrder: number;
      }>;
    };
    attendees: Array<{
      membershipId: string;
      displayName: string;
      accountName: string;
      role: MemberHomeMemberRole;
      rsvpStatus: RsvpStatus;
      attendanceStatus: AttendanceStatus;
      participationStatus?: MemberHomeSessionParticipationStatus;
    }>;
  };
};

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
    memberHasReflection: session ? session.myOneLineReview !== null || session.myLongReview !== null : undefined,
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
    if (session.myRsvpStatus === "NO_RESPONSE") {
      return {
        state,
        label: READING_LOOP_LABELS[state],
        message: "RSVP를 먼저 선택해 주세요.",
        href: "/app/session/current",
        ctaLabel: "RSVP 하기",
      };
    }

    if (!session.myCheckin) {
      return {
        state,
        label: READING_LOOP_LABELS[state],
        message: "읽기 진행률을 남겨 주세요.",
        href: "/app/session/current",
        ctaLabel: "진행률 남기기",
      };
    }

    if (session.myQuestions.length < 2) {
      return {
        state,
        label: READING_LOOP_LABELS[state],
        message: `질문 ${2 - session.myQuestions.length}개를 더 준비해 주세요.`,
        href: "/app/session/current",
        ctaLabel: "질문 쓰기",
      };
    }
  }

  if (state === "REFLECTION_DUE") {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "모임 후 한줄평이나 서평을 남겨 주세요.",
      href: "/app/session/current",
      ctaLabel: "회고 남기기",
    };
  }

  if (state === "ARCHIVE_AVAILABLE") {
    return {
      state,
      label: READING_LOOP_LABELS[state],
      message: "최근 보존된 기록을 이어 읽을 수 있어요.",
      href: "/app/notes",
      ctaLabel: "노트 보기",
    };
  }

  return {
    state,
    label: READING_LOOP_LABELS[state],
    message: "준비가 정리되었습니다. 모임 전까지 수정할 수 있어요.",
    href: "/app/session/current",
    ctaLabel: "세션 열기",
  };
}
