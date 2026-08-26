import { useQuery, type QueryObserverResult } from "@tanstack/react-query";
import type { HostSessionHistoryPage, HostSessionRecordEditor } from "@/features/host/api/host-session-record-contracts";
import type { ManualNotificationDispatchListResponse } from "@/features/host/api/host-contracts";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import {
  mapHostMeetingRecordFacts,
  type HostMeetingRecordReadiness,
} from "@/features/host/model/host-meeting-record-readiness";
import type { HostMeetingTask } from "@/features/host/model/host-session-workspace-model";
import type { PanelLoadState } from "@/features/host/model/host-meeting-panel-state";
import {
  hostSessionRecordEditorQuery,
  hostSessionRecordHistoryQuery,
} from "./host-session-record-queries";
import { hostSessionManualDispatchesQuery } from "./host-session-queries";

const MEETING_PANEL_PAGE_LIMIT = 30;
const MEETING_DISPATCH_PAGE_LIMIT = 20;

export type { PanelLoadState } from "@/features/host/model/host-meeting-panel-state";

type PanelQuerySnapshot<T> = {
  data: T | undefined;
  dataUpdatedAt: number;
  isError: boolean;
  isFetching: boolean;
  isPending: boolean;
  refetch: () => Promise<QueryObserverResult<T, Error>> | Promise<unknown>;
};

export function panelLoadStateFromQuery<T>(
  query: PanelQuerySnapshot<T>,
  isKnownEmpty: (data: T) => boolean = () => false,
): PanelLoadState<T> {
  const retry = () => {
    void query.refetch();
  };
  if (query.data !== undefined) {
    if (query.isFetching || query.isError) {
      return {
        kind: "stale-cached",
        data: query.data,
        observedAt: new Date(query.dataUpdatedAt).toISOString(),
        retry,
      };
    }
    return isKnownEmpty(query.data)
      ? { kind: "known-empty", data: query.data }
      : { kind: "ready", data: query.data };
  }
  if (query.isError) {
    return { kind: "unavailable", retry };
  }
  return { kind: "loading" };
}

export function observeHostMeetingRecordReadiness(
  query: PanelQuerySnapshot<HostSessionRecordEditor>,
  required: boolean,
): HostMeetingRecordReadiness {
  if (!required) return { status: "not-required" };
  const observedAt = query.dataUpdatedAt > 0
    ? new Date(query.dataUpdatedAt).toISOString()
    : null;
  if (query.data !== undefined) {
    const facts = mapHostMeetingRecordFacts(query.data);
    if (query.isFetching || query.isError) {
      return {
        status: "stale",
        facts,
        observedAt: observedAt ?? new Date(query.dataUpdatedAt).toISOString(),
        retryable: true,
      };
    }
    return {
      status: "ready",
      facts,
      observedAt: observedAt ?? new Date(query.dataUpdatedAt).toISOString(),
    };
  }
  if (query.isError) {
    return { status: "unavailable", observedAt, retryable: true };
  }
  return { status: "pending" };
}

export function useHostMeetingPanelQueries({
  task,
  sessionId,
  context,
  recordPrerequisite,
}: {
  task: HostMeetingTask;
  sessionId: string;
  context: ExplicitReadmatesApiContext;
  recordPrerequisite: boolean;
}) {
  const recordQuery = useQuery({
    ...hostSessionRecordEditorQuery(sessionId, context),
    enabled: recordPrerequisite || task === "records" || task === "history",
  });
  const historyQuery = useQuery({
    ...hostSessionRecordHistoryQuery(sessionId, { limit: MEETING_PANEL_PAGE_LIMIT }, context),
    enabled: task === "history",
  });
  const notificationsQuery = useQuery({
    ...hostSessionManualDispatchesQuery({
      sessionId,
      page: { limit: MEETING_DISPATCH_PAGE_LIMIT },
    }, context),
    enabled: task === "notifications",
  });

  return {
    record: panelLoadStateFromQuery(recordQuery),
    historyAuthority: panelLoadStateFromQuery(recordQuery),
    history: panelLoadStateFromQuery(
      historyQuery,
      (page: HostSessionHistoryPage) => page.items.length === 0,
    ),
    notifications: panelLoadStateFromQuery(
      notificationsQuery,
      (page: ManualNotificationDispatchListResponse) => page.items.length === 0,
    ),
    recordReadiness: observeHostMeetingRecordReadiness(recordQuery, recordPrerequisite),
  };
}
