import { useLoaderData, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { memberArchiveSessionQuery } from "@/features/archive/queries/archive-queries";
import {
  archiveSessionsReturnTarget,
  readReadmatesReturnTarget,
} from "@/features/archive/ui/archive-route-continuity";
import type { MemberSessionDetailRouteData } from "@/features/archive/route/member-session-detail-data";
import MemberSessionDetailPage, {
  MemberSessionDetailUnavailablePage,
} from "@/features/archive/ui/member-session-detail-page";

export function MemberSessionDetailRoute() {
  const { sessionId } = useLoaderData() as MemberSessionDetailRouteData;
  const { clubSlug } = useParams();
  const sessionQuery = useQuery({
    ...memberArchiveSessionQuery(sessionId ?? "", { clubSlug }),
    enabled: Boolean(sessionId),
  });
  const session = sessionQuery.data ?? null;
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, archiveSessionsReturnTarget);

  return session ? (
    <MemberSessionDetailPage session={session} returnTarget={returnTarget} />
  ) : (
    <MemberSessionDetailUnavailablePage returnTarget={returnTarget} />
  );
}
