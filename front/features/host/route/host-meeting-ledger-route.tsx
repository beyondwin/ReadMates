import { useMemo, type ReactNode } from "react";
import { useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { HostSessionDetailResponse, HostSessionListItem } from "@/features/host/api/host-contracts";
import {
  meetingListItemsFromHostSources,
  type MeetingListItemSource,
} from "@/features/host/model/host-meeting-ledger-model";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostSessionDetailQuery,
  hostSessionListQuery,
} from "@/features/host/queries/host-session-queries";
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import {
  HostMeetingLedger,
  type HostMeetingLedgerLinkComponent,
} from "@/features/host/ui/meeting-ledger/host-meeting-ledger";
import type { ReadmatesApiContext } from "@/shared/api/client";

function contextFromClubSlug(clubSlug?: string): ReadmatesApiContext {
  return { clubSlug };
}

function isMeetingState(state: string): state is MeetingListItemSource["state"] {
  return state === "DRAFT" || state === "OPEN" || state === "CLOSED" || state === "PUBLISHED";
}

function toMeetingSource(
  item: Pick<HostSessionListItem, "sessionId" | "state" | "date" | "recordStatus">,
): MeetingListItemSource | null {
  if (!isMeetingState(item.state)) {
    return null;
  }
  return {
    sessionId: item.sessionId,
    state: item.state,
    date: item.date,
    recordStatus: item.recordStatus,
  };
}

function detailToMeetingSource(detail: HostSessionDetailResponse): MeetingListItemSource | null {
  if (!isMeetingState(detail.state)) {
    return null;
  }
  return {
    sessionId: detail.sessionId,
    state: detail.state,
    date: detail.date,
  };
}

export function HostMeetingLedgerRoute({
  children,
  LinkComponent,
}: {
  children: ReactNode;
  LinkComponent?: HostMeetingLedgerLinkComponent;
}) {
  const { clubSlug, sessionId } = useParams<{ clubSlug: string; sessionId: string }>();
  const context = useMemo(() => contextFromClubSlug(clubSlug), [clubSlug]);
  const sessionsQuery = useQuery(hostSessionListQuery({ limit: DEFAULT_HOST_SESSION_LIST_LIMIT }, context));
  const recordAttentionQuery = useQuery(hostSessionRecordLedgerQuery({
    needsAttention: true,
    page: { limit: 3 },
  }, context));
  const detailQuery = useQuery({
    ...hostSessionDetailQuery(sessionId ?? "", context),
    enabled: Boolean(sessionId),
  });

  const items = useMemo(() => {
    const sessions = (sessionsQuery.data?.items ?? [])
      .map(toMeetingSource)
      .filter((item): item is MeetingListItemSource => item !== null);
    const detailSource = detailQuery.data ? detailToMeetingSource(detailQuery.data) : null;
    if (detailSource && !sessions.some((item) => item.sessionId === detailSource.sessionId)) {
      sessions.push(detailSource);
    }

    return meetingListItemsFromHostSources(
      sessions,
      (recordAttentionQuery.data?.items ?? [])
        .map(toMeetingSource)
        .filter((item): item is MeetingListItemSource => item !== null),
    );
  }, [detailQuery.data, recordAttentionQuery.data, sessionsQuery.data]);

  return (
    <HostMeetingLedger
      items={items}
      sessionId={sessionId}
      LinkComponent={LinkComponent}
    >
      {children}
    </HostMeetingLedger>
  );
}
