export type NotificationEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED";

export interface MemberNotification {
  id: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  deepLinkPath: string;
  readAt: string | null;
  createdAt: string;
}

export interface MemberNotificationListResponse {
  unreadCount: number;
  items: MemberNotification[];
}
