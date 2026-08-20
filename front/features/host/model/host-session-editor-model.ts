import { compatibilityExposureLabel } from "./session-exposure-model";

export type HostSessionAttendanceStatus = "UNKNOWN" | "ATTENDED" | "ABSENT";
export type HostSessionState = "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
export type SessionRecordVisibility = "HOST_ONLY" | "MEMBER" | "PUBLIC";

export type HostSessionFormValues = {
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink: string;
  bookImageUrl: string;
  locationLabel: string;
  meetingUrl: string;
  meetingPasscode: string;
  date: string;
  startTime: string;
  endTime?: string;
  questionDeadlineOffsetDays?: number;
};

export type HostSessionRequest = {
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink?: string | null;
  bookImageUrl?: string | null;
  locationLabel?: string | null;
  meetingUrl?: string | null;
  meetingPasscode?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  questionDeadlineAt?: string | null;
};

export type HostSessionEditorSession = {
  sessionId?: string;
  sessionNumber?: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink: string | null;
  bookImageUrl: string | null;
  locationLabel: string;
  meetingUrl: string | null;
  meetingPasscode: string | null;
  date: string;
  startTime: string;
  questionDeadlineAt: string;
  publication: {
    publicSummary: string;
    visibility: SessionRecordVisibility;
  } | null;
  state: HostSessionState;
  attendees: Array<{
    membershipId: string;
    attendanceStatus: HostSessionAttendanceStatus;
  }>;
  feedbackDocument: HostSessionFeedbackDocumentStatus;
};

export type HostSessionFeedbackDocumentStatus = {
  uploaded: boolean;
  fileName: string | null;
  uploadedAt: string | null;
};

export type HostSessionDestructiveActionAvailability = {
  canDelete: boolean;
  guidance: string;
};

const koreaOffsetHours = 9;

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function defaultSessionDateFrom(currentDate: Date) {
  return `${currentDate.getFullYear()}-${padDatePart(currentDate.getMonth() + 1)}-${padDatePart(currentDate.getDate())}`;
}

export function defaultHostSessionFormValues(now = new Date()): HostSessionFormValues {
  return {
    title: "",
    bookTitle: "",
    bookAuthor: "",
    bookLink: "",
    bookImageUrl: "",
    locationLabel: "온라인",
    meetingUrl: "",
    meetingPasscode: "",
    date: defaultSessionDateFrom(now),
    startTime: "20:00",
  };
}

export function hydrateHostSessionFormValues(
  session: HostSessionEditorSession | null | undefined,
  now = new Date(),
): HostSessionFormValues {
  if (!session) {
    return defaultHostSessionFormValues(now);
  }

  return {
    title: session.title,
    bookTitle: session.bookTitle,
    bookAuthor: session.bookAuthor,
    bookLink: session.bookLink ?? "",
    bookImageUrl: session.bookImageUrl ?? "",
    locationLabel: session.locationLabel,
    meetingUrl: session.meetingUrl ?? "",
    meetingPasscode: session.meetingPasscode ?? "",
    date: session.date,
    startTime: session.startTime,
  };
}

function datePartsFromSessionDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function questionDeadlineDateFromSessionDate(value: string, offsetDays = 1) {
  const dateParts = datePartsFromSessionDate(value);
  if (!dateParts) {
    return null;
  }

  return new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day - offsetDays, 23, 59));
}

export function questionDeadlineIsoFromSessionDate(value: string, offsetDays = 1) {
  const deadlineDate = questionDeadlineDateFromSessionDate(value, offsetDays);
  if (!deadlineDate) {
    return null;
  }

  const year = deadlineDate.getUTCFullYear();
  const month = padDatePart(deadlineDate.getUTCMonth() + 1);
  const day = padDatePart(deadlineDate.getUTCDate());

  return `${year}-${month}-${day}T23:59:00+09:00`;
}

function questionDeadlineLabelFromDate(deadlineDate: Date) {
  const month = padDatePart(deadlineDate.getUTCMonth() + 1);
  const day = padDatePart(deadlineDate.getUTCDate());
  const hour = padDatePart(deadlineDate.getUTCHours());
  const minute = padDatePart(deadlineDate.getUTCMinutes());

  return `${month}-${day} ${hour}:${minute}까지`;
}

export function questionDeadlineLabelFromSessionDate(value: string, offsetDays = 1) {
  const deadlineDate = questionDeadlineDateFromSessionDate(value, offsetDays);
  return deadlineDate ? questionDeadlineLabelFromDate(deadlineDate) : "";
}

export function questionDeadlineLabelFromIso(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return questionDeadlineLabelFromDate(new Date(parsed.getTime() + koreaOffsetHours * 60 * 60 * 1000));
}

export function questionDeadlineLabelForForm(
  session: Pick<HostSessionEditorSession, "date" | "questionDeadlineAt"> | null | undefined,
  date: string,
  offsetDays = 1,
) {
  return session?.questionDeadlineAt && date === session.date
    ? questionDeadlineLabelFromIso(session.questionDeadlineAt)
    : questionDeadlineLabelFromSessionDate(date, offsetDays);
}

function normalizeOptionalField(value: string) {
  return value.trim();
}

export function buildHostSessionRequest(
  values: HostSessionFormValues,
  existingSession?: Pick<HostSessionEditorSession, "date">,
): HostSessionRequest {
  const questionDeadlineAt = questionDeadlineIsoFromSessionDate(
    values.date,
    values.questionDeadlineOffsetDays ?? 1,
  );

  return {
    title: values.title,
    bookTitle: values.bookTitle,
    bookAuthor: values.bookAuthor,
    bookLink: normalizeOptionalField(values.bookLink),
    bookImageUrl: normalizeOptionalField(values.bookImageUrl),
    locationLabel: values.locationLabel,
    meetingUrl: normalizeOptionalField(values.meetingUrl),
    meetingPasscode: normalizeOptionalField(values.meetingPasscode),
    date: values.date,
    startTime: values.startTime,
    ...(!existingSession && values.endTime ? { endTime: values.endTime } : {}),
    ...((!existingSession || values.date !== existingSession.date) && questionDeadlineAt ? { questionDeadlineAt } : {}),
  };
}

export function initialRecordVisibility(
  session?: Pick<HostSessionEditorSession, "publication"> | null,
): SessionRecordVisibility {
  return session?.publication?.visibility ?? "HOST_ONLY";
}

export function initialPublicationSummary(session?: Pick<HostSessionEditorSession, "publication"> | null) {
  return session?.publication?.publicSummary ?? "";
}

export function recordVisibilityLabel(visibility: SessionRecordVisibility) {
  return compatibilityExposureLabel[visibility];
}

export function recordVisibilityDescription(visibility: SessionRecordVisibility) {
  if (visibility === "MEMBER") {
    return "새 버전으로 반영하면 멤버 앱 안에서만 볼 수 있습니다.";
  }

  if (visibility === "PUBLIC") {
    return "새 버전으로 반영하면 멤버 앱과 공개 기록 목록에 표시됩니다.";
  }

  return "호스트 편집 화면에서만 볼 수 있습니다.";
}

export function hostSessionStateLabel(state?: HostSessionState) {
  if (state === "OPEN") {
    return "열림";
  }

  if (state === "PUBLISHED") {
    return "공개됨";
  }

  if (state === "CLOSED") {
    return "닫힘";
  }

  if (state === "DRAFT") {
    return "예정";
  }

  return "저장 전";
}

export function initialAttendanceStatuses(
  attendees?: Array<{ membershipId: string; attendanceStatus: HostSessionAttendanceStatus }>,
): Record<string, HostSessionAttendanceStatus> {
  return Object.fromEntries((attendees ?? []).map((attendee) => [attendee.membershipId, attendee.attendanceStatus]));
}

export function initialFeedbackDocumentStatus(
  session?: Pick<HostSessionEditorSession, "feedbackDocument"> | null,
): HostSessionFeedbackDocumentStatus {
  return session?.feedbackDocument ?? { uploaded: false, fileName: null, uploadedAt: null };
}

export function getDestructiveActionAvailability(
  session?: Pick<HostSessionEditorSession, "state"> | null,
): HostSessionDestructiveActionAvailability {
  const state = session?.state;
  const canDelete = state === "OPEN" || state === "DRAFT";

  return {
    canDelete,
    guidance: state === "DRAFT"
      ? "목록에서 지웁니다. 되돌릴 수 없습니다."
      : canDelete
        ? "세션과 관련 준비 기록이 모두 제거됩니다. 되돌릴 수 없습니다."
        : "닫히거나 공개된 세션은 삭제할 수 없습니다.",
  };
}
