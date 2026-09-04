import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from "react-router";
import {
  buildClubManagementRow,
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
import { AdminOnboardingController } from "./admin-onboarding-controller";
import type { AdminShellOutletContext } from "./admin-shell-layout";

type FilterKey =
  | "search"
  | "lifecycle"
  | "visibility"
  | "domainStatus"
  | "onboardingState";

const CLUBS_ALLOWED = { fallback: "/admin/clubs", allowedPath: "/admin/clubs" };
export const ADMIN_CLUBS_FOCUS_RESTORE_KEY = "readmates.admin-clubs.focus-restore";

export function AdminClubsRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scrollTop, setScrollTop] = useState(0);
  const shellContext = useOutletContext<AdminShellOutletContext | null>();
  const [consumedRestoreKey, setConsumedRestoreKey] = useState<string | null>(
    null,
  );
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
  const parsedRestore = parseAdminRouteReturnState(
    restoreParams(searchParams, location.state, returnTo),
    CLUBS_ALLOWED,
  );
  const sessionRestore = readClubsFocusRestore();
  const restorePending = consumedRestoreKey !== location.key;
  const restore = restorePending
    ? {
        ...parsedRestore,
        focusId: parsedRestore.focusId ?? sessionRestore?.focusId ?? null,
        scrollTop: parsedRestore.scrollTop || sessionRestore?.scrollTop || 0,
      }
    : { ...parsedRestore, focusId: null, scrollTop: 0 };
  const consumeRestore = useCallback(() => {
    if (consumedRestoreKey === location.key) return;
    setConsumedRestoreKey(location.key);
    clearClubsFocusRestore();
    const next = new URLSearchParams(searchParams);
    const hadRestoreParams = next.has("focusId") || next.has("scrollTop");
    next.delete("focusId");
    next.delete("scrollTop");
    if (!hadRestoreParams) return;
    navigate(
      {
        pathname: location.pathname,
        search: next.toString() ? `?${next.toString()}` : "",
        hash: location.hash,
      },
      { replace: true, state: location.state },
    );
  }, [
    consumedRestoreKey,
    location.hash,
    location.key,
    location.pathname,
    location.state,
    navigate,
    searchParams,
  ]);
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
        ...buildClubManagementRow(club),
        clubId: club.clubId,
        href: buildAdminDetailHref(`/admin/clubs/${club.clubId}`, {
          returnTo,
          focusId: club.clubId,
          scrollTop,
        }),
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
  const openClub = useCallback((clubId: string) => {
    writeClubsFocusRestore({ focusId: clubId, scrollTop });
    flushSync(() => {
      navigate(
        {
          pathname: location.pathname,
          search: location.search,
          hash: location.hash,
        },
        { replace: true, state: { focusId: clubId, scrollTop } },
      );
    });
    navigate(`/admin/clubs/${clubId}`);
  }, [location.hash, location.pathname, location.search, navigate, scrollTop]);

  const pageState = deriveClubsPageState({
    isError: clubsQuery.isError && !clubsQuery.isFetchNextPageError,
    isPending: clubsQuery.isPending,
    isEmpty: clubs.length === 0,
  });

  return (
    <>
      <AdminClubsLedger
        clubs={ledgerClubs}
        filters={filters}
        searchDraft={filters.search ?? ""}
        pageState={pageState}
        canCreateClub={canCreateClub}
        onboardingHref={onboardingHref}
        focusId={restore.focusId}
        scrollTop={restore.scrollTop}
        restoreKey={location.key}
        onRestoreConsumed={consumeRestore}
        hasNextPage={Boolean(clubsQuery.hasNextPage)}
        loadingMore={clubsQuery.isFetchingNextPage}
        loadMoreError={clubsQuery.isFetchNextPageError}
        onSearchChange={updateSearch}
        onFilterChange={(key, value) => updateFilter(key, value)}
        onRetry={() => void clubsQuery.refetch()}
        onLoadMore={() => void clubsQuery.fetchNextPage()}
        onScrollChange={setScrollTop}
        onActivateClub={openClub}
      />
      <AdminOnboardingController
        capabilities={capabilities}
        authorityEpoch={shellContext?.authorityEpoch ?? 0}
      />
    </>
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

function writeClubsFocusRestore(value: { focusId: string; scrollTop: number }) {
  sessionStorage.setItem(ADMIN_CLUBS_FOCUS_RESTORE_KEY, JSON.stringify(value));
}

function readClubsFocusRestore(): { focusId: string; scrollTop: number } | null {
  const raw = sessionStorage.getItem(ADMIN_CLUBS_FOCUS_RESTORE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { focusId?: unknown; scrollTop?: unknown };
    if (typeof parsed.focusId !== "string" || typeof parsed.scrollTop !== "number") return null;
    return { focusId: parsed.focusId, scrollTop: parsed.scrollTop };
  } catch {
    return null;
  }
}

function clearClubsFocusRestore() {
  sessionStorage.removeItem(ADMIN_CLUBS_FOCUS_RESTORE_KEY);
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
