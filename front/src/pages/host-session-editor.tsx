import { useCallback } from "react";
import { useParams } from "react-router-dom";
import HostSessionEditor from "@/features/host/components/host-session-editor";
import type { HostSessionDetailResponse } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export function NewHostSessionPage() {
  return <HostSessionEditor />;
}

export default function EditHostSessionPage() {
  const sessionId = useParams().sessionId;
  const state = useReadmatesData(
    useCallback(() => {
      if (!sessionId) {
        throw new Error("Missing host session id");
      }
      return readmatesFetch<HostSessionDetailResponse>(`/api/host/sessions/${encodeURIComponent(sessionId)}`);
    }, [sessionId]),
  );

  return <ReadmatesPageState state={state}>{(session) => <HostSessionEditor session={session} />}</ReadmatesPageState>;
}
