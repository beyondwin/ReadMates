import { useCallback } from "react";
import { useLocation, useParams } from "react-router-dom";
import { fetchMemberArchiveSession } from "@/features/archive/api/archive-api";
import {
  archiveSessionsReturnTarget,
  readReadmatesReturnTarget,
} from "@/features/archive/model/archive-model";
import MemberSessionDetailPage, {
  MemberSessionDetailUnavailablePage,
} from "@/features/archive/ui/member-session-detail-page";
import { useArchiveRouteData } from "@/features/archive/route/archive-route-data-state";
import { ArchiveRouteState } from "@/features/archive/route/archive-route-state";

export function MemberSessionDetailRoute() {
  const sessionId = useParams().sessionId;
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, archiveSessionsReturnTarget);
  const state = useArchiveRouteData(
    useCallback(() => (sessionId ? fetchMemberArchiveSession(sessionId) : Promise.resolve(null)), [sessionId]),
  );

  return (
    <ArchiveRouteState state={state} loadingLabel="지난 세션 기록을 불러오는 중">
      {(session) =>
        session ? (
          <MemberSessionDetailPage session={session} returnTarget={returnTarget} />
        ) : (
          <MemberSessionDetailUnavailablePage returnTarget={returnTarget} />
        )
      }
    </ArchiveRouteState>
  );
}
