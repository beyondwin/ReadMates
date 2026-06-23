import type { ReadmatesReturnState } from "@/shared/routing/readmates-route-state";

export type NotificationEventType =
  | "NEXT_BOOK_PUBLISHED"
  | "SESSION_REMINDER_DUE"
  | "FEEDBACK_DOCUMENT_PUBLISHED"
  | "REVIEW_PUBLISHED";

export type MemberNotificationLinkView = {
  href: string;
  primaryActionLabel: "Open" | "View record" | "View feedback" | "Next reading";
  reflectionLabel: "Past session reflection" | null;
  state?: ReadmatesReturnState;
};

export type MemberNotificationLinkInput = {
  eventType: NotificationEventType;
  deepLinkPath: string;
};

const reflectionState: ReadmatesReturnState = {
  readmatesReturnTo: "/app/notifications",
  readmatesReturnLabel: "지난 모임 회고",
};

export function getMemberNotificationLinkView(input: MemberNotificationLinkInput): MemberNotificationLinkView {
  const path = normalizeSafePath(input.deepLinkPath);

  if (!path) {
    return fallback();
  }

  if (isFeedbackReflection(input.eventType, path)) {
    return {
      href: normalizeFeedbackPath(path),
      primaryActionLabel: "View feedback",
      reflectionLabel: "Past session reflection",
      state: reflectionState,
    };
  }

  if (isSessionReflection(input.eventType, path)) {
    return {
      href: normalizeSessionPath(path),
      primaryActionLabel: "View record",
      reflectionLabel: "Past session reflection",
      state: reflectionState,
    };
  }

  if (path.startsWith("/sessions/")) {
    return { href: normalizeSessionPath(path), primaryActionLabel: "Open", reflectionLabel: null };
  }

  if (path.startsWith("/notes")) {
    return { href: `/app${path}`, primaryActionLabel: "Next reading", reflectionLabel: null };
  }

  return { href: path, primaryActionLabel: "Open", reflectionLabel: null };
}

function normalizeSafePath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) {
    return null;
  }

  try {
    const url = new URL(value, "https://readmates.local");

    if (url.origin !== "https://readmates.local") {
      return null;
    }

    const path = `${url.pathname}${url.search}${url.hash}`;
    const isAllowed =
      path === "/app" ||
      path.startsWith("/app/") ||
      /^\/clubs\/[^/]+\/app(?:\/|$)/.test(path) ||
      path.startsWith("/sessions/") ||
      path.startsWith("/feedback-documents") ||
      path.startsWith("/notes");

    return isAllowed ? path : null;
  } catch {
    return null;
  }
}

function isFeedbackReflection(eventType: NotificationEventType, path: string) {
  return (
    eventType === "FEEDBACK_DOCUMENT_PUBLISHED" &&
    (path.startsWith("/app/feedback/") ||
      /^\/clubs\/[^/]+\/app\/feedback\//.test(path) ||
      path.startsWith("/feedback-documents"))
  );
}

function isSessionReflection(eventType: NotificationEventType, path: string) {
  return (
    eventType === "FEEDBACK_DOCUMENT_PUBLISHED" &&
    (path.startsWith("/sessions/") || path.startsWith("/app/sessions/") || /^\/clubs\/[^/]+\/app\/sessions\//.test(path))
  );
}

function normalizeSessionPath(path: string) {
  return path.startsWith("/sessions/") ? `/app${path}` : path;
}

function normalizeFeedbackPath(path: string) {
  if (path.startsWith("/feedback-documents")) {
    return "/app/archive?view=report";
  }

  return path;
}

function fallback(): MemberNotificationLinkView {
  return { href: "/app/notifications", primaryActionLabel: "Open", reflectionLabel: null };
}
