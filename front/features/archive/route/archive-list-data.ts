import { loadArchiveListRouteData, type ArchiveListRouteData } from "@/features/archive/api/archive-api";

export async function archiveListLoader(): Promise<ArchiveListRouteData> {
  return loadArchiveListRouteData();
}
