export type DraftSaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "stale";
export type SessionRecordEditorSection = "summary" | "highlights" | "reviews" | "feedback" | "general";
export type HostActionConfirmationDecision = "SEND" | "SKIP";

export type SessionRecordIssuesBySection = Record<SessionRecordEditorSection, string[]>;

export function canConfirmHostAction(input: {
  decision: HostActionConfirmationDecision | null;
  targetCount: number;
}) {
  if (!input.decision) {
    return false;
  }
  return input.decision !== "SEND" || input.targetCount > 0;
}

export function sessionRecordSectionForIssue(issue: string): SessionRecordEditorSection {
  const normalized = issue.toUpperCase();
  if (normalized.includes("SUMMARY") || normalized.includes("PUBLICATION")) {
    return "summary";
  }
  if (normalized.includes("HIGHLIGHT")) {
    return "highlights";
  }
  if (normalized.includes("REVIEW") || normalized.includes("ONE_LINE")) {
    return "reviews";
  }
  if (normalized.includes("FEEDBACK") || normalized.includes("DOCUMENT")) {
    return "feedback";
  }
  return "general";
}

export function groupSessionRecordIssues(issues: string[]): SessionRecordIssuesBySection {
  const grouped: SessionRecordIssuesBySection = {
    summary: [],
    highlights: [],
    reviews: [],
    feedback: [],
    general: [],
  };
  for (const issue of issues) {
    grouped[sessionRecordSectionForIssue(issue)].push(issue);
  }
  return grouped;
}

export function shouldBlockSessionRecordNavigation(state: DraftSaveState) {
  return state === "dirty" || state === "saving" || state === "error" || state === "stale";
}
