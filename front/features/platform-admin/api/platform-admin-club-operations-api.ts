import { readmatesFetch } from "@/shared/api/client";
import type { AdminClubOperationsSnapshot } from "@/features/platform-admin/model/platform-admin-club-operations-model";

export function fetchAdminClubOperationsSnapshot(clubId: string) {
  return readmatesFetch<AdminClubOperationsSnapshot>(
    `/api/admin/clubs/${encodeURIComponent(clubId)}/operations`,
    undefined,
    { clubSlug: undefined },
  );
}
