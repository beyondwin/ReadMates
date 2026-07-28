import type { MembershipStatus } from "@/shared/auth/auth-contracts";

export type NotificationPreferenceEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED";

export type NotificationPreferences = {
  emailEnabled: boolean;
  events: Record<NotificationPreferenceEventType, boolean>;
};

export type NotificationPreferencesLoadState =
  | { status: "ready"; preferences: NotificationPreferences }
  | { status: "unavailable" }
  | { status: "error" };

export const notificationEventLabels: Record<
  NotificationPreferenceEventType,
  { label: string; sub: string }
> = {
  NEXT_BOOK_PUBLISHED: { label: "다음 책 공개", sub: "예정 세션이 멤버에게 열릴 때" },
  SESSION_REMINDER_DUE: { label: "모임 전날 리마인더", sub: "모임 하루 전 준비 알림" },
  FEEDBACK_DOCUMENT_PUBLISHED: { label: "피드백 문서 등록", sub: "참석 회차의 피드백 문서가 올라올 때" },
  REVIEW_PUBLISHED: { label: "다른 멤버의 서평 공개", sub: "발행된 회차에 새 공개 서평이 올라올 때" },
};

export const notificationEventOrder: NotificationPreferenceEventType[] = [
  "NEXT_BOOK_PUBLISHED",
  "SESSION_REMINDER_DUE",
  "FEEDBACK_DOCUMENT_PUBLISHED",
  "REVIEW_PUBLISHED",
];

export const defaultNotificationPreferences: NotificationPreferences = {
  emailEnabled: true,
  events: {
    NEXT_BOOK_PUBLISHED: true,
    SESSION_REMINDER_DUE: true,
    FEEDBACK_DOCUMENT_PUBLISHED: true,
    REVIEW_PUBLISHED: false,
  },
};

export function notificationPreferenceAvailability(
  status: MembershipStatus | null,
): "ready" | "unavailable" {
  return status === "ACTIVE" || status === "SUSPENDED" ? "ready" : "unavailable";
}
