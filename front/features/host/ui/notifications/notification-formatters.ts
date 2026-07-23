export type NotificationEventOutboxStatus = "PENDING" | "PUBLISHING" | "PUBLISHED" | "FAILED" | "DEAD";
export type NotificationDeliveryStatus = "PENDING" | "SENDING" | "SENT" | "FAILED" | "DEAD" | "SKIPPED";
export type NotificationChannel = "EMAIL" | "IN_APP";
export type NotificationDispatchSource = "AUTOMATIC" | "MANUAL" | "HOST_CONFIRMED";
export type HostNotificationEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED"
  | "SESSION_RECORD_UPDATED";

export type HostNotificationSummary = {
  pending: number;
  failed: number;
  dead: number;
  sentLast24h: number;
};

export type HostNotificationEventItem = {
  id: string;
  eventType: HostNotificationEventType;
  status: NotificationEventOutboxStatus;
  attemptCount: number;
  source?: NotificationDispatchSource;
  manualDispatch?: {
    manualDispatchId: string;
    requestedChannels: "IN_APP" | "EMAIL" | "BOTH";
    audience: "ALL_ACTIVE_MEMBERS" | "SESSION_PARTICIPANTS" | "CONFIRMED_ATTENDEES";
    resend: boolean;
    requestedBy: string;
    targetCount: number;
    expectedInAppCount: number;
    expectedEmailCount: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

export type HostNotificationDeliveryItem = {
  id: string;
  eventId: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  recipientEmail: string | null;
  attemptCount: number;
  updatedAt: string;
};

export type NotificationTestMailAuditItem = {
  id: string;
  recipientEmail: string;
  status: "SENT" | "FAILED";
  lastError: string | null;
  createdAt: string;
};

export type SendNotificationTestMailRequest = {
  recipientEmail: string;
};

export type NotificationLedgerTab = "events" | "deliveries";

export const notificationLedgerTabs: Array<{ key: NotificationLedgerTab; label: string }> = [
  { key: "events", label: "이벤트" },
  { key: "deliveries", label: "배송" },
];

export const eventLabels: Record<HostNotificationEventType, string> = {
  NEXT_BOOK_PUBLISHED: "다음 책 공개",
  SESSION_REMINDER_DUE: "세션 리마인더",
  FEEDBACK_DOCUMENT_PUBLISHED: "피드백 문서 공개",
  REVIEW_PUBLISHED: "리뷰 공개",
  SESSION_RECORD_UPDATED: "세션 기록 수정",
};

export const notificationSourceLabels: Record<NotificationDispatchSource, string> = {
  AUTOMATIC: "자동",
  MANUAL: "수동",
  HOST_CONFIRMED: "호스트 확인",
};

export const eventOutboxStatusLabels: Record<NotificationEventOutboxStatus, string> = {
  PENDING: "Kafka 발행 대기",
  PUBLISHING: "Kafka 발행 중",
  PUBLISHED: "Kafka 발행됨",
  FAILED: "Kafka 발행 실패",
  DEAD: "Kafka 발행 중단",
};

export const deliveryStatusLabels: Record<NotificationDeliveryStatus, string> = {
  PENDING: "배송 대기",
  SENDING: "배송 중",
  SENT: "배송됨",
  FAILED: "배송 실패",
  DEAD: "배송 중단",
  SKIPPED: "건너뜀",
};

export function maskRecipient(email: string | null) {
  if (!email) {
    return "수신자 없음";
  }

  if (email.includes("***")) {
    return email;
  }

  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) {
    return "숨김";
  }

  return `${localPart[0]}***@${domain}`;
}

export function shortId(id: string) {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export function eventOutboxStatusBadgeClass(status: NotificationEventOutboxStatus) {
  if (status === "PUBLISHED") {
    return "badge badge-ok badge-dot";
  }

  if (status === "FAILED" || status === "DEAD") {
    return "badge badge-warn badge-dot";
  }

  if (status === "PENDING" || status === "PUBLISHING") {
    return "badge badge-accent badge-dot";
  }

  return "badge";
}

export function deliveryStatusBadgeClass(status: NotificationDeliveryStatus) {
  if (status === "SENT" || status === "SKIPPED") {
    return "badge badge-ok badge-dot";
  }

  if (status === "FAILED" || status === "DEAD") {
    return "badge badge-warn badge-dot";
  }

  if (status === "PENDING" || status === "SENDING") {
    return "badge badge-accent badge-dot";
  }

  return "badge";
}

export function summaryBadgeClass(tone: "accent" | "default" | "ok" | "warn") {
  if (tone === "accent") {
    return "badge badge-accent badge-dot";
  }

  if (tone === "ok") {
    return "badge badge-ok badge-dot";
  }

  if (tone === "warn") {
    return "badge badge-warn badge-dot";
  }

  return "badge";
}
