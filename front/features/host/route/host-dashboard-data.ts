import type { QueryClient } from "@tanstack/react-query";
import { redirect, type LoaderFunctionArgs } from "react-router";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostCurrentSessionQuery,
  hostSessionListQuery,
} from "@/features/host/queries/host-session-queries";
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import type {
  CurrentSessionResponse,
  HostSessionListPage,
  HostSessionRecordLedgerPage,
} from "@/features/host/api/host-contracts";
import {
  hostMeetingHref,
  meetingListItemsFromHostSources,
  resolveActiveMeeting,
} from "@/features/host/model/host-meeting-ledger-model";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { scopedAppLinkTarget } from "@/shared/routing/scoped-app-link-target";

export const HOST_HOME_ATTENTION_LIMIT = 1;

export type HostDashboardRouteData = {
  current: CurrentSessionResponse;
  hostSessions: HostSessionListPage;
  recordAttention: HostSessionRecordLedgerPage | null;
  attentionError: boolean;
};

export function preserveLocationSuffix(requestUrl: string, destination: string): string {
  const source = new URL(requestUrl);
  return `${destination}${source.search}${source.hash}`;
}

function canonicalHomeMeetingItems(
  hostSessions: HostSessionListPage,
  current: CurrentSessionResponse,
) {
  return meetingListItemsFromHostSources(
    hostSessions.items,
    undefined,
    current.currentSession,
  ).filter((item) => item.state === "OPEN" || item.state === "DRAFT");
}

export function hostDashboardLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostDashboardRouteData | Response> => {
    await requireHostLoaderAuth(args);
    const context = { clubSlug: clubSlugFromLoaderArgs(args) };

    const [current, hostSessions, attentionResult] = await Promise.all([
      client.fetchQuery(hostCurrentSessionQuery(context)),
      client.fetchQuery(hostSessionListQuery({ limit: DEFAULT_HOST_SESSION_LIST_LIMIT }, context)),
      client.fetchQuery(hostSessionRecordLedgerQuery({
        needsAttention: true,
        page: { limit: HOST_HOME_ATTENTION_LIMIT },
      }, context)).then(
        (page) => ({ page, error: false as const }),
        () => ({ page: null, error: true as const }),
      ),
    ]);

    const active = resolveActiveMeeting(canonicalHomeMeetingItems(hostSessions, current));
    if (active) {
      const requestUrl = args?.request?.url ?? "https://readmates.local/app/host";
      const pathname = args?.request ? new URL(args.request.url).pathname : "/app/host";
      const destination = scopedAppLinkTarget(pathname, hostMeetingHref(active.sessionId));
      return redirect(preserveLocationSuffix(requestUrl, destination));
    }

    return {
      current,
      hostSessions,
      recordAttention: attentionResult.page,
      attentionError: attentionResult.error,
    };
  };
}
