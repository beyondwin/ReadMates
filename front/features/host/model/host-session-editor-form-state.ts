import type { HostSessionDetailResponse } from "@/features/host/model/host-view-types";
import type { AttendanceStatus } from "@/shared/model/readmates-types";
import {
  mergeUntouchedScheduleDefaults,
  type HostScheduleFormValues,
  type HostSessionScheduleDefaults,
  type ScheduleField,
  type TouchedScheduleFields,
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

  touchedScheduleFields: TouchedScheduleFields;
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
    }
  | {
      type: "ADOPT_PREVIOUS_ONLINE_MEETING";
      meetingUrl: string;
      meetingPasscode: string;
    };

const basicFieldToScheduleField = {
  date: "date",
  time: "startTime",
  locationLabel: "locationLabel",
} as const satisfies Partial<Record<BasicSessionField, ScheduleField>>;

function hostScheduleFormValuesFromState(state: HostSessionEditorFormState): HostScheduleFormValues {
  return {
    bookTitle: state.bookTitle,
    bookAuthor: state.bookAuthor,
    date: state.date,
    startTime: state.time,
    endTime: state.endTime,
    locationLabel: state.locationLabel,
    meetingUrl: state.meetingUrl,
    meetingPasscode: state.meetingPasscode,
    accessScope: "HOST_ONLY",
  };
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function hostSessionEditorReducer(
  state: HostSessionEditorFormState,
  action: HostSessionEditorAction,
): HostSessionEditorFormState {
  switch (action.type) {
    case "SET_FIELD": {
      const scheduleField = action.key === "date" || action.key === "time" || action.key === "locationLabel"
        ? basicFieldToScheduleField[action.key]
        : undefined;
      if (!scheduleField) {
        return { ...state, [action.key]: action.value };
      }
      const touchedScheduleFields = new Set(state.touchedScheduleFields);
      touchedScheduleFields.add(scheduleField);
      return { ...state, [action.key]: action.value, touchedScheduleFields };
    }

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
        touchedScheduleFields: new Set(),
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
      const applied = mergeUntouchedScheduleDefaults(
        hostScheduleFormValuesFromState(state),
        action.defaults,
        state.touchedScheduleFields,
      );
      return {
        ...state,
        date: applied.date,
        time: applied.startTime,
        endTime: applied.endTime,
        locationLabel: applied.locationLabel,
        questionDeadlineOffsetDays: action.defaults.automatic.questionDeadlineOffsetDays,
      };
    }

    case "ADOPT_PREVIOUS_ONLINE_MEETING":
      return {
        ...state,
        meetingUrl: action.meetingUrl,
        meetingPasscode: action.meetingPasscode,
      };
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
    ? mergeUntouchedScheduleDefaults({
      bookTitle: values.bookTitle,
      bookAuthor: values.bookAuthor,
      date: "",
      startTime: "",
      endTime: "",
      locationLabel: "",
      meetingUrl: "",
      meetingPasscode: "",
      accessScope: "HOST_ONLY",
    }, resolvedDefaults, new Set())
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
    touchedScheduleFields: new Set(),
  };
}
