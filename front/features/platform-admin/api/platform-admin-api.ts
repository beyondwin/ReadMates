import { readmatesFetch } from "@/shared/api/client";
import type { PlatformAdminSummaryResponse } from "@/features/platform-admin/api/platform-admin-contracts";

export function fetchPlatformAdminSummary() {
  return readmatesFetch<PlatformAdminSummaryResponse>("/api/admin/summary", undefined, { clubSlug: undefined });
}
