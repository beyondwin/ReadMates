export type MeetingPhase = "before" | "during" | "after";
export type MeetingListItem = {
  sessionId: string;
  state: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
  date: string;
  recordStatus?: "NOT_STARTED" | "INCOMPLETE" | "COMPLETE";
};

export function meetingPhaseFromState(state: MeetingListItem["state"]): MeetingPhase {
  if (state === "DRAFT") return "before";
  if (state === "OPEN") return "during";
  return "after";
}

export function resolveActiveMeeting(items: readonly MeetingListItem[]): { sessionId: string; phase: MeetingPhase } | null {
  const open = items.find((item) => item.state === "OPEN");
  if (open) return { sessionId: open.sessionId, phase: "during" };
  const drafts = items.filter((item) => item.state === "DRAFT").slice().sort((a, b) => a.date.localeCompare(b.date));
  const nearestDraft = drafts[0];
  if (nearestDraft) return { sessionId: nearestDraft.sessionId, phase: "before" };
  const closed = items
    .filter((item) => item.state === "CLOSED" || item.state === "PUBLISHED")
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date));
  const latestClosed = closed[0];
  if (latestClosed) return { sessionId: latestClosed.sessionId, phase: meetingPhaseFromState(latestClosed.state) };
  return null;
}

export function previousRecordAttentionHref(
  active: { sessionId: string; phase: MeetingPhase },
  items: readonly MeetingListItem[],
): string | null {
  if (active.phase !== "before") return null;
  const previous = items
    .filter((item) => item.state === "CLOSED" && item.recordStatus !== "COMPLETE")
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return previous ? `/app/host/sessions/${encodeURIComponent(previous.sessionId)}` : null;
}

export function hostMeetingHref(sessionId: string) {
  return `/app/host/sessions/${encodeURIComponent(sessionId)}`;
}
