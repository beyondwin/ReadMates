import type { HostSessionDetailResponse } from "@/features/host/model/host-view-types";
import type { AttendanceStatus } from "@/shared/model/readmates-types";
import {
  applyScheduleDefaults,
  type HostSessionScheduleDefaults,
} from "@/features/host/model/host-schedule-defaults-model";
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
  endTime: string;
  locationLabel: string;
  meetingUrl: string;
  meetingPasscode: string;
  questionDeadlineOffsetDays: number;

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
    }
  | {
      type: "APPLY_SCHEDULE_DEFAULTS";
      defaults: HostSessionScheduleDefaults;
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
        endTime: action.session.endTime,
        locationLabel: values.locationLabel,
        meetingUrl: values.meetingUrl,
        meetingPasscode: values.meetingPasscode,
        questionDeadlineOffsetDays: 1,
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

    case "APPLY_SCHEDULE_DEFAULTS": {
      const applied = applyScheduleDefaults({
        bookTitle: state.bookTitle,
        bookAuthor: state.bookAuthor,
        date: state.date,
        startTime: state.time,
        endTime: state.endTime,
        locationLabel: state.locationLabel,
        meetingUrl: state.meetingUrl,
        meetingPasscode: state.meetingPasscode,
      }, action.defaults);
      return {
        ...state,
        date: applied.date,
        time: applied.startTime,
        endTime: applied.endTime,
        locationLabel: applied.locationLabel,
        meetingUrl: applied.meetingUrl,
        meetingPasscode: applied.meetingPasscode,
        questionDeadlineOffsetDays: action.defaults.automatic.questionDeadlineOffsetDays,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Initial state factory (used as third arg to useReducer for lazy init)
// ---------------------------------------------------------------------------

export type HostSessionEditorInit = {
  session?: HostSessionDetailResponse | null;
  scheduleDefaults?: HostSessionScheduleDefaults | null;
};

export function initialHostSessionEditorState(
  init: HostSessionEditorInit,
): HostSessionEditorFormState {
  const session = init.session;
  const values = hydrateHostSessionFormValues(session);
  const resolvedDefaults = init.scheduleDefaults ?? null;
  const prefillMode = !session && resolvedDefaults !== null;
  const applied = prefillMode && resolvedDefaults
    ? applyScheduleDefaults({
      bookTitle: values.bookTitle,
      bookAuthor: values.bookAuthor,
      date: "",
      startTime: "",
      endTime: "",
      locationLabel: "",
      meetingUrl: "",
      meetingPasscode: "",
    }, resolvedDefaults)
    : null;

  return {
    title: values.title,
    bookTitle: values.bookTitle,
    bookAuthor: values.bookAuthor,
    bookLink: values.bookLink,
    bookImageUrl: values.bookImageUrl,
    date: applied?.date ?? values.date,
    time: applied?.startTime ?? values.startTime,
    endTime: applied?.endTime ?? session?.endTime ?? "",
    locationLabel: applied?.locationLabel ?? values.locationLabel,
    meetingUrl: applied?.meetingUrl ?? values.meetingUrl,
    meetingPasscode: applied?.meetingPasscode ?? values.meetingPasscode,
    questionDeadlineOffsetDays: init.scheduleDefaults?.automatic.questionDeadlineOffsetDays ?? 1,
    recordVisibility: initialRecordVisibility(session),
    summary: initialPublicationSummary(session),
    hasPublicationRecord: Boolean(session?.publication),
    sessionState: session?.state ?? "DRAFT",
    displaySessionSnapshot: null,
    attendanceStatuses: initialAttendanceStatuses(session?.attendees),
    feedbackDocument: initialFeedbackDocumentStatus(session),
  };
}
