import type { HostSessionHistoryItem } from "@/features/host/model/host-session-editor-view-model";

export type SessionHistoryPanelItem = HostSessionHistoryItem & {
  id: string;
  createdAt: string;
  actorMembershipId: string;
  attendanceTransitions: Array<{ membershipId: string; from: string; to: string }>;
  restoredFromRevisionId: string | null;
  notificationEventId: string | null;
};

export function appendUniqueSessionHistory(
  current: SessionHistoryPanelItem[],
  next: SessionHistoryPanelItem[],
) {
  const existingIds = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !existingIds.has(item.id))];
}
