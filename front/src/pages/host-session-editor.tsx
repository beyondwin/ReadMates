import { useCallback } from "react";
import { useLocation, useParams } from "react-router-dom";
import HostSessionEditor from "@/features/host/components/host-session-editor";
import type { HostSessionDetailResponse } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { hostDashboardReturnTarget, readReadmatesReturnTarget } from "@/src/app/route-continuity";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export function NewHostSessionPage() {
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);

  return <HostSessionEditor returnTarget={returnTarget} />;
}

export default function EditHostSessionPage() {
  const sessionId = useParams().sessionId;
  const location = useLocation();
  const returnTarget = readReadmatesReturnTarget(location.state, hostDashboardReturnTarget);
  const state = useReadmatesData(
    useCallback(() => {
      if (!sessionId) {
        throw new Error("Missing host session id");
      }
      return readmatesFetch<HostSessionDetailResponse>(`/api/host/sessions/${encodeURIComponent(sessionId)}`);
    }, [sessionId]),
  );

  return <ReadmatesPageState state={state}>{(session) => <HostSessionEditor session={session} returnTarget={returnTarget} />}</ReadmatesPageState>;
}
