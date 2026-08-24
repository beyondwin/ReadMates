import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import {
  CLUB_TRIAGE_LABEL,
  clubTriageReasons,
  clubTriageSeverity,
} from "@/features/platform-admin/model/platform-admin-club-triage-model";
import { platformAdminClubListFiltersFromSearch } from "@/features/platform-admin/model/platform-admin-club-list-filters";
import { canAdmin } from "@/features/platform-admin/model/platform-admin-capabilities";
import {
  platformAdminCapabilitiesQuery,
  platformAdminClubsInfiniteQuery,
} from "@/features/platform-admin/queries/platform-admin-queries";

type FilterKey =
  | "search"
  | "lifecycle"
  | "visibility"
  | "domainStatus"
  | "onboardingState";

export function AdminClubsRoute() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = platformAdminClubListFiltersFromSearch(searchParams);
  const capabilities = useQuery(platformAdminCapabilitiesQuery()).data ?? null;
  const canCreateClub =
    capabilities != null && canAdmin(capabilities, "CREATE_CLUB");
  const onboardingHref = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.set("onboarding", "1");
    return `?${next.toString()}`;
  }, [searchParams]);
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

  return (
    <section className="admin-clubs" aria-labelledby="admin-clubs-title">
      <header className="admin-clubs__header">
        <div>
          <p className="eyebrow">Club registry</p>
          <h1 id="admin-clubs-title" className="h1 editorial">
            클럽
          </h1>
          <p className="body">
            서버가 검색·정렬한 클럽을 조치 신호와 함께 확인합니다.
          </p>
        </div>
        {canCreateClub ? (
          <Link to={onboardingHref} className="btn btn-primary btn-sm">
            새 클럽
          </Link>
        ) : null}
      </header>

      <div className="admin-clubs__query" aria-label="클럽 목록 필터">
        <ClubSearchField
          key={filters.search ?? ""}
          initialValue={filters.search ?? ""}
          onSearch={updateSearch}
        />
        <FilterSelect
          label="수명주기"
          value={filters.lifecycle ?? ""}
          onChange={(value) => updateFilter("lifecycle", value)}
        >
          <option value="">전체</option>
          <option value="ACTIVE">활성</option>
          <option value="SETUP_REQUIRED">설정 필요</option>
          <option value="SUSPENDED">중지</option>
          <option value="ARCHIVED">보관</option>
        </FilterSelect>
        <FilterSelect
          label="공개 상태"
          value={filters.visibility ?? ""}
          onChange={(value) => updateFilter("visibility", value)}
        >
          <option value="">전체</option>
          <option value="PUBLIC">공개</option>
          <option value="PRIVATE">비공개</option>
        </FilterSelect>
        <FilterSelect
          label="도메인 상태"
          value={filters.domainStatus ?? ""}
          onChange={(value) => updateFilter("domainStatus", value)}
        >
          <option value="">전체</option>
          <option value="ACTION_REQUIRED">조치 필요</option>
          <option value="PROVISIONING">진행 중</option>
          <option value="ACTIVE">활성</option>
          <option value="FAILED">실패</option>
        </FilterSelect>
        <FilterSelect
          label="호스트 온보딩"
          value={filters.onboardingState ?? ""}
          onChange={(value) => updateFilter("onboardingState", value)}
        >
          <option value="">전체</option>
          <option value="MISSING">없음</option>
          <option value="INVITED">초대됨</option>
          <option value="ASSIGNED">배정됨</option>
        </FilterSelect>
      </div>

      {clubsQuery.isError && !clubsQuery.isFetchNextPageError ? (
        <div className="surface admin-clubs__state" role="alert">
          <p>클럽 목록을 불러오지 못했습니다.</p>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => void clubsQuery.refetch()}
          >
            다시 시도
          </button>
        </div>
      ) : clubsQuery.isPending ? (
        <p className="muted admin-clubs__state">클럽을 불러오는 중입니다.</p>
      ) : clubs.length === 0 ? (
        <p className="muted admin-clubs__state">조건에 맞는 클럽이 없습니다.</p>
      ) : (
        <div className="admin-clubs__table-wrap">
          <table className="admin-clubs__table">
            <thead>
              <tr>
                <th scope="col">상태 신호</th>
                <th scope="col">Slug</th>
                <th scope="col">이름</th>
                <th scope="col">상태</th>
                <th scope="col">공개</th>
                <th scope="col">도메인</th>
                <th scope="col">호스트</th>
              </tr>
            </thead>
            <tbody>
              {clubs.map((club) => {
                const severity = clubTriageSeverity(club);
                const reasons = clubTriageReasons(club);
                return (
                  <tr
                    key={club.clubId}
                    className={`admin-clubs__row admin-clubs__row--${severity}`}
                  >
                    <td data-label="상태 신호">
                      <span
                        className={`admin-clubs__triage admin-clubs__triage--${severity}`}
                      >
                        {CLUB_TRIAGE_LABEL[severity]}
                      </span>
                      {reasons.length > 0 ? (
                        <span className="admin-clubs__triage-reasons">
                          {reasons.join(" · ")}
                        </span>
                      ) : null}
                    </td>
                    <td data-label="Slug">
                      <code>{club.slug}</code>
                    </td>
                    <td data-label="이름">
                      <Link to={`/admin/clubs/${club.clubId}`}>
                        {club.name}
                      </Link>
                    </td>
                    <td data-label="상태">{club.status}</td>
                    <td data-label="공개">{club.publicVisibility}</td>
                    <td data-label="도메인">
                      {club.domainCount}
                      {club.domainActionRequiredCount > 0
                        ? ` · ${club.domainActionRequiredCount} 조치 필요`
                        : ""}
                    </td>
                    <td data-label="호스트">{club.firstHostOnboardingState}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {clubsQuery.hasNextPage ? (
        <div className="admin-clubs__load-more">
          {clubsQuery.isFetchNextPageError ? (
            <p className="danger" role="alert">
              다음 클럽을 불러오지 못했습니다. 현재 목록은 그대로 유지됩니다.
            </p>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={clubsQuery.isFetchingNextPage}
            onClick={() => void clubsQuery.fetchNextPage()}
          >
            {clubsQuery.isFetchingNextPage
              ? "불러오는 중"
              : clubsQuery.isFetchNextPageError
                ? "다시 불러오기"
                : "더 보기"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ClubSearchField({
  initialValue,
  onSearch,
}: {
  initialValue: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(initialValue);
  useEffect(() => {
    const normalized = draft.trim();
    if (normalized === initialValue) return;
    const timer = window.setTimeout(() => onSearch(normalized), 300);
    return () => window.clearTimeout(timer);
  }, [draft, initialValue, onSearch]);
  return (
    <label className="field-group admin-clubs__search">
      <span className="label">클럽 검색</span>
      <input
        type="search"
        className="input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="이름 또는 slug"
      />
    </label>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="field-group">
      <span className="label">{label}</span>
      <select
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
