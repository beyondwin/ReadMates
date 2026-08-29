import type { HostSessionDetailResponse } from "@/features/host/api/host-contracts";

export type ScheduleSeenState = "CURRENT" | "STALE" | "UNSEEN";

export type HostScheduleSeenRow = {
  membershipId: string;
  displayName: string;
  avatarKey: string;
  state: ScheduleSeenState;
  seenScheduleRevision: number | null;
  scheduleSeenAt: string | null;
};

export type HostScheduleSeenStateSummary = {
  state: ScheduleSeenState;
  label: string;
  count: number | null;
};

export type HostScheduleSeenSummary = {
  availability: HostSessionDetailResponse["scheduleSeenAvailability"];
  scheduleRevision: number;
  eligibleCount: number | null;
  states: HostScheduleSeenStateSummary[];
};

const stateOrder: Record<ScheduleSeenState, number> = {
  UNSEEN: 0,
  STALE: 1,
  CURRENT: 2,
};

const stateLabels: Record<ScheduleSeenState, string> = {
  CURRENT: "현재 일정 확인",
  STALE: "변경 전 확인",
  UNSEEN: "미열람",
};

export function hostScheduleSeenStateLabel(state: ScheduleSeenState): string {
  return stateLabels[state];
}

export function hostScheduleSeenRows(detail: HostSessionDetailResponse): HostScheduleSeenRow[] {
  return detail.attendees
    .filter((attendee) => attendee.participationStatus !== "REMOVED")
    .map((attendee) => ({
      membershipId: attendee.membershipId,
      displayName: attendee.displayName,
      avatarKey: attendee.avatarKey,
      state: attendee.scheduleSeenState,
      seenScheduleRevision: attendee.seenScheduleRevision,
      scheduleSeenAt: attendee.scheduleSeenAt,
    }))
    .sort((left, right) => stateOrder[left.state] - stateOrder[right.state]);
}

export function hostScheduleSeenSummary(detail: HostSessionDetailResponse): HostScheduleSeenSummary {
  return {
    availability: detail.scheduleSeenAvailability,
    scheduleRevision: detail.scheduleRevision,
    eligibleCount: detail.scheduleSeenSummary.eligibleCount,
    states: [
      {
        state: "UNSEEN",
        label: hostScheduleSeenStateLabel("UNSEEN"),
        count: detail.scheduleSeenSummary.unseenCount,
      },
      {
        state: "STALE",
        label: hostScheduleSeenStateLabel("STALE"),
        count: detail.scheduleSeenSummary.staleCount,
      },
      {
        state: "CURRENT",
        label: hostScheduleSeenStateLabel("CURRENT"),
        count: detail.scheduleSeenSummary.currentCount,
      },
    ],
  };
}
