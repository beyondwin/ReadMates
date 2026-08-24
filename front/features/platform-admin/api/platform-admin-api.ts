import { readmatesFetch } from "@/shared/api/client";
import {
  parsePlatformAdminClubCommandReceipt,
  parsePlatformAdminClubDetail,
  parsePlatformAdminClubList,
  parsePlatformAdminClubVisibilityPreview,
  parsePlatformAdminDomainCommandPreview,
  parsePlatformAdminOnboardingPreview,
  parsePlatformAdminOnboardingResult,
  parsePlatformAdminAiOpsCommandPreview,
  parsePlatformAdminAiOpsCommandReceipt,
  type ConfirmPlatformAdminAiOpsCommandRequest,
  type ConfirmPlatformAdminClubVisibilityRequest,
  type ConfirmPlatformAdminDomainRequest,
  type ConfirmPlatformAdminOnboardingRequest,
  PlatformAdminAiGenerationCapabilitiesResponse,
  PlatformAdminAiOpsFilters,
  PlatformAdminAiOpsJob,
  PlatformAdminAiOpsJobListResponse,
  PlatformAdminAiOpsSummaryResponse,
  PlatformAdminClubCommandReceipt,
  PlatformAdminClubDetail,
  PlatformAdminClubListFilters,
  PlatformAdminClubVisibilityPreviewResponse,
  PlatformAdminDomainCommandPreviewResponse,
  PlatformAdminOnboardingRequest,
  PlatformAdminSummaryResponse,
  PlatformAdminTodayClosingRisksResponse,
  PreviewPlatformAdminClubVisibilityRequest,
  PreviewPlatformAdminDomainRequest,
  RecheckPlatformAdminDomainRequest,
  UpdatePlatformAdminClubRequest,
} from "@/features/platform-admin/api/platform-admin-contracts";

export function fetchPlatformAdminSummary() {
  return readmatesFetch<PlatformAdminSummaryResponse>(
    "/api/admin/summary",
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchPlatformAdminClubs(
  filters: PlatformAdminClubListFilters = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return readmatesFetch<unknown>(
    `/api/admin/clubs${search ? `?${search}` : ""}`,
    undefined,
    { clubSlug: undefined },
  ).then(parsePlatformAdminClubList);
}

export function fetchPlatformAdminClub(
  clubId: string,
): Promise<PlatformAdminClubDetail> {
  return readmatesFetch<unknown>(
    `/api/admin/clubs/${encodeURIComponent(clubId)}`,
    undefined,
    { clubSlug: undefined },
  ).then(parsePlatformAdminClubDetail);
}

export function fetchPlatformAdminTodayClosingRisks() {
  return readmatesFetch<PlatformAdminTodayClosingRisksResponse>(
    "/api/admin/today/closing-risks",
    undefined,
    { clubSlug: undefined },
  );
}

export function updatePlatformAdminClubMetadata(
  clubId: string,
  request: UpdatePlatformAdminClubRequest,
) {
  return readmatesFetch<unknown>(
    `/api/admin/clubs/${encodeURIComponent(clubId)}/metadata`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  ).then(parsePlatformAdminClubDetail);
}

export const updatePlatformAdminClub = updatePlatformAdminClubMetadata;

export function previewPlatformAdminOnboarding(
  request: PlatformAdminOnboardingRequest,
) {
  return readmatesFetch<unknown>(
    "/api/admin/clubs/onboarding/preview",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  ).then(parsePlatformAdminOnboardingPreview);
}

export function commitPlatformAdminOnboarding(
  request: ConfirmPlatformAdminOnboardingRequest,
) {
  return readmatesFetch<unknown>(
    "/api/admin/clubs/onboarding",
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  ).then(parsePlatformAdminOnboardingResult);
}

export function previewPlatformAdminClubVisibility(
  clubId: string,
  request: PreviewPlatformAdminClubVisibilityRequest,
): Promise<PlatformAdminClubVisibilityPreviewResponse> {
  return readmatesFetch<unknown>(
    `/api/admin/clubs/${encodeURIComponent(clubId)}/visibility/preview`,
    { method: "POST", body: JSON.stringify(request) },
    { clubSlug: undefined },
  ).then(parsePlatformAdminClubVisibilityPreview);
}

export function confirmPlatformAdminClubVisibility(
  clubId: string,
  request: ConfirmPlatformAdminClubVisibilityRequest,
): Promise<PlatformAdminClubCommandReceipt> {
  return readmatesFetch<unknown>(
    `/api/admin/clubs/${encodeURIComponent(clubId)}/visibility/confirm`,
    { method: "POST", body: JSON.stringify(request) },
    { clubSlug: undefined },
  ).then(parsePlatformAdminClubCommandReceipt);
}

export function previewPlatformAdminDomain(
  clubId: string,
  request: PreviewPlatformAdminDomainRequest,
): Promise<PlatformAdminDomainCommandPreviewResponse> {
  return readmatesFetch<unknown>(
    `/api/admin/clubs/${encodeURIComponent(clubId)}/domains/preview`,
    { method: "POST", body: JSON.stringify(request) },
    { clubSlug: undefined },
  ).then(parsePlatformAdminDomainCommandPreview);
}

export function confirmPlatformAdminDomain(
  clubId: string,
  request: ConfirmPlatformAdminDomainRequest,
) {
  return readmatesFetch<unknown>(
    `/api/admin/clubs/${encodeURIComponent(clubId)}/domains`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
    { clubSlug: undefined },
  ).then(parsePlatformAdminClubCommandReceipt);
}

export const createPlatformAdminDomain = confirmPlatformAdminDomain;

export function checkPlatformAdminDomainProvisioning(
  domainId: string,
  request: RecheckPlatformAdminDomainRequest,
) {
  return readmatesFetch<unknown>(
    `/api/admin/domains/${encodeURIComponent(domainId)}/check`,
    { method: "POST", body: JSON.stringify(request) },
    { clubSlug: undefined },
  ).then(parsePlatformAdminClubCommandReceipt);
}

export function fetchPlatformAdminAiOpsSummary(window?: string) {
  const search = window ? `?window=${encodeURIComponent(window)}` : "";
  return readmatesFetch<PlatformAdminAiOpsSummaryResponse>(
    `/api/admin/ai-generation/summary${search}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchPlatformAdminAiGenerationCapabilities() {
  return readmatesFetch<PlatformAdminAiGenerationCapabilitiesResponse>(
    "/api/admin/ai-generation/capabilities",
    undefined,
    { clubSlug: undefined },
  );
}

export function fetchPlatformAdminAiOpsJobs(
  filters: PlatformAdminAiOpsFilters = {},
) {
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

export function fetchPlatformAdminAiOpsJob(jobId: string) {
  return readmatesFetch<PlatformAdminAiOpsJob>(
    `/api/admin/ai-generation/jobs/${encodeURIComponent(jobId)}`,
    undefined,
    { clubSlug: undefined },
  );
}

export function previewForceCancelPlatformAdminAiJob(jobId: string) {
  return readmatesFetch<unknown>(
    `/api/admin/ai-generation/jobs/${encodeURIComponent(jobId)}/force-cancel/preview`,
    { method: "POST" },
    { clubSlug: undefined },
  ).then(parsePlatformAdminAiOpsCommandPreview);
}

export function previewRetryCommitPlatformAdminAiJob(jobId: string) {
  return readmatesFetch<unknown>(
    `/api/admin/ai-generation/jobs/${encodeURIComponent(jobId)}/retry-commit/preview`,
    { method: "POST" },
    { clubSlug: undefined },
  ).then(parsePlatformAdminAiOpsCommandPreview);
}

export function confirmForceCancelPlatformAdminAiJob(
  jobId: string,
  request: ConfirmPlatformAdminAiOpsCommandRequest,
) {
  return readmatesFetch<unknown>(
    `/api/admin/ai-generation/jobs/${encodeURIComponent(jobId)}/force-cancel/confirm`,
    { method: "POST", body: JSON.stringify(request) },
    { clubSlug: undefined },
  ).then(parsePlatformAdminAiOpsCommandReceipt);
}

export function confirmRetryCommitPlatformAdminAiJob(
  jobId: string,
  request: ConfirmPlatformAdminAiOpsCommandRequest,
) {
  return readmatesFetch<unknown>(
    `/api/admin/ai-generation/jobs/${encodeURIComponent(jobId)}/retry-commit/confirm`,
    { method: "POST", body: JSON.stringify(request) },
    { clubSlug: undefined },
  ).then(parsePlatformAdminAiOpsCommandReceipt);
}
