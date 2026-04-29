import { readmatesFetch } from "@/shared/api/client";
import type {
  CreatePlatformAdminDomainRequest,
  PlatformAdminDomainResponse,
  PlatformAdminSummaryResponse,
} from "@/features/platform-admin/api/platform-admin-contracts";

export function fetchPlatformAdminSummary() {
  return readmatesFetch<PlatformAdminSummaryResponse>("/api/admin/summary", undefined, { clubSlug: undefined });
}

export function createPlatformAdminDomain(clubId: string, request: CreatePlatformAdminDomainRequest) {
  return readmatesFetch<PlatformAdminDomainResponse>(
    `/api/admin/clubs/${encodeURIComponent(clubId)}/domains`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  );
}

export function checkPlatformAdminDomainProvisioning(domainId: string) {
  return readmatesFetch<PlatformAdminDomainResponse>(
    `/api/admin/domains/${encodeURIComponent(domainId)}/check`,
    { method: "POST" },
    { clubSlug: undefined },
  );
}
