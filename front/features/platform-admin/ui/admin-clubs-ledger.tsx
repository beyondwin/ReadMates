import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { AdminPageState } from "./admin-state-panel";
import { AdminEvidenceLedger } from "./admin-evidence-ledger";
import { AdminPageContext } from "./admin-page-context";
import { AdminWorkViewBar } from "./admin-work-view-bar";

const FOCUS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_SCROLL_TOP = 1_000_000;

export type AdminClubsLedgerClub = {
  clubId: string;
  slug: string;
  name: string;
  status: string;
  publicVisibility: string;
  domainCount: number;
  domainActionRequiredCount: number;
  firstHostOnboardingState: string;
  href: string;
  severity: "critical" | "attention" | "ok";
  reasons: readonly string[];
};

export type AdminClubsLedgerFilters = {
  search?: string;
  lifecycle?: string;
  visibility?: string;
  domainStatus?: string;
  onboardingState?: string;
};

type FilterKey = Exclude<keyof AdminClubsLedgerFilters, "search">;

const TRIAGE_LABEL: Record<AdminClubsLedgerClub["severity"], string> = {
  critical: "긴급",
  attention: "주의",
  ok: "정상",
};

type Props = {
  clubs: readonly AdminClubsLedgerClub[];
  filters: AdminClubsLedgerFilters;
  searchDraft: string;
  pageState: AdminPageState;
  canCreateClub: boolean;
  onboardingHref: string;
  focusId: string | null;
  scrollTop: number;
  restoreKey?: string;
  onRestoreConsumed?: () => void;
  hasNextPage: boolean;
  loadingMore: boolean;
  loadMoreError?: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (key: FilterKey, value: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onScrollChange: (scrollTop: number) => void;
};

export function AdminClubsLedger({
  clubs,
  filters,
  searchDraft,
  pageState,
  canCreateClub,
  onboardingHref,
  focusId,
  scrollTop,
  restoreKey,
  onRestoreConsumed,
  hasNextPage,
  loadingMore,
  loadMoreError = false,
  onSearchChange,
  onFilterChange,
  onRetry,
  onLoadMore,
  onScrollChange,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const appliedRestoreKeyRef = useRef<string | null>(null);
  const safeFocusId =
    focusId && FOCUS_ID_PATTERN.test(focusId) ? focusId : null;
  const safeScrollTop =
    Number.isSafeInteger(scrollTop) &&
    scrollTop >= 0 &&
    scrollTop <= MAX_SCROLL_TOP
      ? scrollTop
      : 0;
  const effectiveRestoreKey =
    restoreKey ?? `${safeFocusId ?? ""}:${safeScrollTop}`;

  useEffect(() => {
    if (appliedRestoreKeyRef.current === effectiveRestoreKey) return;
    const target = safeFocusId
      ? document.getElementById(`admin-club-row-${safeFocusId}`)
      : null;
    if (safeFocusId && !target) {
      if (
        pageState === "ready" ||
        pageState === "empty" ||
        pageState === "unavailable"
      ) {
        appliedRestoreKeyRef.current = effectiveRestoreKey;
        onRestoreConsumed?.();
      }
      return;
    }
    if (!safeFocusId && safeScrollTop <= 0) {
      appliedRestoreKeyRef.current = effectiveRestoreKey;
      return;
    }
    const scroller = scrollerRef.current;
    if (scroller && safeScrollTop > 0) {
      scroller.scrollTop = safeScrollTop;
    }
    target?.focus();
    appliedRestoreKeyRef.current = effectiveRestoreKey;
    onRestoreConsumed?.();
  }, [
    clubs,
    effectiveRestoreKey,
    onRestoreConsumed,
    pageState,
    safeFocusId,
    safeScrollTop,
  ]);

  return (
    <div className="admin-clubs admin-clubs-ledger">
      <AdminPageContext
        eyebrow="Club registry"
        heading="클럽"
        description="서버가 검색·정렬한 클럽을 조치 신호와 함께 확인합니다."
        action={
          canCreateClub ? (
            <Link to={onboardingHref} className="btn btn-primary btn-sm">
              새 클럽
            </Link>
          ) : null
        }
      >
        <AdminWorkViewBar
          search={undefined}
          filters={
            <div className="admin-clubs__query" aria-label="클럽 목록 필터">
              <ClubSearchField
                key={filters.search ?? ""}
                initialValue={searchDraft}
                onSearch={onSearchChange}
              />
              <FilterSelect
                label="수명주기"
                value={filters.lifecycle ?? ""}
                onChange={(value) => onFilterChange("lifecycle", value)}
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
                onChange={(value) => onFilterChange("visibility", value)}
              >
                <option value="">전체</option>
                <option value="PUBLIC">공개</option>
                <option value="PRIVATE">비공개</option>
              </FilterSelect>
              <FilterSelect
                label="도메인 상태"
                value={filters.domainStatus ?? ""}
                onChange={(value) => onFilterChange("domainStatus", value)}
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
                onChange={(value) => onFilterChange("onboardingState", value)}
              >
                <option value="">전체</option>
                <option value="MISSING">없음</option>
                <option value="INVITED">초대됨</option>
                <option value="ASSIGNED">배정됨</option>
              </FilterSelect>
            </div>
          }
        />

        <AdminEvidenceLedger
          label="클럽 레지스트리"
          count={
            pageState === "loading" || pageState === "unavailable"
              ? undefined
              : clubs.length
          }
          state={pageState}
          title={
            pageState === "empty"
              ? "조건에 맞는 클럽이 없습니다."
              : pageState === "unavailable"
                ? "클럽 목록을 불러오지 못했습니다."
                : pageState === "loading"
                  ? "클럽을 불러오는 중입니다."
                  : undefined
          }
          description={
            pageState === "empty" ||
            pageState === "loading" ||
            pageState === "unavailable"
              ? ""
              : undefined
          }
          action={
            pageState === "unavailable" ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={onRetry}
              >
                다시 시도
              </button>
            ) : undefined
          }
        >
          {pageState === "ready" ? (
            <div
              ref={scrollerRef}
              className="admin-clubs__table-wrap admin-clubs-ledger__scroller"
              onScroll={(event) => {
                const next = event.currentTarget.scrollTop;
                onScrollChange(
                  Number.isSafeInteger(next) &&
                    next >= 0 &&
                    next <= MAX_SCROLL_TOP
                    ? next
                    : 0,
                );
              }}
            >
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
                  {clubs.map((club) => (
                    <tr
                      key={club.clubId}
                      className={`admin-clubs__row admin-clubs__row--${club.severity}`}
                      data-club-id={club.clubId}
                    >
                      <td data-label="상태 신호">
                        <span
                          className={`admin-clubs__triage admin-clubs__triage--${club.severity}`}
                        >
                          {TRIAGE_LABEL[club.severity]}
                        </span>
                        {club.reasons.length > 0 ? (
                          <span className="admin-clubs__triage-reasons">
                            {club.reasons.join(" · ")}
                          </span>
                        ) : null}
                      </td>
                      <td data-label="Slug">
                        <code>{club.slug}</code>
                      </td>
                      <td data-label="이름">
                        <Link
                          id={`admin-club-row-${club.clubId}`}
                          to={club.href}
                        >
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
                      <td data-label="호스트">
                        {club.firstHostOnboardingState}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </AdminEvidenceLedger>

        {hasNextPage ? (
          <div className="admin-clubs__load-more">
            {loadMoreError ? (
              <p className="danger" role="alert">
                다음 클럽을 불러오지 못했습니다. 현재 목록은 그대로 유지됩니다.
              </p>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={loadingMore}
              onClick={onLoadMore}
            >
              {loadingMore
                ? "불러오는 중"
                : loadMoreError
                  ? "다시 불러오기"
                  : "더 보기"}
            </button>
          </div>
        ) : null}
      </AdminPageContext>
    </div>
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
