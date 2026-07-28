import type { LoaderFunctionArgs } from "react-router-dom";
import { fetchMyJourney } from "@/features/archive/api/archive-api";
import type { MyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { emptyMyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";
import { clubSlugFromLoaderArgs } from "@/shared/auth/member-app-loader";

export async function myRecordsLoader(args?: LoaderFunctionArgs): Promise<MyJourneyPage> {
  const access = await loadArchiveMemberAuth(args);

  if (!access.allowed) {
    return emptyMyJourneyPage();
  }

  return fetchMyJourney(
    { clubSlug: clubSlugFromLoaderArgs(args) },
    { limit: 12 },
  );
}
