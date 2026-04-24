import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { AttendanceStatus, RsvpStatus } from "@/shared/model/readmates-types";

export type MemberHomeAuth = AuthMeResponse;
export type MemberHomeMemberRole = "HOST" | "MEMBER";
export type MemberHomeMembershipStatus = "INVITED" | "VIEWER" | "ACTIVE" | "SUSPENDED" | "LEFT" | "INACTIVE";
export type MemberHomeSessionParticipationStatus = "ACTIVE" | "REMOVED";

export type MemberHomeCurrentSessionResponse = {
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

export type MemberHomeNoteFeedItem = {
  sessionId: string;
  sessionNumber: number;
  bookTitle: string;
  date: string;
  authorName: string | null;
  authorShortName: string | null;
  kind: "QUESTION" | "ONE_LINE_REVIEW" | "HIGHLIGHT";
  text: string;
};

export type MemberHomeUpcomingSession = {
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
