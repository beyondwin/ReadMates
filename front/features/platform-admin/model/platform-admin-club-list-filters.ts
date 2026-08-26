import type {
  FirstHostOnboardingState,
  PlatformAdminClubListFilters,
  PlatformAdminClubPublicVisibility,
  PlatformAdminClubStatus,
  PlatformAdminDomainStatus,
} from "@/features/platform-admin/api/platform-admin-contracts";

const CLUB_LIFECYCLES: readonly PlatformAdminClubStatus[] = [
  "SETUP_REQUIRED",
  "ACTIVE",
  "SUSPENDED",
  "ARCHIVED",
];
const CLUB_VISIBILITIES: readonly PlatformAdminClubPublicVisibility[] = [
  "PRIVATE",
  "PUBLIC",
];
const DOMAIN_STATUSES: readonly PlatformAdminDomainStatus[] = [
  "REQUESTED",
  "ACTION_REQUIRED",
  "PROVISIONING",
  "ACTIVE",
  "FAILED",
  "DISABLED",
];
const ONBOARDING_STATES: readonly FirstHostOnboardingState[] = [
  "MISSING",
  "INVITED",
  "ASSIGNED",
];

export function platformAdminClubListFiltersFromSearch(
  search: URLSearchParams,
): PlatformAdminClubListFilters {
  return {
    search: search.get("search")?.trim() || undefined,
    lifecycle: allowedFilter(search.get("lifecycle"), CLUB_LIFECYCLES),
    visibility: allowedFilter(search.get("visibility"), CLUB_VISIBILITIES),
    domainStatus: allowedFilter(search.get("domainStatus"), DOMAIN_STATUSES),
    onboardingState: allowedFilter(
      search.get("onboardingState"),
      ONBOARDING_STATES,
    ),
    limit: 25,
  };
}

export function platformAdminClubListSearchParamsFromFilters(
  filters: PlatformAdminClubListFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.lifecycle) params.set("lifecycle", filters.lifecycle);
  if (filters.visibility) params.set("visibility", filters.visibility);
  if (filters.domainStatus) params.set("domainStatus", filters.domainStatus);
  if (filters.onboardingState) {
    params.set("onboardingState", filters.onboardingState);
  }
  return params;
}

export function platformAdminClubListHref(
  search: URLSearchParams,
  pathname = "/admin/clubs",
): string {
  const params = platformAdminClubListSearchParamsFromFilters(
    platformAdminClubListFiltersFromSearch(search),
  );
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function allowedFilter<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | undefined {
  return value === null
    ? undefined
    : allowed.find((candidate) => candidate === value);
}
