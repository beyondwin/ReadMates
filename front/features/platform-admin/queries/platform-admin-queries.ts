import {
  infiniteQueryOptions,
  queryOptions,
  useMutation,
  type QueryClient,
} from "@tanstack/react-query";
import { ReadMatesSessionExpiredError } from "@/shared/api/client";
import { isReadmatesApiError } from "@/shared/api/errors";
import * as platformAdminApi from "@/features/platform-admin/api/platform-admin-api";
import { fetchPlatformAdminCapabilities } from "@/features/platform-admin/api/platform-admin-capabilities-api";
import {
  checkPlatformAdminDomainProvisioning,
  commitPlatformAdminOnboarding,
  confirmPlatformAdminClubVisibility,
  confirmPlatformAdminDomain,
  fetchPlatformAdminClub,
  fetchPlatformAdminClubs,
  fetchPlatformAdminSummary,
  previewPlatformAdminOnboarding,
  previewPlatformAdminClubVisibility,
  previewPlatformAdminDomain,
  updatePlatformAdminClubMetadata,
} from "@/features/platform-admin/api/platform-admin-api";
import type {
  ConfirmPlatformAdminClubVisibilityRequest,
  ConfirmPlatformAdminDomainRequest,
  ConfirmPlatformAdminOnboardingRequest,
  PlatformAdminClub,
  PlatformAdminClubListFilters,
  PreviewPlatformAdminClubVisibilityRequest,
  PreviewPlatformAdminDomainRequest,
  RecheckPlatformAdminDomainRequest,
  PlatformAdminTodayClosingRisksResponse,
  UpdatePlatformAdminClubRequest,
} from "@/features/platform-admin/api/platform-admin-contracts";

const PLATFORM_ADMIN_CACHE_GC_TIME_MS = 5 * 60 * 1000;

export const platformAdminKeys = {
  all: ["platform-admin"] as const,
  capabilities: () => [...platformAdminKeys.all, "capabilities"] as const,
  summary: () => [...platformAdminKeys.all, "summary"] as const,
  clubsRoot: () => [...platformAdminKeys.all, "clubs"] as const,
  clubs: (filters: PlatformAdminClubListFilters = {}) =>
    [...platformAdminKeys.clubsRoot(), normalizedClubFilters(filters)] as const,
  club: (clubId: string) => [...platformAdminKeys.all, "club", clubId] as const,
  todayClosingRisks: () =>
    [...platformAdminKeys.all, "today", "closing-risks"] as const,
  todayClosingRisksUnavailable: () =>
    [...platformAdminKeys.todayClosingRisks(), "unavailable"] as const,
} as const;

const PLATFORM_ADMIN_MUTATION_KEY = [
  ...platformAdminKeys.all,
  "mutation",
] as const;
const installedAuthorityLossHandlers = new WeakSet<QueryClient>();
const authorityLossListeners = new Set<() => void>();

export function platformAdminCapabilitiesQuery() {
  return queryOptions({
    queryKey: platformAdminKeys.capabilities(),
    queryFn: fetchPlatformAdminCapabilities,
  });
}

export function isPlatformAdminAuthorityLossError(error: unknown): boolean {
  if (error instanceof ReadMatesSessionExpiredError) {
    return true;
  }
  return (
    isReadmatesApiError(error) && (error.status === 401 || error.status === 403)
  );
}

export function subscribePlatformAdminAuthorityLoss(
  listener: () => void,
): () => void {
  authorityLossListeners.add(listener);
  return () => {
    authorityLossListeners.delete(listener);
  };
}

export function purgePlatformAdminState(queryClient: QueryClient): void {
  for (const listener of authorityLossListeners) {
    listener();
  }
  void queryClient.cancelQueries({ queryKey: platformAdminKeys.all });
  queryClient.removeQueries({ queryKey: platformAdminKeys.all });
}

export function installPlatformAdminAuthorityLossHandler(
  queryClient: QueryClient,
): void {
  if (installedAuthorityLossHandlers.has(queryClient)) {
    return;
  }
  installedAuthorityLossHandlers.add(queryClient);

  const queryCache = queryClient.getQueryCache();
  const mutationCache = queryClient.getMutationCache();
  const previousQueryOnError = queryCache.config.onError;
  queryCache.config.onError = (error, query) => {
    previousQueryOnError?.(error, query);
    handlePlatformAdminAuthorityLoss(queryClient, error, query.queryKey);
  };
  const previousMutationOnError = mutationCache.config.onError;
  mutationCache.config.onError = (
    error,
    variables,
    onMutateResult,
    mutation,
    context,
  ) => {
    void previousMutationOnError?.(
      error,
      variables,
      onMutateResult,
      mutation,
      context,
    );
    handlePlatformAdminAuthorityLoss(
      queryClient,
      error,
      mutation.options.mutationKey,
    );
  };
}

function isPlatformAdminQueryKey(
  queryKey: readonly unknown[] | undefined,
): boolean {
  return queryKey?.[0] === platformAdminKeys.all[0];
}

function handlePlatformAdminAuthorityLoss(
  queryClient: QueryClient,
  error: unknown,
  queryKey: readonly unknown[] | undefined,
): void {
  if (
    !isPlatformAdminAuthorityLossError(error) ||
    !isPlatformAdminQueryKey(queryKey)
  ) {
    return;
  }
  purgePlatformAdminState(queryClient);
}

export function platformAdminSummaryQuery() {
  return queryOptions({
    queryKey: platformAdminKeys.summary(),
    queryFn: fetchPlatformAdminSummary,
  });
}

export function platformAdminClubsQuery() {
  return queryOptions({
    queryKey: platformAdminKeys.clubs({}),
    queryFn: () => fetchPlatformAdminClubs(),
  });
}

function normalizedClubFilters(
  filters: PlatformAdminClubListFilters,
): PlatformAdminClubListFilters {
  return Object.fromEntries(
    Object.entries(filters)
      .filter(([, value]) => value !== undefined && value !== "")
      .sort(([left], [right]) => left.localeCompare(right)),
  ) as PlatformAdminClubListFilters;
}

export function platformAdminClubsInfiniteQuery(
  filters: PlatformAdminClubListFilters = {},
) {
  const normalized = normalizedClubFilters({ ...filters, cursor: undefined });
  return infiniteQueryOptions({
    queryKey: platformAdminKeys.clubs(normalized),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchPlatformAdminClubs({ ...normalized, cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export function platformAdminClubDetailQuery(clubId: string) {
  return queryOptions({
    queryKey: platformAdminKeys.club(clubId),
    queryFn: () => fetchPlatformAdminClub(clubId),
  });
}

export function platformAdminTodayClosingRisksQuery() {
  return queryOptions<PlatformAdminTodayClosingRisksResponse>({
    queryKey: platformAdminKeys.todayClosingRisks(),
    queryFn: () => platformAdminApi.fetchPlatformAdminTodayClosingRisks(),
  });
}

function setRetainedQueryData<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: (value: T | undefined) => T | undefined,
) {
  queryClient.setQueryDefaults(queryKey, {
    gcTime: PLATFORM_ADMIN_CACHE_GC_TIME_MS,
  });
  const existingQuery = queryClient
    .getQueryCache()
    .find({ queryKey, exact: true });
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

function invalidateClubState(queryClient: QueryClient, clubId: string) {
  queryClient.setQueryDefaults(platformAdminKeys.club(clubId), {
    gcTime: PLATFORM_ADMIN_CACHE_GC_TIME_MS,
  });
  void queryClient.invalidateQueries({
    queryKey: platformAdminKeys.club(clubId),
  });
  void queryClient.invalidateQueries({
    queryKey: platformAdminKeys.clubsRoot(),
  });
  void queryClient.invalidateQueries({ queryKey: platformAdminKeys.summary() });
}

export function useCheckPlatformAdminDomainProvisioningMutation(
  clubId: string,
) {
  void clubId;
  return useMutation({
    mutationKey: PLATFORM_ADMIN_MUTATION_KEY,
    mutationFn: ({
      domainId,
      request,
    }: {
      domainId: string;
      request: RecheckPlatformAdminDomainRequest;
    }) => checkPlatformAdminDomainProvisioning(domainId, request),
  });
}

export function useCommitPlatformAdminOnboardingMutation() {
  return useMutation({
    mutationKey: PLATFORM_ADMIN_MUTATION_KEY,
    mutationFn: (request: ConfirmPlatformAdminOnboardingRequest) =>
      commitPlatformAdminOnboarding(request),
  });
}

export function usePreviewPlatformAdminOnboardingMutation() {
  return useMutation({
    mutationKey: PLATFORM_ADMIN_MUTATION_KEY,
    mutationFn: previewPlatformAdminOnboarding,
  });
}

export function useUpdatePlatformAdminClubMutation() {
  return useMutation({
    mutationKey: PLATFORM_ADMIN_MUTATION_KEY,
    mutationFn: ({
      clubId,
      request,
    }: {
      clubId: string;
      request: UpdatePlatformAdminClubRequest;
    }) => updatePlatformAdminClubMetadata(clubId, request),
  });
}

export function usePreviewPlatformAdminClubVisibilityMutation(clubId: string) {
  return useMutation({
    mutationKey: PLATFORM_ADMIN_MUTATION_KEY,
    mutationFn: (request: PreviewPlatformAdminClubVisibilityRequest) =>
      previewPlatformAdminClubVisibility(clubId, request),
  });
}

export function useConfirmPlatformAdminClubVisibilityMutation(clubId: string) {
  return useMutation({
    mutationKey: PLATFORM_ADMIN_MUTATION_KEY,
    mutationFn: (request: ConfirmPlatformAdminClubVisibilityRequest) =>
      confirmPlatformAdminClubVisibility(clubId, request),
  });
}

export function usePreviewPlatformAdminDomainMutation(clubId: string) {
  return useMutation({
    mutationKey: PLATFORM_ADMIN_MUTATION_KEY,
    mutationFn: (request: PreviewPlatformAdminDomainRequest) =>
      previewPlatformAdminDomain(clubId, request),
  });
}

export function useConfirmPlatformAdminDomainMutation(clubId: string) {
  return useMutation({
    mutationKey: PLATFORM_ADMIN_MUTATION_KEY,
    mutationFn: (request: ConfirmPlatformAdminDomainRequest) =>
      confirmPlatformAdminDomain(clubId, request),
  });
}

export function publishPlatformAdminClubState(queryClient: QueryClient, clubId: string) {
  return invalidateClubState(queryClient, clubId);
}

export async function publishPlatformAdminOnboarding(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: platformAdminKeys.summary() }),
    queryClient.invalidateQueries({ queryKey: platformAdminKeys.clubsRoot() }),
  ]);
}

export function publishUpdatedPlatformAdminClub(queryClient: QueryClient, club: PlatformAdminClub) {
  setRetainedQueryData(queryClient, platformAdminKeys.club(club.clubId), () => club);
  return queryClient.invalidateQueries({ queryKey: platformAdminKeys.clubsRoot() });
}
