import { useCallback, useMemo, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router";
import {
  clubTriageReasons,
  clubTriageSeverity,
} from "@/features/platform-admin/model/platform-admin-club-triage-model";
import {
  platformAdminClubListFiltersFromSearch,
  platformAdminClubListHref,
} from "@/features/platform-admin/model/platform-admin-club-list-filters";
import {
  buildAdminDetailHref,
  parseAdminRouteReturnState,
} from "@/features/platform-admin/model/admin-route-state";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  platformAdminCapabilitiesQuery,
  platformAdminClubsInfiniteQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";
import { AdminClubsLedger } from "@/features/platform-admin/ui/admin-clubs-ledger";
import type { AdminPageState } from "@/features/platform-admin/ui/admin-state-panel";

type FilterKey =
  | "search"
  | "lifecycle"
  | "visibility"
  | "domainStatus"
  | "onboardingState";

const CLUBS_ALLOWED = { fallback: "/admin/clubs", allowedPath: "/admin/clubs" };

export function AdminClubsRoute() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scrollTop, setScrollTop] = useState(0);
  const filters = platformAdminClubListFiltersFromSearch(searchParams);
  const capabilities = useQuery(platformAdminCapabilitiesQuery()).data ?? null;
  const canCreateClub =
    capabilities != null && canAdmin(capabilities, "CREATE_CLUB");
  const onboardingHref = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.set("onboarding", "1");
    return `?${next.toString()}`;
  }, [searchParams]);
  const returnTo = platformAdminClubListHref(searchParams);
  const restore = parseAdminRouteReturnState(
    restoreParams(searchParams, location.state, returnTo),
    CLUBS_ALLOWED,
  );
  const clubsQuery = useInfiniteQuery(platformAdminClubsInfiniteQuery(filters));
  const clubs = useMemo(() => {
    const seen = new Set<string>();
    return (clubsQuery.data?.pages ?? []).flatMap((page) =>
      page.items.filter((club) => {
        if (seen.has(club.clubId)) return false;
        seen.add(club.clubId);
        return true;
      }),
    );
  }, [clubsQuery.data]);
  const ledgerClubs = useMemo(
    () =>
      clubs.map((club) => ({
        clubId: club.clubId,
        slug: club.slug,
        name: club.name,
        status: club.status,
        publicVisibility: club.publicVisibility,
        domainCount: club.domainCount,
        domainActionRequiredCount: club.domainActionRequiredCount,
        firstHostOnboardingState: club.firstHostOnboardingState,
        href: buildAdminDetailHref(`/admin/clubs/${club.clubId}`, {
          returnTo,
          focusId: club.clubId,
          scrollTop,
        }),
        severity: clubTriageSeverity(club),
        reasons: clubTriageReasons(club),
      })),
    [clubs, returnTo, scrollTop],
  );

  const updateFilter = useCallback(
    (key: FilterKey, value: string) => {
      const next = new URLSearchParams(searchParams);
      next.delete("cursor");
      if (value) next.set(key, value);
      else next.delete(key);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );
  const updateSearch = useCallback(
    (value: string) => updateFilter("search", value),
    [updateFilter],
  );

  const pageState = deriveClubsPageState({
    isError: clubsQuery.isError && !clubsQuery.isFetchNextPageError,
    isPending: clubsQuery.isPending,
    isEmpty: clubs.length === 0,
  });

  return (
    <AdminClubsLedger
      clubs={ledgerClubs}
      filters={filters}
      searchDraft={filters.search ?? ""}
      pageState={pageState}
      canCreateClub={canCreateClub}
      onboardingHref={onboardingHref}
      focusId={restore.focusId}
      scrollTop={restore.scrollTop}
      hasNextPage={Boolean(clubsQuery.hasNextPage)}
      loadingMore={clubsQuery.isFetchingNextPage}
      loadMoreError={clubsQuery.isFetchNextPageError}
      onSearchChange={updateSearch}
      onFilterChange={(key, value) => updateFilter(key, value)}
      onRetry={() => void clubsQuery.refetch()}
      onLoadMore={() => void clubsQuery.fetchNextPage()}
      onScrollChange={setScrollTop}
    />
  );
}

function deriveClubsPageState({
  isError,
  isPending,
  isEmpty,
}: {
  isError: boolean;
  isPending: boolean;
  isEmpty: boolean;
}): AdminPageState {
  if (isError) return "unavailable";
  if (isPending) return "loading";
  if (isEmpty) return "empty";
  return "ready";
}

function restoreParams(
  searchParams: URLSearchParams,
  state: unknown,
  returnTo: string,
) {
  const params = new URLSearchParams();
  params.set("returnTo", returnTo);
  const restoreState =
    state && typeof state === "object"
      ? (state as { focusId?: unknown; scrollTop?: unknown })
      : null;
  const focusId =
    typeof restoreState?.focusId === "string"
      ? restoreState.focusId
      : searchParams.get("focusId");
  const scrollTop =
    typeof restoreState?.scrollTop === "number"
      ? String(restoreState.scrollTop)
      : searchParams.get("scrollTop");
  if (focusId) params.set("focusId", focusId);
  if (scrollTop) params.set("scrollTop", scrollTop);
  return params;
}
