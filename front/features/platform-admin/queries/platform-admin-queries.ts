import { queryOptions, useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import * as platformAdminApi from "@/features/platform-admin/api/platform-admin-api";
import {
  checkPlatformAdminDomainProvisioning,
  commitPlatformAdminOnboarding,
  createSupportAccessGrant,
  fetchPlatformAdminClubs,
  fetchPlatformAdminSummary,
  listSupportAccessGrantsByClub,
  revokeSupportAccessGrant,
  updatePlatformAdminClub,
} from "@/features/platform-admin/api/platform-admin-api";
import type {
  CreateSupportAccessGrantRequest,
  PlatformAdminClub,
  PlatformAdminClubListResponse,
  PlatformAdminDomainResponse,
  PlatformAdminOnboardingRequest,
  PlatformAdminSummaryResponse,
  PlatformAdminTodayClosingRisksResponse,
  SupportAccessGrantResponse,
  UpdatePlatformAdminClubRequest,
} from "@/features/platform-admin/api/platform-admin-contracts";

const PLATFORM_ADMIN_CACHE_GC_TIME_MS = 5 * 60 * 1000;

export const platformAdminKeys = {
  all: ["platform-admin"] as const,
  summary: () => [...platformAdminKeys.all, "summary"] as const,
  clubs: () => [...platformAdminKeys.all, "clubs"] as const,
  todayClosingRisks: () => [...platformAdminKeys.all, "today", "closing-risks"] as const,
  todayClosingRisksUnavailable: () => [...platformAdminKeys.todayClosingRisks(), "unavailable"] as const,
  supportGrantsRoot: () => [...platformAdminKeys.all, "support-grants"] as const,
  supportGrants: (clubId: string | null) => [...platformAdminKeys.supportGrantsRoot(), clubId] as const,
} as const;

export function platformAdminSummaryQuery() {
  return queryOptions({
    queryKey: platformAdminKeys.summary(),
    queryFn: fetchPlatformAdminSummary,
  });
}

export function platformAdminClubsQuery() {
  return queryOptions({
    queryKey: platformAdminKeys.clubs(),
    queryFn: fetchPlatformAdminClubs,
  });
}

export function platformAdminTodayClosingRisksQuery() {
  return queryOptions<PlatformAdminTodayClosingRisksResponse>({
    queryKey: platformAdminKeys.todayClosingRisks(),
    queryFn: () => platformAdminApi.fetchPlatformAdminTodayClosingRisks(),
  });
}

export function platformAdminSupportGrantsQuery(clubId: string | null) {
  return queryOptions({
    queryKey: platformAdminKeys.supportGrants(clubId),
    queryFn: () => (clubId ? listSupportAccessGrantsByClub(clubId) : Promise.resolve([])),
  });
}

function prependClub(
  clubs: PlatformAdminClubListResponse | undefined,
  club: PlatformAdminClub,
): PlatformAdminClubListResponse {
  const existing = clubs?.items ?? [];
  return {
    items: [club, ...existing.filter((item) => item.clubId !== club.clubId)],
  };
}

function replaceClub(
  clubs: PlatformAdminClubListResponse | undefined,
  club: PlatformAdminClub,
): PlatformAdminClubListResponse | undefined {
  if (!clubs) {
    return undefined;
  }
  return {
    items: clubs.items.map((item) => (item.clubId === club.clubId ? club : item)),
  };
}

function replaceDomain(
  domains: PlatformAdminDomainResponse[] | undefined,
  domain: PlatformAdminDomainResponse,
): PlatformAdminDomainResponse[] {
  const existing = domains ?? [];
  const found = existing.some((item) => item.id === domain.id);
  if (!found) {
    return [domain, ...existing];
  }
  return existing.map((item) => (item.id === domain.id ? domain : item));
}

function actionRequiredDomains(domains: PlatformAdminDomainResponse[]) {
  return domains.filter((domain) => domain.status === "ACTION_REQUIRED");
}

function summaryWithUpdatedDomain(
  summary: PlatformAdminSummaryResponse | undefined,
  domain: PlatformAdminDomainResponse,
): PlatformAdminSummaryResponse | undefined {
  if (!summary) {
    return undefined;
  }
  const domains = replaceDomain(summary.domains, domain);
  const domainsRequiringAction = actionRequiredDomains(replaceDomain(summary.domainsRequiringAction, domain));

  return {
    ...summary,
    domains,
    domainsRequiringAction,
    domainActionRequiredCount: domainsRequiringAction.length,
  };
}

function prependSupportGrant(
  grants: SupportAccessGrantResponse[] | undefined,
  grant: SupportAccessGrantResponse,
): SupportAccessGrantResponse[] {
  const existing = grants ?? [];
  return [grant, ...existing.filter((item) => item.id !== grant.id)];
}

function setRetainedQueryData<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: (value: T | undefined) => T | undefined,
) {
  queryClient.setQueryDefaults(queryKey, { gcTime: PLATFORM_ADMIN_CACHE_GC_TIME_MS });
  const existingQuery = queryClient.getQueryCache().find({ queryKey, exact: true });
  if (existingQuery && !existingQuery.isActive()) {
    const nextValue = updater(existingQuery.state.data as T | undefined);
    queryClient.removeQueries({ queryKey, exact: true });
    if (nextValue !== undefined) {
      queryClient.setQueryData(queryKey, nextValue);
    }
    return;
  }
  queryClient.setQueryData(queryKey, updater);
}

export function useCheckPlatformAdminDomainProvisioningMutation() {
  const queryClient = useQueryClient();
  const summarySnapshot = queryClient.getQueryData<PlatformAdminSummaryResponse>(platformAdminKeys.summary());
  return useMutation({
    mutationFn: (domainId: string) => checkPlatformAdminDomainProvisioning(domainId),
    onSuccess: (domain) => {
      setRetainedQueryData(queryClient, platformAdminKeys.summary(), (summary: PlatformAdminSummaryResponse | undefined) =>
        summaryWithUpdatedDomain(summary ?? summarySnapshot, domain),
      );
    },
  });
}

export function useCommitPlatformAdminOnboardingMutation() {
  const queryClient = useQueryClient();
  const clubsSnapshot = queryClient.getQueryData<PlatformAdminClubListResponse>(platformAdminKeys.clubs());
  const summarySnapshot = queryClient.getQueryData<PlatformAdminSummaryResponse>(platformAdminKeys.summary());
  return useMutation({
    mutationFn: (request: PlatformAdminOnboardingRequest) => commitPlatformAdminOnboarding(request),
    onSuccess: (result) => {
      setRetainedQueryData(queryClient, platformAdminKeys.clubs(), (clubs: PlatformAdminClubListResponse | undefined) =>
        prependClub(clubs ?? clubsSnapshot, result.club),
      );
      if (result.domain) {
        setRetainedQueryData(queryClient, platformAdminKeys.summary(), (summary: PlatformAdminSummaryResponse | undefined) =>
          summaryWithUpdatedDomain(summary ?? summarySnapshot, result.domain),
        );
      }
      void queryClient.invalidateQueries({ queryKey: platformAdminKeys.summary() });
      void queryClient.invalidateQueries({ queryKey: platformAdminKeys.clubs() });
    },
  });
}

export function useUpdatePlatformAdminClubMutation() {
  const queryClient = useQueryClient();
  const clubsSnapshot = queryClient.getQueryData<PlatformAdminClubListResponse>(platformAdminKeys.clubs());
  return useMutation({
    mutationFn: ({ clubId, request }: { clubId: string; request: UpdatePlatformAdminClubRequest }) =>
      updatePlatformAdminClub(clubId, request),
    onSuccess: (club) => {
      setRetainedQueryData(queryClient, platformAdminKeys.clubs(), (clubs: PlatformAdminClubListResponse | undefined) =>
        replaceClub(clubs ?? clubsSnapshot, club),
      );
    },
  });
}

export function useCreateSupportAccessGrantMutation(clubId: string | null) {
  const queryClient = useQueryClient();
  const grantsSnapshot = queryClient.getQueryData<SupportAccessGrantResponse[]>(platformAdminKeys.supportGrants(clubId));
  return useMutation({
    mutationFn: (request: CreateSupportAccessGrantRequest) => createSupportAccessGrant(request),
    onSuccess: (grant) => {
      setRetainedQueryData(queryClient, platformAdminKeys.supportGrants(clubId), (grants: SupportAccessGrantResponse[] | undefined) =>
        prependSupportGrant(grants ?? grantsSnapshot, grant),
      );
    },
  });
}

export function useRevokeSupportAccessGrantMutation(clubId: string | null) {
  const queryClient = useQueryClient();
  const grantsSnapshot = queryClient.getQueryData<SupportAccessGrantResponse[]>(platformAdminKeys.supportGrants(clubId));
  return useMutation({
    mutationFn: (grantId: string) => revokeSupportAccessGrant(grantId),
    onSuccess: (_result, grantId) => {
      setRetainedQueryData(queryClient, platformAdminKeys.supportGrants(clubId), (grants: SupportAccessGrantResponse[] | undefined) =>
        (grants ?? grantsSnapshot ?? []).filter((grant) => grant.id !== grantId),
      );
    },
  });
}
