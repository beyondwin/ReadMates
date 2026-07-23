import type { QueryClient } from "@tanstack/react-query";
import { fetchHostClubOperations, fetchHostNotificationSummary, submitHostMemberLifecycle } from "@/features/host/api/host-api";
import type { HostDashboardActions } from "@/features/host/route/host-dashboard-actions";
import { hostClubOperationsQuery } from "@/features/host/queries/host-club-operations-queries";
import { hostNotificationSummaryQuery } from "@/features/host/queries/host-notification-queries";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostCurrentSessionQuery,
  hostDashboardQuery,
  hostSessionListQuery,
} from "@/features/host/queries/host-session-queries";
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import { isReadmatesApiError } from "@/shared/api/errors";
import type {
  CurrentSessionResponse,
  HostClubOperationsResponse,
  HostDashboardResponse,
  HostNotificationSummary,
  HostSessionListPage,
} from "@/features/host/api/host-contracts";
import type { LoaderFunctionArgs } from "react-router-dom";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

const EMPTY_HOST_NOTIFICATION_SUMMARY: HostNotificationSummary = {
  pending: 0,
  failed: 0,
  dead: 0,
  sentLast24h: 0,
  latestFailures: [],
};

export type HostDashboardRouteData = {
  current: CurrentSessionResponse;
  data: HostDashboardResponse;
  hostSessions: HostSessionListPage;
  notifications: HostNotificationSummary;
  clubOperations: HostClubOperationsResponse | null;
  recordAttention?: HostSessionListPage;
};

export function hostDashboardLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostDashboardRouteData> => {
    await requireHostLoaderAuth(args);
    const context = { clubSlug: clubSlugFromLoaderArgs(args) };

    const [current, data, hostSessions, notifications, clubOperations, recordAttention] = await Promise.all([
      client.fetchQuery(hostCurrentSessionQuery(context)),
      client.fetchQuery(hostDashboardQuery(context)),
      client.fetchQuery(hostSessionListQuery({ limit: DEFAULT_HOST_SESSION_LIST_LIMIT }, context)),
      fetchHostNotificationSummary(context).catch(notificationSummaryFallback),
      fetchHostClubOperations(context).catch(() => null),
      client.fetchQuery(hostSessionRecordLedgerQuery({
        needsAttention: true,
        page: { limit: 3 },
      }, context)).catch(() => null),
    ]);

    client.setQueryData(hostNotificationSummaryQuery(context).queryKey, notifications);

    if (clubOperations) {
      client.setQueryData(hostClubOperationsQuery(context).queryKey, clubOperations);
    }

    return {
      current,
      data,
      hostSessions,
      notifications,
      clubOperations,
      ...(recordAttention ? { recordAttention } : {}),
    };
  };
}

function notificationSummaryFallback(error: unknown): HostNotificationSummary {
  if (
    isReadmatesApiError(error) &&
    [404, 502, 503, 504].includes(error.status)
  ) {
    return EMPTY_HOST_NOTIFICATION_SUMMARY;
  }

  throw error;
}

export const hostDashboardActions = {
  updateCurrentSessionParticipation: async (membershipId, action) => {
    const response = await submitHostMemberLifecycle(
      membershipId,
      action === "add" ? "/current-session/add" : "/current-session/remove",
    );

    if (!response.ok) {
      throw new Error("Current session member action failed");
    }
  },
} satisfies Pick<HostDashboardActions, "updateCurrentSessionParticipation">;
