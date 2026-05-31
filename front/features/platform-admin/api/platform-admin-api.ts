import { readmatesFetch } from "@/shared/api/client";
import type {
  CreatePlatformAdminDomainRequest,
  CreateSupportAccessGrantRequest,
  PlatformAdminAiOpsActionResponse,
  PlatformAdminAiOpsFilters,
  PlatformAdminAiOpsJobListResponse,
  PlatformAdminAiOpsSummaryResponse,
  PlatformAdminClub,
  PlatformAdminClubListResponse,
  PlatformAdminDomainResponse,
  PlatformAdminOnboardingPreviewResponse,
  PlatformAdminOnboardingRequest,
  PlatformAdminOnboardingResultResponse,
  PlatformAdminSummaryResponse,
  SupportAccessGrantResponse,
  UpdatePlatformAdminClubRequest,
} from "@/features/platform-admin/api/platform-admin-contracts";

export function fetchPlatformAdminSummary() {
  return readmatesFetch<PlatformAdminSummaryResponse>("/api/admin/summary", undefined, { clubSlug: undefined });
}

export function fetchPlatformAdminClubs() {
  return readmatesFetch<PlatformAdminClubListResponse>("/api/admin/clubs", undefined, { clubSlug: undefined });
}

export function updatePlatformAdminClub(clubId: string, request: UpdatePlatformAdminClubRequest) {
  return readmatesFetch<PlatformAdminClub>(
    `/api/admin/clubs/${encodeURIComponent(clubId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  );
}

export function previewPlatformAdminOnboarding(request: PlatformAdminOnboardingRequest) {
  return readmatesFetch<PlatformAdminOnboardingPreviewResponse>(
    "/api/admin/clubs/onboarding/preview",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  );
}

export function commitPlatformAdminOnboarding(request: PlatformAdminOnboardingRequest) {
  return readmatesFetch<PlatformAdminOnboardingResultResponse>(
    "/api/admin/clubs/onboarding",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  );
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

export function fetchPlatformAdminAiOpsSummary(window?: string) {
  const search = window ? `?window=${encodeURIComponent(window)}` : "";
  return readmatesFetch<PlatformAdminAiOpsSummaryResponse>(
    `/api/admin/ai-generation/summary${search}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchPlatformAdminAiOpsJobs(filters: PlatformAdminAiOpsFilters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  const search = params.toString();
  return readmatesFetch<PlatformAdminAiOpsJobListResponse>(
    `/api/admin/ai-generation/jobs${search ? `?${search}` : ""}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function forceCancelPlatformAdminAiJob(jobId: string) {
  return readmatesFetch<PlatformAdminAiOpsActionResponse>(
    `/api/admin/ai-generation/jobs/${encodeURIComponent(jobId)}/force-cancel`,
    { method: "POST" },
    { clubSlug: undefined },
  );
}

export function retryCommitPlatformAdminAiJob(jobId: string) {
  return readmatesFetch<PlatformAdminAiOpsActionResponse>(
    `/api/admin/ai-generation/jobs/${encodeURIComponent(jobId)}/retry-commit`,
    { method: "POST" },
    { clubSlug: undefined },
  );
}
