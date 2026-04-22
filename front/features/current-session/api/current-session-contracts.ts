export type RsvpStatus = "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED";
export type AttendanceStatus = "UNKNOWN" | "ATTENDED" | "ABSENT";
export type SessionParticipationStatus = "ACTIVE" | "REMOVED";
export type CurrentSessionMemberRole = "HOST" | "MEMBER";

export type CurrentSessionResponse = {
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
};

export type UpdateRsvpRequest = {
  status: RsvpStatus;
};

export type UpdateRsvpResponse = {
  status: RsvpStatus;
};

export type CheckinRequest = {
  readingProgress: number;
  note: string;
};

export type CheckinResponse = CheckinRequest;

export type CreateQuestionRequest = {
  priority: number;
  text: string;
  draftThought?: string | null;
};

export type QuestionResponse = {
  priority: number;
  text: string;
  draftThought: string | null;
};
