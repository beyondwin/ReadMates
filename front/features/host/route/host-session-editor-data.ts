import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { previewHostSessionImport } from "@/features/host/api/host-api";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import {
  DEFAULT_HOST_SESSION_LIST_LIMIT,
  hostSessionDetailQuery,
  hostMeetingSessionListQuery,
  hostSessionManualDispatchesQuery,
  hostSessionTrashDetailQuery,
  isHostSessionNotFoundError,
  isHostSessionTrashExpiredError,
} from "@/features/host/queries/host-session-queries";
import {
  hostSessionRecordEditorQuery,
  hostSessionRecordHistoryQuery,
  hostSessionRecordLedgerQuery,
} from "@/features/host/queries/host-session-record-queries";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { isReadmatesApiError } from "@/shared/api/errors";
import { readLastSafeWorkspaceTarget } from "@/src/app/workspace-route-continuity";
import { resolveUnavailableDetailTarget } from "@/src/app/workspace-route-model";
import { replace } from "react-router";
import type { ExplicitReadmatesApiContext } from "@/shared/api/client";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";

const EDITOR_MANUAL_DISPATCH_PAGE_LIMIT = 20;
const EDITOR_HISTORY_PAGE_LIMIT = 30;

export type HostSessionEditorRouteData = {
  sessionId: string;
  mode: "active" | "trash";
};

export function hostSessionEditorLoaderFactory(client: QueryClient) {
  return async (args: LoaderFunctionArgs): Promise<HostSessionEditorRouteData> => {
    const { params } = args;
    await requireHostLoaderAuth(args);
    const context = requireHostClubContext(clubSlugFromLoaderArgs(args));

    if (!params.sessionId) {
      throw new Error("Missing host session id");
    }

    try {
      await client.fetchQuery(hostSessionDetailQuery(params.sessionId, context));
    } catch (error) {
      if (isReadmatesApiError(error) && (error.status === 401 || error.status === 403)) {
        throw replace(resolveUnavailableDetailTarget({
          pathname: new URL(args.request.url).pathname,
          lastSafeTarget: readLastSafeWorkspaceTarget("host"),
        }));
      }
      if (!isHostSessionNotFoundError(error)) {
        throw error;
      }
      try {
        await client.fetchQuery(hostSessionTrashDetailQuery(params.sessionId, context));
      } catch (trashError) {
        if (!isHostSessionNotFoundError(trashError) && !isHostSessionTrashExpiredError(trashError)) {
          throw trashError;
        }
        throw replace(resolveUnavailableDetailTarget({
          pathname: new URL(args.request.url).pathname,
          lastSafeTarget: readLastSafeWorkspaceTarget("host"),
        }));
      }
      return { sessionId: params.sessionId, mode: "trash" };
    }

    await Promise.all([
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
      client.fetchQuery(hostMeetingSessionListQuery(
        { limit: DEFAULT_HOST_SESSION_LIST_LIMIT },
        context,
      )).catch(() => null),
      client.fetchQuery(hostSessionRecordLedgerQuery({
        needsAttention: true,
        page: { limit: 3 },
      }, context)).catch(() => null),
    ]);

    return { sessionId: params.sessionId, mode: "active" };
  };
}

export function hostSessionEditorPreviewActions(
  context: ExplicitReadmatesApiContext,
): Pick<HostSessionEditorActions, "previewSessionImport"> {
  return {
    previewSessionImport: (sessionId, request) => previewHostSessionImport(sessionId, request, context),
  };
}
