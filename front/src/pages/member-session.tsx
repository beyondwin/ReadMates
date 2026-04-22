import { useCallback } from "react";
import { useLocation, useParams } from "react-router-dom";
import MemberSessionDetailPage, {
  MemberSessionDetailUnavailablePage,
} from "@/features/archive/components/member-session-detail-page";
import type { MemberArchiveSessionDetailResponse } from "@/shared/api/readmates";
import { readmatesFetchResponse } from "@/shared/api/readmates";
import { archiveSessionsReturnTarget, readReadmatesReturnTarget } from "@/src/app/route-continuity";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

async function loadMemberSession(sessionId: string) {
  const response = await readmatesFetchResponse(`/api/archive/sessions/${encodeURIComponent(sessionId)}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`ReadMates member session fetch failed: ${sessionId} (${response.status})`);
  }

  return response.json() as Promise<MemberArchiveSessionDetailResponse>;
}

export default function MemberSessionDetailRoutePage() {
  const sessionId = useParams().sessionId;
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, archiveSessionsReturnTarget);
  const state = useReadmatesData(
    useCallback(() => (sessionId ? loadMemberSession(sessionId) : Promise.resolve(null)), [sessionId]),
  );

  return (
    <ReadmatesPageState state={state}>
      {(session) =>
        session ? (
          <MemberSessionDetailPage session={session} returnTarget={returnTarget} />
        ) : (
          <MemberSessionDetailUnavailablePage returnTarget={returnTarget} />
        )
      }
    </ReadmatesPageState>
  );
}
