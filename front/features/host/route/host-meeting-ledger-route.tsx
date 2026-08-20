import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { HostSessionDetailResponse, HostSessionListItem } from "@/features/host/api/host-contracts";
import {
  meetingListItemsFromHostSources,
  type MeetingListItemSource,
} from "@/features/host/model/host-meeting-ledger-model";
import {
  BUILTIN_SCHEDULE_DEFAULTS,
  resolvedScheduleDefaults,
} from "@/features/host/model/host-schedule-defaults-model";
import { buildHostSessionRequest } from "@/features/host/model/host-session-editor-model";
import type { SessionAccessScope } from "@/features/host/model/session-exposure-model";
import {
  upcomingBookCreateFormValues,
  type UpcomingBookCreateInput,
  type UpcomingBookListItem,
} from "@/features/host/model/upcoming-book-list-model";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostSessionDetailQuery,
  hostSessionListQuery,
  hostSessionScheduleDefaultsQuery,
  invalidateHostSessionManualDispatches,
  useCreateHostSessionMutation,
  useSaveHostSessionAccessScopeMutation,
} from "@/features/host/queries/host-session-queries";
import {
  HostNotificationComposerController,
  type HostNotificationComposerRequest,
} from "@/features/host/route/host-notification-composer-controller";
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

function toUpcomingBookItem(
  item: Pick<HostSessionListItem, "sessionId" | "state" | "date" | "bookTitle" | "accessScope">,
): UpcomingBookListItem | null {
  if (!isMeetingState(item.state)) {
    return null;
  }
  return {
    sessionId: item.sessionId,
    state: item.state,
    date: item.date,
    bookTitle: item.bookTitle,
    accessScope: item.accessScope ?? "HOST_ONLY",
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
  const queryClient = useQueryClient();
  const { mutateAsync: createSession, isPending: creatingSession } = useCreateHostSessionMutation(context);
  const { mutateAsync: saveAccessScope, isPending: savingAccessScope } = useSaveHostSessionAccessScopeMutation(context);
  const [composerRequest, setComposerRequest] = useState<HostNotificationComposerRequest | null>(null);
  const scheduleDefaultsQuery = useQuery(hostSessionScheduleDefaultsQuery(context));
  const scheduleDefaults = scheduleDefaultsQuery.isError
    ? BUILTIN_SCHEDULE_DEFAULTS
    : resolvedScheduleDefaults(scheduleDefaultsQuery.data);

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

  const upcomingItems = useMemo(
    () =>
      (sessionsQuery.data?.items ?? [])
        .map(toUpcomingBookItem)
        .filter((item): item is UpcomingBookListItem => item !== null),
    [sessionsQuery.data],
  );

  const openFirstPublicationComposer = useCallback((
    composer: Pick<HostNotificationComposerRequest, "sessionId" | "eventType" | "contentRevision"> | null | undefined,
  ) => {
    if (!composer) {
      return;
    }
    setComposerRequest({
      sessionId: composer.sessionId,
      eventType: composer.eventType,
      contentRevision: composer.contentRevision,
      origin: "FIRST_PUBLICATION",
    });
  }, []);

  const handleSaveUpcomingAccessScope = useCallback(async (input: {
    sessionId: string;
    accessScope: SessionAccessScope;
  }) => {
    const result = await saveAccessScope({
      sessionId: input.sessionId,
      request: { accessScope: input.accessScope },
    });
    openFirstPublicationComposer(result.composer);
  }, [openFirstPublicationComposer, saveAccessScope]);

  const handleCreateUpcomingSession = useCallback(async (input: UpcomingBookCreateInput) => {
    const response = await createSession(buildHostSessionRequest(upcomingBookCreateFormValues(input)));
    if (!response.ok) {
      throw new Error("create-upcoming-failed");
    }
    if (input.accessScope === "GUEST_READABLE") {
      const created = await response.json() as { sessionId: string };
      const result = await saveAccessScope({
        sessionId: created.sessionId,
        request: { accessScope: "GUEST_READABLE" },
      });
      openFirstPublicationComposer(result.composer);
    }
  }, [createSession, openFirstPublicationComposer, saveAccessScope]);

  return (
    <>
      <HostMeetingLedger
        items={items}
        sessionId={sessionId}
        LinkComponent={LinkComponent}
        upcomingItems={upcomingItems}
        onSaveUpcomingAccessScope={handleSaveUpcomingAccessScope}
        onCreateUpcomingSession={handleCreateUpcomingSession}
        upcomingPending={creatingSession || savingAccessScope}
        scheduleDefaults={scheduleDefaults}
      >
        {children}
      </HostMeetingLedger>
      <HostNotificationComposerController
        request={composerRequest}
        context={context}
        onClose={() => setComposerRequest(null)}
        onConfirmed={() => {
          void invalidateHostSessionManualDispatches(queryClient, context);
        }}
      />
    </>
  );
}
