import type { QueryClient } from "@tanstack/react-query";
import type { LoaderFunctionArgs } from "react-router";
import { hostSessionClosingStatusQuery } from "@/features/host/queries/host-session-queries";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";
import { requireHostLoaderAuth } from "./host-loader-auth";
import { requireHostClubContext } from "@/features/host/model/host-authority-loss";

export type HostSessionClosingRouteData = {
  sessionId: string;
};

export function hostSessionClosingLoaderFactory(client: QueryClient) {
  return async (args: LoaderFunctionArgs): Promise<HostSessionClosingRouteData> => {
    await requireHostLoaderAuth(args);
    const sessionId = args.params.sessionId;
    if (!sessionId) {
      throw new Error("Missing host session id");
    }
    const context = requireHostClubContext(clubSlugFromLoaderArgs(args));
    await client.fetchQuery(hostSessionClosingStatusQuery(sessionId, context));
    return { sessionId };
  };
}
