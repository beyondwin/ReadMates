import type { QueryClient } from "@tanstack/react-query";
import { replace, type LoaderFunctionArgs } from "react-router";
import { hostSessionDetailQuery, hostSessionTrashDetailQuery, isHostSessionNotFoundError, isHostSessionTrashExpiredError } from "@/features/host/queries/host-session-queries";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";
import { isReadmatesApiError } from "@/shared/api/errors";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";

export type HostMeetingWorkspaceRouteData = {
  sessionId: string;
  mode: "active" | "trash";
};

export function hostMeetingWorkspaceLoaderFactory(
  client: QueryClient,
  resolveUnavailableTarget: (pathname: string) => string = () => "/app/host/sessions",
) {
  return async (args: LoaderFunctionArgs): Promise<HostMeetingWorkspaceRouteData> => {
    await requireHostLoaderAuth(args);
    const context = requireHostClubContext(clubSlugFromLoaderArgs(args));
    const sessionId = args.params.sessionId;
    if (!sessionId) {
      throw new Error("Missing host session id");
    }

    try {
      await client.fetchQuery(hostSessionDetailQuery(sessionId, context));
      return { sessionId, mode: "active" };
    } catch (error) {
      if (isReadmatesApiError(error) && (error.status === 401 || error.status === 403)) {
        throw replace(resolveUnavailableTarget(new URL(args.request.url).pathname));
      }
      if (!isHostSessionNotFoundError(error)) {
        throw error;
      }
    }

    try {
      await client.fetchQuery(hostSessionTrashDetailQuery(sessionId, context));
      return { sessionId, mode: "trash" };
    } catch (error) {
      if (!isHostSessionNotFoundError(error) && !isHostSessionTrashExpiredError(error)) {
        throw error;
      }
      throw replace(resolveUnavailableTarget(new URL(args.request.url).pathname));
    }
  };
}
