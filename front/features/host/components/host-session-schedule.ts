import type { HostSessionDetailResponse, HostSessionRequest } from "@/shared/api/readmates";
import { defaultSessionDateFrom } from "./session-date-defaults";

export { defaultSessionDateFrom };

const koreaOffsetHours = 9;

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

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
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

export function buildHostSessionRequest(
  values: HostSessionFormValues,
  existingSession?: Pick<HostSessionDetailResponse, "date">,
): HostSessionRequest {
  const questionDeadlineAt = questionDeadlineIsoFromSessionDate(values.date);

  return {
    title: values.title,
    bookTitle: values.bookTitle,
    bookAuthor: values.bookAuthor,
    bookLink: values.bookLink,
    bookImageUrl: values.bookImageUrl,
    locationLabel: values.locationLabel,
    meetingUrl: values.meetingUrl,
    meetingPasscode: values.meetingPasscode,
    date: values.date,
    startTime: values.startTime,
    ...((!existingSession || values.date !== existingSession.date) && questionDeadlineAt ? { questionDeadlineAt } : {}),
  };
}
