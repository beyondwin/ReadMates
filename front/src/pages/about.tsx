import { useCallback } from "react";
import PublicClub from "@/features/public/components/public-club";
import type { PublicClubResponse } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState } from "./readmates-page";

export default function AboutPage() {
  const state = useReadmatesData(
    useCallback(() => readmatesFetch<PublicClubResponse>("/api/public/club"), []),
  );

  return (
    <ReadmatesPageState state={state} loadingLabel="클럽 소개를 불러오는 중">
      {(data) => <PublicClub data={data} />}
    </ReadmatesPageState>
  );
}
