import { useCallback } from "react";
import { Navigate } from "react-router-dom";
import type { PublicClubResponse } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export default function PublicRecordsPage() {
  const state = useReadmatesData(
    useCallback(() => readmatesFetch<Pick<PublicClubResponse, "recentSessions">>("/api/public/club"), []),
  );

  return (
    <ReadmatesPageState state={state}>
      {(data) => {
        const latestSession = data.recentSessions[0] ?? null;
        return <Navigate to={latestSession ? `/sessions/${latestSession.sessionId}` : "/about#public-records"} replace />;
      }}
    </ReadmatesPageState>
  );
}
