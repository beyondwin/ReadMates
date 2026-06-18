export type MemberNotificationLinkView = {
  href: string;
  primaryActionLabel: "Open" | "View record" | "View feedback" | "Next reading";
  reflectionLabel: "Past session reflection" | null;
};

export function getMemberNotificationLinkView(deepLinkPath: string): MemberNotificationLinkView {
  if (!deepLinkPath.startsWith("/") || deepLinkPath.startsWith("//")) {
    return fallback();
  }

  if (deepLinkPath.startsWith("/app/")) {
    return { href: deepLinkPath, primaryActionLabel: "Open", reflectionLabel: null };
  }

  if (deepLinkPath.startsWith("/sessions/")) {
    return {
      href: `/app${deepLinkPath}`,
      primaryActionLabel: "View record",
      reflectionLabel: "Past session reflection",
    };
  }

  if (deepLinkPath.startsWith("/feedback-documents")) {
    return {
      href: "/app/archive?view=report",
      primaryActionLabel: "View feedback",
      reflectionLabel: "Past session reflection",
    };
  }

  if (deepLinkPath.startsWith("/notes")) {
    return { href: `/app${deepLinkPath}`, primaryActionLabel: "Next reading", reflectionLabel: null };
  }

  return { href: deepLinkPath, primaryActionLabel: "Open", reflectionLabel: null };
}

function fallback(): MemberNotificationLinkView {
  return { href: "/app/notifications", primaryActionLabel: "Open", reflectionLabel: null };
}
