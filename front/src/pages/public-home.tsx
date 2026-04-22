import { useCallback } from "react";
import PublicHome from "@/features/public/components/public-home";
import type { PublicClubResponse } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export default function PublicHomePage() {
  const state = useReadmatesData(
    useCallback(() => readmatesFetch<PublicClubResponse>("/api/public/club"), []),
  );

  return <ReadmatesPageState state={state}>{(data) => <PublicHome data={data} />}</ReadmatesPageState>;
}
