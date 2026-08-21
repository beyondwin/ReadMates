import { defaultHostSessionFormValues, type HostSessionFormValues } from "./host-session-editor-model";
import { BUILTIN_SCHEDULE_DEFAULTS } from "./host-schedule-defaults-model";
import { sessionAccessScopeCopy, type SessionAccessScope } from "./session-exposure-model";

export type UpcomingBookListItem = {
  sessionId: string;
  state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
  date: string;
  bookTitle: string;
  accessScope: SessionAccessScope;
};

export type UpcomingBookCreateInput = {
  bookTitle: string;
  bookAuthor: string;
  date: string;
  startTime: string;
  endTime: string;
  locationLabel: string;
  meetingUrl: string;
  meetingPasscode: string;
  accessScope: SessionAccessScope;
  questionDeadlineOffsetDays: number;
};

export const DEFAULT_UPCOMING_ACCESS_SCOPE: SessionAccessScope = "HOST_ONLY";

export function draftsByDate(
  items: readonly UpcomingBookListItem[],
): UpcomingBookListItem[] {
  return items
    .filter((item) => item.state === "DRAFT")
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date) || left.sessionId.localeCompare(right.sessionId));
}

export function memberVisibilityLabel(accessScope: SessionAccessScope): string {
  return sessionAccessScopeCopy[accessScope].label;
}

export function upcomingBookCreateFormValues(input: UpcomingBookCreateInput): HostSessionFormValues {
  const fallback = defaultHostSessionFormValues();
  const startTime = input.startTime.trim() || fallback.startTime;
  const locationLabel = input.locationLabel.trim() || fallback.locationLabel;
  const endTime = input.endTime.trim() || BUILTIN_SCHEDULE_DEFAULTS.automatic.endTime;
  return {
    ...fallback,
    title: input.bookTitle,
    bookTitle: input.bookTitle,
    bookAuthor: input.bookAuthor,
    date: input.date || fallback.date,
    startTime,
    endTime,
    locationLabel,
    meetingUrl: input.meetingUrl,
    meetingPasscode: input.meetingPasscode,
    questionDeadlineOffsetDays: input.questionDeadlineOffsetDays,
  };
}
