import { readmatesFetch } from "@/shared/api/client";
import type {
  CreatePlatformAdminDomainRequest,
  CreateSupportAccessGrantRequest,
  PlatformAdminDomainResponse,
  PlatformAdminSummaryResponse,
  SupportAccessGrantResponse,
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

export function createSupportAccessGrant(request: CreateSupportAccessGrantRequest) {
  return readmatesFetch<SupportAccessGrantResponse>(
    "/api/admin/support-access-grants",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  );
}

export function revokeSupportAccessGrant(grantId: string) {
  return readmatesFetch<void>(
    `/api/admin/support-access-grants/${encodeURIComponent(grantId)}`,
    { method: "DELETE" },
    { clubSlug: undefined },
  );
}

export function listSupportAccessGrantsByClub(clubId: string) {
  return readmatesFetch<SupportAccessGrantResponse[]>(
    `/api/admin/support-access-grants?clubId=${encodeURIComponent(clubId)}`,
    undefined,
    { clubSlug: undefined },
  );
}
