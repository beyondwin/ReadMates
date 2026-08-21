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

export function attentionItems<T>(page: { items: T[] }): T[] {
  return page.items;
}

export type MeetingListItemSource = {
  sessionId: string;
  state: MeetingListItem["state"];
  date: string;
  recordStatus?: MeetingListItem["recordStatus"];
};

export function meetingListItemsFromHostSources(
  sessions: readonly MeetingListItemSource[],
  attention?: readonly MeetingListItemSource[] | null,
  current?: { sessionId: string; date: string } | null,
): MeetingListItem[] {
  const items = new Map<string, MeetingListItem>();

  const add = (item: MeetingListItemSource) => {
    const existing = items.get(item.sessionId);
    items.set(item.sessionId, {
      sessionId: item.sessionId,
      state: existing?.state ?? item.state,
      date: existing?.date ?? item.date,
      recordStatus: existing?.recordStatus ?? item.recordStatus,
    });
  };

  for (const session of sessions) {
    add(session);
  }
  for (const item of attention ?? []) {
    add(item);
  }
  if (current && !items.has(current.sessionId)) {
    add({
      sessionId: current.sessionId,
      state: "OPEN",
      date: current.date,
    });
  }

  return [...items.values()];
}

export function resolveViewedMeeting(
  items: readonly MeetingListItem[],
  sessionId?: string | null,
): { sessionId: string; phase: MeetingPhase } | null {
  if (sessionId) {
    const pinned = items.find((item) => item.sessionId === sessionId);
    return pinned
      ? { sessionId: pinned.sessionId, phase: meetingPhaseFromState(pinned.state) }
      : null;
  }
  return resolveActiveMeeting(items);
}
