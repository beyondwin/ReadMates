import { useCallback } from "react";
import CurrentSession from "@/features/current-session/components/current-session";
import type { AuthMeResponse, CurrentSessionResponse } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export default function CurrentSessionPage() {
  const state = useReadmatesData(
    useCallback(async () => {
      const [auth, current] = await Promise.all([
        readmatesFetch<AuthMeResponse>("/api/auth/me"),
        readmatesFetch<CurrentSessionResponse>("/api/sessions/current"),
      ]);

      return { auth, current };
    }, []),
  );

  return (
    <ReadmatesPageState state={state} loadingLabel="세션을 불러오는 중">
      {(data) => <CurrentSession auth={data.auth} data={data.current} />}
    </ReadmatesPageState>
  );
}
