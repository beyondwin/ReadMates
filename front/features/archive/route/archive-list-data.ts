import { loadArchiveListRouteData, type ArchiveListRouteData } from "@/features/archive/api/archive-api";
import { loadArchiveMemberAuth } from "@/features/archive/route/archive-loader-auth";

export async function archiveListLoader(): Promise<ArchiveListRouteData> {
  const access = await loadArchiveMemberAuth();

  if (!access.allowed) {
    return { sessions: [], questions: [], reviews: [], reports: [] };
  }

  return loadArchiveListRouteData();
}
