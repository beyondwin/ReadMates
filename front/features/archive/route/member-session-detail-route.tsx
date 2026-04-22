import { useLoaderData, useLocation } from "react-router-dom";
import {
  archiveSessionsReturnTarget,
  readReadmatesReturnTarget,
} from "@/features/archive/model/archive-model";
import type { MemberSessionDetailRouteData } from "@/features/archive/route/member-session-detail-data";
import MemberSessionDetailPage, {
  MemberSessionDetailUnavailablePage,
} from "@/features/archive/ui/member-session-detail-page";

export function MemberSessionDetailRoute() {
  const session = useLoaderData() as MemberSessionDetailRouteData;
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, archiveSessionsReturnTarget);

  return session ? (
    <MemberSessionDetailPage session={session} returnTarget={returnTarget} />
  ) : (
    <MemberSessionDetailUnavailablePage returnTarget={returnTarget} />
  );
}
