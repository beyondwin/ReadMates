import { useLoaderData, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { publicSessionQuery } from "@/features/public/queries/public-queries";
import type { PublicSessionRouteData } from "@/features/public/route/public-route-data";
import {
  publicRecordsReturnTarget,
  readPublicReadmatesReturnTarget,
} from "@/features/public/ui/public-route-continuity";
import { PublicMissingSessionPage } from "@/features/public/ui/public-missing-session-page";
import PublicSession from "@/features/public/ui/public-session";

export function PublicSessionRoute() {
  const data = useLoaderData() as PublicSessionRouteData;
  const sessionQuery = useQuery({
    ...publicSessionQuery(data.clubSlug, data.sessionId ?? ""),
    enabled: Boolean(data.sessionId),
  });
  const session = sessionQuery.data ?? null;
  const location = useLocation();
  const fallbackReturnTarget = {
    ...publicRecordsReturnTarget,
    href: `${data.publicBasePath}${publicRecordsReturnTarget.href}`,
  };
  const returnTarget = readPublicReadmatesReturnTarget(location.state, fallbackReturnTarget);

  return session ? (
    <PublicSession session={session} returnTarget={returnTarget} />
  ) : (
    <PublicMissingSessionPage returnTarget={returnTarget} />
  );
}
