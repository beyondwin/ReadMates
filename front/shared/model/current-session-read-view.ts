import type {
  AttendanceStatus,
  CurrentSessionResponse,
  RsvpStatus,
  SessionParticipationStatus,
} from "@/shared/model/current-session-contracts";
import {
  GUEST_READ_SURFACE_CAPABILITIES,
  type ReadSurfaceCapabilities,
} from "@/shared/model/read-surface-capabilities";

export type CurrentSessionReadAttendee = {
  renderKey: string;
  avatarKey: string;
  displayName: string;
  role: "HOST" | "MEMBER" | null;
  rsvpStatus: RsvpStatus;
  attendanceStatus: AttendanceStatus;
  participationStatus: SessionParticipationStatus;
};

export type CurrentSessionQuestion = {
  priority: number;
  text: string;
  draftThought: string | null;
  authorName: string;
  authorShortName: string;
  avatarKey: string;
};

export type CurrentSessionLongReview = {
  authorName: string;
  authorShortName: string;
  avatarKey: string;
  body: string;
};

export type CurrentSessionReadView = {
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
  locationLabel: string | null;
  meetingUrl: string | null;
  meetingPasscode: string | null;
  questionDeadlineAt: string;
  myRsvpStatus: RsvpStatus | null;
  myCheckin: { readingProgress: number } | null;
  myQuestions: CurrentSessionQuestion[];
  myOneLineReview: { text: string } | null;
  myLongReview: { body: string } | null;
  board: {
    questions: CurrentSessionQuestion[];
    longReviews: CurrentSessionLongReview[];
  };
  attendees: CurrentSessionReadAttendee[];
  capabilities: ReadSurfaceCapabilities;
};

export type CurrentSessionReadPageData = {
  currentSession: CurrentSessionReadView | null;
};

export type GuestCurrentSessionReadSource = {
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
    questionDeadlineAt: string;
    attendees: Array<{
      displayName: string;
      avatarKey: string;
      rsvpStatus: string;
      attendanceStatus: string;
    }>;
    board: {
      questions: CurrentSessionQuestion[];
      longReviews: Array<{
        title: string;
        content: string;
        authorName: string;
        authorShortName: string;
        avatarKey: string;
      }>;
    };
  };
};

function guestRsvpStatus(value: string): RsvpStatus {
  switch (value) {
    case "NO_RESPONSE":
    case "GOING":
    case "MAYBE":
    case "DECLINED":
      return value;
    default:
      return "NO_RESPONSE";
  }
}

function guestAttendanceStatus(value: string): AttendanceStatus {
  switch (value) {
    case "UNKNOWN":
    case "ATTENDED":
    case "ABSENT":
      return value;
    default:
      return "UNKNOWN";
  }
}

export function memberCurrentSessionReadPage(
  response: CurrentSessionResponse,
  capabilities: ReadSurfaceCapabilities,
): CurrentSessionReadPageData {
  if (response.currentSession === null) {
    return { currentSession: null };
  }

  const session = response.currentSession;
  return {
    currentSession: {
      sessionId: session.sessionId,
      sessionNumber: session.sessionNumber,
      title: session.title,
      bookTitle: session.bookTitle,
      bookAuthor: session.bookAuthor,
      bookLink: session.bookLink,
      bookImageUrl: session.bookImageUrl,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      locationLabel: session.locationLabel,
      meetingUrl: session.meetingUrl,
      meetingPasscode: session.meetingPasscode,
      questionDeadlineAt: session.questionDeadlineAt,
      myRsvpStatus: session.myRsvpStatus,
      myCheckin: session.myCheckin,
      myQuestions: session.myQuestions,
      myOneLineReview: session.myOneLineReview,
      myLongReview: session.myLongReview,
      board: session.board,
      attendees: session.attendees.map((attendee) => ({
        renderKey: attendee.membershipId,
        avatarKey: attendee.avatarKey,
        displayName: attendee.displayName,
        role: attendee.role,
        rsvpStatus: attendee.rsvpStatus,
        attendanceStatus: attendee.attendanceStatus,
        participationStatus: attendee.participationStatus ?? "ACTIVE",
      })),
      capabilities,
    },
  };
}

export function guestCurrentSessionReadPage(
  response: GuestCurrentSessionReadSource,
): CurrentSessionReadPageData {
  if (response.currentSession === null) {
    return { currentSession: null };
  }

  const session = response.currentSession;
  return {
    currentSession: {
      sessionId: session.sessionId,
      sessionNumber: session.sessionNumber,
      title: session.title,
      bookTitle: session.bookTitle,
      bookAuthor: session.bookAuthor,
      bookLink: session.bookLink,
      bookImageUrl: session.bookImageUrl,
      date: session.date,
      startTime: session.startTime,
      endTime: session.endTime,
      locationLabel: null,
      meetingUrl: null,
      meetingPasscode: null,
      questionDeadlineAt: session.questionDeadlineAt,
      myRsvpStatus: null,
      myCheckin: null,
      myQuestions: [],
      myOneLineReview: null,
      myLongReview: null,
      board: {
        questions: session.board.questions,
        longReviews: session.board.longReviews.map((review) => ({
          authorName: review.authorName,
          authorShortName: review.authorShortName,
          avatarKey: review.avatarKey,
          body: review.content,
        })),
      },
      attendees: session.attendees.map((attendee, index) => ({
        renderKey: "guest-" + index + "-" + attendee.displayName + "-" + attendee.avatarKey,
        avatarKey: attendee.avatarKey,
        displayName: attendee.displayName,
        role: null,
        rsvpStatus: guestRsvpStatus(attendee.rsvpStatus),
        attendanceStatus: guestAttendanceStatus(attendee.attendanceStatus),
        participationStatus: "ACTIVE",
      })),
      capabilities: GUEST_READ_SURFACE_CAPABILITIES,
    },
  };
}
