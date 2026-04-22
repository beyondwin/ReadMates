import type { CSSProperties, ReactNode } from "react";

export {
  SUSPENDED_MEMBER_NOTICE,
  VIEWER_MEMBER_NOTICE,
  VIEWER_MEMBER_SHORT_NOTICE,
} from "@/features/current-session/model/current-session-view-model";

export type CurrentSessionAuth = {
  membershipStatus: string | null;
  approvalState: string | null;
  role?: "HOST" | "MEMBER" | null;
};

export type RsvpStatus = "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED";
export type AttendanceStatus = "UNKNOWN" | "ATTENDED" | "ABSENT";
export type SessionParticipationStatus = "ACTIVE" | "REMOVED";
export type CurrentSessionMemberRole = "HOST" | "MEMBER";

export type CurrentSession = {
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
    note: string;
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
    checkins: Array<{
      authorName: string;
      authorShortName: string;
      readingProgress: number;
      note: string;
    }>;
    highlights: Array<{
      text: string;
      sortOrder: number;
    }>;
  };
  attendees: Array<{
    membershipId: string;
    displayName: string;
    shortName: string;
    role: CurrentSessionMemberRole;
    rsvpStatus: RsvpStatus;
    attendanceStatus: AttendanceStatus;
    participationStatus?: SessionParticipationStatus;
  }>;
};

export type CurrentSessionPageData = {
  currentSession: CurrentSession | null;
};

export type RsvpUpdateStatus = Exclude<CurrentSession["myRsvpStatus"], "NO_RESPONSE">;
export type BoardQuestion = CurrentSession["board"]["questions"][number];
export type BoardCheckin = CurrentSession["board"]["checkins"][number];
export type BoardHighlight = CurrentSession["board"]["highlights"][number];
export type SaveScope = "rsvp" | "checkin" | "question" | "longReview" | "oneLineReview";
export type SaveState = "idle" | "saving" | "saved" | "error";

export type CurrentSessionInternalLinkProps = {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

export type InternalLinkComponent = (props: CurrentSessionInternalLinkProps) => ReactNode;
