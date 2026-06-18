import { useMemo } from "react";
import { useLoaderData, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getSessionClosingBoardView } from "@/features/host/model/session-closing-model";
import { hostSessionClosingStatusQuery } from "@/features/host/queries/host-session-queries";
import { SessionClosingBoard } from "@/features/host/ui/session-closing-board";
import type { HostSessionClosingRouteData } from "./host-session-closing-data";

export function HostSessionClosingRoute() {
  const loaderData = useLoaderData() as HostSessionClosingRouteData;
  const { clubSlug, sessionId: routeSessionId } = useParams<{ clubSlug: string; sessionId: string }>();
  const sessionId = routeSessionId ?? loaderData.sessionId;
  const context = useMemo(() => ({ clubSlug }), [clubSlug]);
  const query = useQuery(hostSessionClosingStatusQuery(sessionId, context));

  if (!query.data) {
    return null;
  }

  return <SessionClosingBoard view={getSessionClosingBoardView(query.data)} />;
}
