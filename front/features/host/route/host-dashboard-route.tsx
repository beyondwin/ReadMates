import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLoaderData, useNavigate, useParams } from "react-router";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import { readmatesReturnState as defaultReadmatesReturnState } from "@/shared/routing/readmates-route-state";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import type { HostSessionChangeReceipt } from "@/features/host/api/host-session-recovery-contracts";
import { hostClubOperationsQuery } from "@/features/host/queries/host-club-operations-queries";
import { hostNotificationHealthQuery } from "@/features/host/queries/host-notification-queries";
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import {
  hostSessionDetailQuery,
  useUpdateHostSessionAttendanceMutation,
} from "@/features/host/queries/host-session-queries";
import {
  hostSessionRestorePreviewQuery,
  useRestoreHostSessionChangeMutation,
} from "@/features/host/queries/host-session-recovery-queries";
import { meetingListItemsFromHostSources } from "@/features/host/model/host-meeting-ledger-model";
import { buildHostTodayView } from "@/features/host/model/host-today-model";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import {
  hostSessionChangeUndoDescription,
  hostSessionRestoreBlockedExplanation,
} from "@/features/host/model/host-session-editor-view-model";
import type { HostLinkComponent } from "@/features/host/ui/host-link-types";
import { HostTodayPage } from "@/features/host/ui/today/host-today-page";
import {
  MeetingResponseLedger,
  type MeetingAttendance,
} from "@/features/host/ui/meeting-workspace/meeting-response-ledger";
import { meetingResponseLedgerRowsFromAttendees } from "@/features/host/ui/meeting-workspace/meeting-response-ledger-rows";
import type { WorkspacePendingUndo } from "@/features/host/ui/session-workspace/workspace-undo-bar";
import { HOST_HOME_ATTENTION_LIMIT, type HostDashboardRouteData } from "./host-dashboard-data";
import "@/features/host/ui/today/host-today.css";
import "@/features/host/ui/host-editorial-ledger.css";

const HOST_BASE_PATH = "/app/host";
const NEW_MEETING_HREF = `${HOST_BASE_PATH}/sessions/new`;
const SESSIONS_HREF = `${HOST_BASE_PATH}/sessions`;

function todayIsoDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function nowClockLabel(now = new Date()) {
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function DefaultLink({
  to,
  children,
  state: _state,
  ...props
}: {
  to: string;
  className?: string;
  state?: unknown;
  children: ReactNode;
  "aria-label"?: string;
}) {
  void _state;
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

export function HostDashboardRoute({
  LinkComponent = DefaultLink,
  readmatesReturnState = defaultReadmatesReturnState,
}: {
  auth?: AuthMeResponse;
  LinkComponent?: HostLinkComponent;
  hostDashboardReturnTarget?: ReadmatesReturnTarget;
  readmatesReturnState?: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
  const loaderData = useLoaderData() as HostDashboardRouteData;
  const { clubSlug } = useParams<{ clubSlug: string }>();
  const context = useMemo(() => requireHostClubContext(clubSlug), [clubSlug]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const attentionQuery = useQuery({
    ...hostSessionRecordLedgerQuery({
      needsAttention: true,
      page: { limit: HOST_HOME_ATTENTION_LIMIT },
    }, context),
    retry: false,
  });
  const operationsQuery = useQuery({
    ...hostClubOperationsQuery(context),
    retry: false,
  });
  const notificationsQuery = useQuery({
    ...hostNotificationHealthQuery(context),
    retry: false,
  });

  const attentionPage = attentionQuery.data
    ?? (attentionQuery.isError ? null : loaderData.recordAttention);
  const attentionError = Boolean(
    (attentionQuery.isError && !attentionQuery.data)
    || (loaderData.attentionError && !attentionQuery.data),
  );
  const operationsError = operationsQuery.isError && !operationsQuery.data;
  const notificationsError = notificationsQuery.isError && !notificationsQuery.data;
  const queueWidgetError = attentionError || operationsError || notificationsError;

  const meetingItems = useMemo(
    () => meetingListItemsFromHostSources(loaderData.hostSessions.items),
    [loaderData.hostSessions.items],
  );

  const view = useMemo(() => {
    const now = new Date();
    return buildHostTodayView({
      today: todayIsoDate(now),
      now: nowClockLabel(now),
      basePath: HOST_BASE_PATH,
      meetings: meetingItems,
      attention: attentionError || !attentionPage
        ? null
        : {
            items: attentionPage.items,
            summary: attentionPage.summary,
          },
      operations: operationsError ? null : (operationsQuery.data ?? null),
      notifications: notificationsError ? null : (notificationsQuery.data ?? null),
    });
  }, [
    attentionError,
    attentionPage,
    meetingItems,
    notificationsError,
    notificationsQuery.data,
    operationsError,
    operationsQuery.data,
  ]);

  const meetingDaySessionId = view.nextMeeting?.isMeetingDay ? view.nextMeeting.sessionId : null;
  const meetingDayDetailQuery = useQuery({
    ...hostSessionDetailQuery(meetingDaySessionId ?? "", context),
    enabled: Boolean(meetingDaySessionId),
    retry: false,
  });
  const { mutateAsync: updateAttendance } = useUpdateHostSessionAttendanceMutation(context);
  const { mutateAsync: restoreChange } = useRestoreHostSessionChangeMutation(context);
  const [pendingAttendanceUndo, setPendingAttendanceUndo] = useState<{
    sessionId: string;
    receipt: HostSessionChangeReceipt;
    description: string;
    error: string | null;
  } | null>(null);

  const commitMeetingDayAttendance = useCallback(async (
    membershipIds: ReadonlyArray<string>,
    attendance: MeetingAttendance,
  ) => {
    if (!meetingDaySessionId || membershipIds.length === 0) return;
    const result = await updateAttendance({
      sessionId: meetingDaySessionId,
      attendance: membershipIds.map((membershipId) => ({
        membershipId,
        attendanceStatus: attendance,
      })),
    });
    const receipt = result.changeReceipt ?? null;
    if (receipt?.undoAvailable) {
      setPendingAttendanceUndo({
        sessionId: meetingDaySessionId,
        receipt,
        description: hostSessionChangeUndoDescription("ATTENDANCE"),
        error: null,
      });
      return;
    }
    setPendingAttendanceUndo(null);
  }, [meetingDaySessionId, updateAttendance]);

  const meetingDayPendingUndo: WorkspacePendingUndo | null = pendingAttendanceUndo
    && meetingDaySessionId
    && pendingAttendanceUndo.sessionId === meetingDaySessionId
    ? {
      description: pendingAttendanceUndo.description,
      error: pendingAttendanceUndo.error,
      onUndo: () => {
        const current = pendingAttendanceUndo;
        void (async () => {
          try {
            const preview = await queryClient.fetchQuery(
              hostSessionRestorePreviewQuery(current.sessionId, current.receipt.changeId, context),
            );
            if (!preview.canRestore) {
              setPendingAttendanceUndo({
                ...current,
                error: hostSessionRestoreBlockedExplanation(preview.blockedReason),
              });
              return;
            }
            await restoreChange({
              sessionId: current.sessionId,
              changeId: preview.changeId,
              request: { expectedCurrentHash: preview.expectedCurrentHash },
            });
            setPendingAttendanceUndo(null);
          } catch {
            setPendingAttendanceUndo({
              ...current,
              error: "되돌리지 못했습니다. 변경 내역에서 다시 시도해 주세요.",
            });
          }
        })();
      },
      onOpenHistory: () => {
        const detailHref = view.nextMeeting?.detailHref ?? SESSIONS_HREF;
        const url = new URL(detailHref, "https://readmates.invalid");
        url.searchParams.set("section", "history");
        void navigate(`${url.pathname}${url.search}`);
      },
      onDismiss: () => setPendingAttendanceUndo(null),
    }
    : null;

  const meetingDayAttendance = meetingDaySessionId && meetingDayDetailQuery.data ? (
    <MeetingResponseLedger
      presentation="meetingDay"
      rows={meetingResponseLedgerRowsFromAttendees(meetingDayDetailQuery.data.attendees)}
      onAttendanceChange={(membershipId, attendance) => {
        void commitMeetingDayAttendance([membershipId], attendance);
      }}
      onBulkAttendanceChange={(membershipIds, attendance) => {
        void commitMeetingDayAttendance(membershipIds, attendance);
      }}
      pendingUndo={meetingDayPendingUndo}
    />
  ) : null;

  const nextMeetingBlock = useMemo(() => {
    if (!view.nextMeeting) {
      return (
        <div className="rm-empty-state rm-meeting-ledger__empty rm-host-editorial-ledger__state rm-host-today__hero">
          <h2 className="h2 editorial rm-host-editorial-ledger__state-title">아직 열린 모임이 없습니다</h2>
          <LinkComponent to={NEW_MEETING_HREF} className="btn btn-primary rm-host-editorial-ledger__action">
            첫 모임 만들기
          </LinkComponent>
        </div>
      );
    }

    const activeItem = meetingItems.find((item) => item.sessionId === view.nextMeeting?.sessionId);
    return (
      <section className="rm-host-today__hero rm-host-editorial-ledger__next" aria-label="다음 모임">
        {activeItem ? (
          <p className="rm-host-editorial-ledger__identity">
            {formatDateOnlyLabel(activeItem.date)} · {view.nextMeeting.statusLabel}
          </p>
        ) : (
          <p className="rm-host-editorial-ledger__identity">{view.nextMeeting.statusLabel}</p>
        )}
        <div className="rm-host-editorial-ledger__actions">
          <LinkComponent
            to={view.nextMeeting.detailHref}
            state={readmatesReturnState({ href: HOST_BASE_PATH, label: "오늘로" })}
            className="btn btn-primary rm-host-editorial-ledger__action"
          >
            지금 다루는 모임 열기
          </LinkComponent>
          <LinkComponent to={SESSIONS_HREF} className="btn btn-quiet">
            모임 목록
          </LinkComponent>
        </div>
      </section>
    );
  }, [LinkComponent, meetingItems, readmatesReturnState, view.nextMeeting]);

  return (
    <HostTodayPage
      view={view}
      nextMeetingBlock={nextMeetingBlock}
      meetingDayAttendance={meetingDayAttendance}
      widgetErrors={queueWidgetError ? { queue: true } : undefined}
      onRetryQueue={() => {
        if (attentionError) {
          void attentionQuery.refetch();
        }
        if (operationsError) {
          void operationsQuery.refetch();
        }
        if (notificationsError) {
          void notificationsQuery.refetch();
        }
      }}
      LinkComponent={LinkComponent}
    />
  );
}
