import type { HostSessionDetailResponse } from "@/features/host/model/host-view-types";
import type { AttendanceStatus } from "@/shared/model/readmates-types";
import {
  initialAttendanceStatuses,
  initialFeedbackDocumentStatus,
  initialPublicationSummary,
  initialRecordVisibility,
  hydrateHostSessionFormValues,
  type HostSessionFeedbackDocumentStatus,
  type SessionRecordVisibility,
} from "@/features/host/model/host-session-editor-model";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export type HostSessionEditorFormState = {
  // Basic session fields
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink: string;
  bookImageUrl: string;
  date: string;
  time: string;
  locationLabel: string;
  meetingUrl: string;
  meetingPasscode: string;

  // Publication fields
  recordVisibility: SessionRecordVisibility;
  summary: string;
  hasPublicationRecord: boolean;

  // Session lifecycle
  sessionState: HostSessionDetailResponse["state"];
  displaySessionSnapshot: HostSessionDetailResponse | null;

  // Attendance
  attendanceStatuses: Record<string, AttendanceStatus>;

  // Feedback document
  feedbackDocument: HostSessionFeedbackDocumentStatus;
};

// ---------------------------------------------------------------------------
// Action union
// ---------------------------------------------------------------------------

export type BasicSessionField =
  | "title"
  | "bookTitle"
  | "bookAuthor"
  | "bookLink"
  | "bookImageUrl"
  | "date"
  | "time"
  | "locationLabel"
  | "meetingUrl"
  | "meetingPasscode"
  | "summary";

export type HostSessionEditorAction =
  | {
      type: "SET_FIELD";
      key: BasicSessionField;
      value: string;
    }
  | {
      type: "SET_RECORD_VISIBILITY";
      visibility: SessionRecordVisibility;
    }
  | {
      type: "HYDRATE";
      session: HostSessionDetailResponse;
    }
  | {
      type: "UPDATE_ATTENDANCE";
      membershipId: string;
      status: AttendanceStatus;
    }
  | {
      type: "PUBLICATION_SAVED";
      publicSummary: string;
      visibility: SessionRecordVisibility;
    }
  | {
      type: "SESSION_LIFECYCLE_UPDATED";
      snapshot: HostSessionDetailResponse;
    }
  | {
      type: "FEEDBACK_DOCUMENT_UPDATED";
      feedbackDocument: HostSessionFeedbackDocumentStatus;
    };

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function hostSessionEditorReducer(
  state: HostSessionEditorFormState,
  action: HostSessionEditorAction,
): HostSessionEditorFormState {
  switch (action.type) {
    case "SET_FIELD":
      return { ...state, [action.key]: action.value };

    case "SET_RECORD_VISIBILITY":
      return { ...state, recordVisibility: action.visibility };

    case "HYDRATE": {
      const values = hydrateHostSessionFormValues(action.session);
      return {
        ...state,
        title: values.title,
        bookTitle: values.bookTitle,
        bookAuthor: values.bookAuthor,
        bookLink: values.bookLink,
        bookImageUrl: values.bookImageUrl,
        date: values.date,
        time: values.startTime,
        locationLabel: values.locationLabel,
        meetingUrl: values.meetingUrl,
        meetingPasscode: values.meetingPasscode,
        recordVisibility: initialRecordVisibility(action.session),
        summary: initialPublicationSummary(action.session),
        hasPublicationRecord: Boolean(action.session.publication),
        sessionState: action.session.state,
        attendanceStatuses: initialAttendanceStatuses(action.session.attendees),
        feedbackDocument: initialFeedbackDocumentStatus(action.session),
      };
    }

    case "UPDATE_ATTENDANCE":
      return {
        ...state,
        attendanceStatuses: {
          ...state.attendanceStatuses,
          [action.membershipId]: action.status,
        },
      };

    case "PUBLICATION_SAVED":
      return {
        ...state,
        summary: action.publicSummary,
        recordVisibility: action.visibility,
        hasPublicationRecord: true,
      };

    case "SESSION_LIFECYCLE_UPDATED":
      return {
        ...state,
        sessionState: action.snapshot.state,
        displaySessionSnapshot: action.snapshot,
      };

    case "FEEDBACK_DOCUMENT_UPDATED":
      return {
        ...state,
        feedbackDocument: action.feedbackDocument,
      };
  }
}

// ---------------------------------------------------------------------------
// Initial state factory (used as third arg to useReducer for lazy init)
// ---------------------------------------------------------------------------

export function initialHostSessionEditorState(
  session: HostSessionDetailResponse | null | undefined,
): HostSessionEditorFormState {
  const values = hydrateHostSessionFormValues(session);

  return {
    title: values.title,
    bookTitle: values.bookTitle,
    bookAuthor: values.bookAuthor,
    bookLink: values.bookLink,
    bookImageUrl: values.bookImageUrl,
    date: values.date,
    time: values.startTime,
    locationLabel: values.locationLabel,
    meetingUrl: values.meetingUrl,
    meetingPasscode: values.meetingPasscode,
    recordVisibility: initialRecordVisibility(session),
    summary: initialPublicationSummary(session),
    hasPublicationRecord: Boolean(session?.publication),
    sessionState: session?.state ?? "DRAFT",
    displaySessionSnapshot: null,
    attendanceStatuses: initialAttendanceStatuses(session?.attendees),
    feedbackDocument: initialFeedbackDocumentStatus(session),
  };
}
