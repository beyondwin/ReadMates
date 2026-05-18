import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router-dom";
import { previewHostSessionImport } from "@/features/host/api/host-api";
import type { HostSessionEditorActions } from "@/features/host/route/host-session-editor-actions";
import {
  hostSessionDetailQuery,
  hostSessionManualDispatchesQuery,
} from "@/features/host/queries/host-session-queries";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

const EDITOR_MANUAL_DISPATCH_PAGE_LIMIT = 20;

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
    ]);

    return { sessionId: params.sessionId };
  };
}

export const hostSessionEditorPreviewActions = {
  previewSessionImport: previewHostSessionImport,
} satisfies Pick<HostSessionEditorActions, "previewSessionImport">;
