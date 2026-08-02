import { useLoaderData, useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { memberArchiveSessionQuery } from "@/features/archive/queries/archive-queries";
import { memberSessionDetailReadView } from "@/features/archive/model/session-detail-read-view";
import {
  archiveSessionsReturnTarget,
  readReadmatesReturnTarget,
} from "@/features/archive/ui/archive-route-continuity";
import type { MemberSessionDetailRouteData } from "@/features/archive/route/member-session-detail-data";
import MemberSessionDetailPage, {
  MemberSessionDetailUnavailablePage,
} from "@/features/archive/ui/member-session-detail-page";
import { RECOVER_READ_SESSION_EXPIRY } from "@/shared/api/client";
import { readSurfaceCapabilitiesForAuth } from "@/shared/model/read-surface-capabilities";

export function MemberSessionDetailRoute() {
  const loaderData = useLoaderData() as MemberSessionDetailRouteData;
  const { sessionId } = loaderData;
  const { clubSlug } = useParams();
  const sessionQuery = useQuery({
    ...memberArchiveSessionQuery(
      sessionId ?? "",
      { clubSlug },
      RECOVER_READ_SESSION_EXPIRY,
    ),
    enabled: Boolean(sessionId),
  });
  const session = sessionQuery.data
    ? memberSessionDetailReadView(
        sessionQuery.data,
        readSurfaceCapabilitiesForAuth(loaderData.auth),
      )
    : null;
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, archiveSessionsReturnTarget);

  return session ? (
    <MemberSessionDetailPage session={session} returnTarget={returnTarget} />
  ) : (
    <MemberSessionDetailUnavailablePage returnTarget={returnTarget} />
  );
}
