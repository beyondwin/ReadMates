import type { AttendanceStatus, RsvpStatus } from "@/shared/model/readmates-types";

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_PREFIX_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?=[T\s])/;

function isValidDateOnly(year: string, month: string, day: string) {
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(year) &&
    date.getMonth() + 1 === Number(month) &&
    date.getDate() === Number(day)
  );
}

function dateOnlyLabel(year: string, month: string, day: string) {
  return `${year}.${month}.${day}`;
}

export function displayText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function formatDateLabel(value: string | null | undefined, fallback = "미정") {
  const text = displayText(value, fallback);
  if (text === fallback) {
    return fallback;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    return text;
  }

  const [, year, month, day] = match;
  const date = new Date(`${year}-${month}-${day}T00:00:00`);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== Number(year) ||
    date.getMonth() + 1 !== Number(month) ||
    date.getDate() !== Number(day)
  ) {
    return text;
  }

  return `${year}.${month}.${day}`;
}

export function formatDateOnlyLabel(value: string | null | undefined, fallback = "미정") {
  const text = displayText(value, fallback);
  if (text === fallback) {
    return fallback;
  }

  const dateOnlyMatch = DATE_ONLY_PATTERN.exec(text);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return isValidDateOnly(year, month, day) ? dateOnlyLabel(year, month, day) : fallback;
  }

  const datePrefixMatch = DATE_PREFIX_PATTERN.exec(text);
  if (!datePrefixMatch || Number.isNaN(new Date(text).getTime())) {
    return fallback;
  }

  const [, year, month, day] = datePrefixMatch;
  return isValidDateOnly(year, month, day) ? dateOnlyLabel(year, month, day) : fallback;
}

export function formatMobileTodayLabel(now = new Date()) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(now);
}

export function formatDeadlineLabel(value: string | null | undefined, fallback = "마감 미정") {
  const text = displayText(value, fallback);
  if (text === fallback) {
    return fallback;
  }

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return text;
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${month}.${day} ${hours}:${minutes}`;
}

export function formatSessionKicker(sessionNumber: number, sessionDate: string, now = new Date()) {
  const number = String(sessionNumber).padStart(2, "0");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sessionDate);

  if (!match) {
    return `No.${number}`;
  }

  const [, year, month, day] = match;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  const dday = diffDays === 0 ? "D-day" : diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;

  return `No.${number} · ${dday}`;
}

export function rsvpLabel(status: RsvpStatus | string | null | undefined) {
  if (status === "GOING") {
    return "참석";
  }

  if (status === "MAYBE") {
    return "미정";
  }

  if (status === "DECLINED") {
    return "불참";
  }

  return "미응답";
}

export function attendanceLabel(status: AttendanceStatus | string | null | undefined) {
  if (status === "ATTENDED") {
    return "출석";
  }

  if (status === "ABSENT") {
    return "불참";
  }

  return "출석 확인 전";
}

export function nonNegativeCount(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

export function hostAlertStateLabel(value: number | null | undefined, hasCurrentSession: boolean) {
  if (nonNegativeCount(value) > 0) {
    return "할 일";
  }

  return hasCurrentSession ? "완료" : "대기 없음";
}
