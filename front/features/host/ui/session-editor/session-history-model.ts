import type { SessionHistoryPanelItem } from "./session-history-panel";

export function appendUniqueSessionHistory(
  current: SessionHistoryPanelItem[],
  next: SessionHistoryPanelItem[],
) {
  const existingIds = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !existingIds.has(item.id))];
}
