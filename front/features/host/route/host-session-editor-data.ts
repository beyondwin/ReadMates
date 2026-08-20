import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { previewHostSessionImport } from "@/features/host/api/host-api";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostSessionDetailQuery,
  hostSessionListQuery,
  hostSessionManualDispatchesQuery,
} from "@/features/host/queries/host-session-queries";
import {
  hostSessionRecordEditorQuery,
  hostSessionRecordHistoryQuery,
  hostSessionRecordLedgerQuery,
} from "@/features/host/queries/host-session-record-queries";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

const EDITOR_MANUAL_DISPATCH_PAGE_LIMIT = 20;
const EDITOR_HISTORY_PAGE_LIMIT = 30;

export type HostSessionEditorRouteData = {
  sessionId: string;
};

export function hostSessionEditorLoaderFactory(client: QueryClient) {
  return async (args: LoaderFunctionArgs): Promise<HostSessionEditorRouteData> => {
    const { params } = args;
    await requireHostLoaderAuth(args);
    const context = { clubSlug: clubSlugFromLoaderArgs(args) };

    if (!params.sessionId) {
      throw new Error("Missing host session id");
    }

    await Promise.all([
      client.fetchQuery(hostSessionDetailQuery(params.sessionId, context)),
      client.fetchQuery(hostSessionManualDispatchesQuery(
        { sessionId: params.sessionId, page: { limit: EDITOR_MANUAL_DISPATCH_PAGE_LIMIT } },
        context,
      )),
      client.fetchQuery(hostSessionRecordEditorQuery(params.sessionId, context)),
      client.fetchQuery(hostSessionRecordHistoryQuery(
        params.sessionId,
        { limit: EDITOR_HISTORY_PAGE_LIMIT },
        context,
      )),
      client.fetchQuery(hostSessionListQuery({ limit: DEFAULT_HOST_SESSION_LIST_LIMIT }, context)),
      client.fetchQuery(hostSessionRecordLedgerQuery({
        needsAttention: true,
        page: { limit: 3 },
      }, context)).catch(() => null),
    ]);

    return { sessionId: params.sessionId };
  };
}

export const hostSessionEditorPreviewActions = {
  previewSessionImport: previewHostSessionImport,
} satisfies Pick<HostSessionEditorActions, "previewSessionImport">;
