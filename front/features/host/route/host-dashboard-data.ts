import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostCurrentSessionQuery,
  hostMeetingSessionListQuery,
} from "@/features/host/queries/host-session-queries";
import { hostSessionRecordLedgerQuery } from "@/features/host/queries/host-session-record-queries";
import type {
  CurrentSessionResponse,
  HostSessionListPage,
  HostSessionRecordLedgerPage,
} from "@/features/host/api/host-contracts";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

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

export function hostDashboardLoaderFactory(client: QueryClient) {
  return async (args?: LoaderFunctionArgs): Promise<HostDashboardRouteData> => {
    await requireHostLoaderAuth(args);
    const context = { clubSlug: clubSlugFromLoaderArgs(args) };

    const [current, hostSessions, attentionResult] = await Promise.all([
      client.fetchQuery(hostCurrentSessionQuery(context)),
      client.fetchQuery(hostMeetingSessionListQuery({ limit: DEFAULT_HOST_SESSION_LIST_LIMIT }, context)),
      client.fetchQuery(hostSessionRecordLedgerQuery({
        needsAttention: true,
        page: { limit: HOST_HOME_ATTENTION_LIMIT },
      }, context)).then(
        (page) => ({ page, error: false as const }),
        () => ({ page: null, error: true as const }),
      ),
    ]);

    return {
      current,
      hostSessions,
      recordAttention: attentionResult.page,
      attentionError: attentionResult.error,
    };
  };
}
