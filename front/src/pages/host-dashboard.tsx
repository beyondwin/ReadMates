import { useCallback } from "react";
import HostDashboard from "@/features/host/components/host-dashboard";
import { useAuth } from "@/src/app/auth-state";
import type { CurrentSessionResponse, HostDashboardResponse } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export default function HostPage() {
  const authState = useAuth();
  const state = useReadmatesData(
    useCallback(async () => {
      const [current, data] = await Promise.all([
        readmatesFetch<CurrentSessionResponse>("/api/sessions/current"),
        readmatesFetch<HostDashboardResponse>("/api/host/dashboard"),
      ]);

      return { current, data };
    }, []),
  );

  return (
    <ReadmatesPageState state={state} loadingLabel="운영 원장을 불러오는 중">
      {(data) => (
        <HostDashboard
          auth={authState.status === "ready" ? authState.auth : undefined}
          current={data.current}
          data={data.data}
        />
      )}
    </ReadmatesPageState>
  );
}
