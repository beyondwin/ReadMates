import type { SessionAccessScope } from "./session-exposure-model";

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
  return accessScope === "GUEST_READABLE" ? "멤버에게 보이기" : "호스트만";
}
