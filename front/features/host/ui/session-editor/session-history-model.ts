import type { HostSessionHistoryItem } from "@/features/host/model/host-session-editor-view-model";

export type SessionHistoryPanelItem = {
  id: string;
  type: HostSessionHistoryItem["type"];
  createdAt: string;
  actorMembershipId: string;
  changedFields: string[];
  attendanceTransitions: Array<{ membershipId: string; from: string; to: string }>;
  revisionId: string | null;
  revisionVersion: number | null;
  revisionSource: HostSessionHistoryItem["revisionSource"];
  restoredFromRevisionId: string | null;
  notificationEventId: string | null;
};

export function appendUniqueSessionHistory<T extends { id: string }>(
  current: T[],
  next: T[],
): T[] {
  const existingIds = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !existingIds.has(item.id))];
}
