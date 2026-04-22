export type HostSessionAttendanceStatus = "UNKNOWN" | "ATTENDED" | "ABSENT";
export type HostSessionState = "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
export type HostSessionPublicationMode = "internal" | "draft" | "public";
export type HostSessionPublicationAction = "draft" | "public";

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
    isPublic: boolean;
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

export type HostSessionPublicationRequest = {
  publicSummary: string;
  isPublic: boolean;
};

export type HostSessionDestructiveActionAvailability = {
  canDelete: boolean;
  guidance: string;
};

export const defaultBookLink = "https://product.kyobobook.co.kr/detail/S000001947832";
const koreaOffsetHours = 9;

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function thirdWednesdayOfMonth(year: number, monthIndex: number) {
  const firstDayOfMonth = new Date(year, monthIndex, 1);
  const daysUntilWednesday = (3 - firstDayOfMonth.getDay() + 7) % 7;

  return new Date(year, monthIndex, 1 + daysUntilWednesday + 14);
}

export function defaultSessionDateFrom(currentDate: Date) {
  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth();
  const day = currentDate.getDate();
  const thisMonthThirdWednesday = thirdWednesdayOfMonth(year, monthIndex);
  const defaultDate =
    day <= thisMonthThirdWednesday.getDate()
      ? thisMonthThirdWednesday
      : thirdWednesdayOfMonth(year, monthIndex + 1);

  return `${defaultDate.getFullYear()}-${padDatePart(defaultDate.getMonth() + 1)}-${padDatePart(defaultDate.getDate())}`;
}

export function defaultHostSessionFormValues(now = new Date()): HostSessionFormValues {
  return {
    title: "7회차 모임 · ",
    bookTitle: "",
    bookAuthor: "",
    bookLink: defaultBookLink,
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

function questionDeadlineDateFromSessionDate(value: string) {
  const dateParts = datePartsFromSessionDate(value);
  if (!dateParts) {
    return null;
  }

  return new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day - 1, 23, 59));
}

export function questionDeadlineIsoFromSessionDate(value: string) {
  const deadlineDate = questionDeadlineDateFromSessionDate(value);
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

  return `${month}-${day} ${hour}:${minute}까지 질문 제출`;
}

export function questionDeadlineLabelFromSessionDate(value: string) {
  const deadlineDate = questionDeadlineDateFromSessionDate(value);
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
) {
  return session?.questionDeadlineAt && date === session.date
    ? questionDeadlineLabelFromIso(session.questionDeadlineAt)
    : questionDeadlineLabelFromSessionDate(date);
}

function normalizeOptionalField(value: string) {
  return value.trim();
}

export function buildHostSessionRequest(
  values: HostSessionFormValues,
  existingSession?: Pick<HostSessionEditorSession, "date">,
): HostSessionRequest {
  const questionDeadlineAt = questionDeadlineIsoFromSessionDate(values.date);

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
    ...((!existingSession || values.date !== existingSession.date) && questionDeadlineAt ? { questionDeadlineAt } : {}),
  };
}

export function initialPublicationMode(
  session?: Pick<HostSessionEditorSession, "publication"> | null,
): HostSessionPublicationMode {
  if (!session?.publication) {
    return "internal";
  }

  return session.publication.isPublic ? "public" : "draft";
}

export function initialPublicationSummary(session?: Pick<HostSessionEditorSession, "publication"> | null) {
  return session?.publication?.publicSummary ?? "";
}

export function buildPublicationRequest(
  summary: string,
  action: HostSessionPublicationAction,
): HostSessionPublicationRequest | null {
  const publicSummary = summary.trim();
  if (!publicSummary) {
    return null;
  }

  return {
    publicSummary,
    isPublic: action === "public",
  };
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
  const canDelete = session?.state === "OPEN";

  return {
    canDelete,
    guidance: canDelete
      ? "세션과 관련 준비 기록이 모두 제거됩니다. 되돌릴 수 없습니다."
      : "닫히거나 공개된 세션은 삭제할 수 없습니다.",
  };
}
