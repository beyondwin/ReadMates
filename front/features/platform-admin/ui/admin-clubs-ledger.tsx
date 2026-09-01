import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  ADMIN_COPY,
} from "@/features/platform-admin/model/admin-copy";
import type { ClubManagementRow } from "@/features/platform-admin/model/platform-admin-club-triage-model";
import type { AdminPageState } from "./admin-state-panel";
import { AdminEvidenceLedger } from "./admin-evidence-ledger";
import { AdminPageContext } from "./admin-page-context";
import { AdminTechnicalDisclosure } from "./admin-technical-disclosure";
import { AdminWorkViewBar } from "./admin-work-view-bar";

const FOCUS_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_SCROLL_TOP = 1_000_000;

export type AdminClubOperationsFacts = {
  hostsLabel: string;
  membersLabel: string;
  recordsLabel: string;
  domainLabel: string;
  reviewLabel: string;
  ageLabel: string;
};

export type AdminClubsTabCounts = {
  all: number;
  attention: number;
  operating: number;
};

export type AdminClubsLedgerClub = ClubManagementRow & {
  clubId: string;
  href: string;
  operationsFacts?: AdminClubOperationsFacts;
};

export type AdminClubsLedgerFilters = {
  search?: string;
  lifecycle?: string;
  visibility?: string;
  domainStatus?: string;
  onboardingState?: string;
};

type FilterKey = Exclude<keyof AdminClubsLedgerFilters, "search">;

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
  tabCounts?: AdminClubsTabCounts;
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
  tabCounts,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<"all" | "attention" | "operating">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const attentionClubs = clubs.filter((club) => club.emphasis === "actionable");
  const operatingClubs = clubs.filter((club) => club.emphasis !== "actionable");
  const counts = tabCounts ?? {
    all: clubs.length,
    attention: attentionClubs.length,
    operating: operatingClubs.length,
  };
  const visibleClubs = tab === "attention"
    ? attentionClubs
    : tab === "operating"
      ? operatingClubs
      : clubs;
  const selected = visibleClubs.find((club) => club.clubId === selectedId)
    ?? visibleClubs.find((club) => club.clubId === safeFocusId)
    ?? attentionClubs[0]
    ?? visibleClubs[0]
    ?? null;
  const filterFields = (
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
  );

  return (
    <div className="admin-clubs admin-clubs-ledger">
      <AdminPageContext
        heading="클럽 찾기"
        description={`운영 중인 클럽 ${counts.all}곳 중 확인할 곳이 ${counts.attention}곳 있습니다.`}
        action={
          canCreateClub ? (
            <Link to={onboardingHref} className="btn btn-primary btn-sm">
              새 클럽
            </Link>
          ) : null
        }
      >
        {pageState !== "ready" ? (
          <AdminEvidenceLedger
            label={ADMIN_COPY.heading.clubsLedger}
            count={undefined}
            state={pageState}
            title={
              pageState === "empty"
                ? "조건에 맞는 클럽이 없습니다."
                : pageState === "unavailable"
                  ? "클럽 목록을 불러오지 못했습니다."
                  : "클럽을 불러오는 중입니다."
            }
            description=""
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
          />
        ) : (
          <div className="admin-club-management">
            <div className="admin-club-management__split">
              <section className="admin-club-management__finder" aria-label="클럽 찾기">
                <p className="admin-club-management__title" aria-hidden="true">클럽 찾기</p>
                <details className="admin-club-management__filters">
                  <summary>필터와 검색</summary>
                  <AdminWorkViewBar search={undefined} filters={filterFields} />
                </details>
                <div className="admin-club-management__tabs" role="tablist" aria-label="클럽 찾기 구분">
                  {(
                    [
                      ["all", "전체", counts.all],
                      ["attention", "확인 필요", counts.attention],
                      ["operating", "운영 중", counts.operating],
                    ] as const
                  ).map(([id, label, count]) => (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={tab === id}
                      className="admin-club-management__tab"
                      onClick={() => setTab(id)}
                    >
                      {label}
                      <span>{count}</span>
                    </button>
                  ))}
                </div>
                <div
                  ref={scrollerRef}
                  className="admin-clubs-ledger__scroller"
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
                  <section className="admin-club-management__list-wrap" aria-label="클럽 관리 목록">
                  <ul className="admin-club-management__list">
                    {visibleClubs.map((club) => (
                      <li
                        key={club.clubId}
                        className="admin-club-management__row"
                        data-club-id={club.clubId}
                        data-emphasis={club.emphasis}
                        data-selected={club.clubId === selected?.clubId ? "true" : "false"}
                        onClick={() => setSelectedId(club.clubId)}
                      >
                        <div className="admin-club-management__identity">
                          <Link
                            id={`admin-club-row-${club.clubId}`}
                            to={club.href}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {club.name}
                          </Link>
                          <span className="admin-club-management__age">
                            {club.operationsFacts?.ageLabel ?? ""}
                          </span>
                        </div>
                        <dl className="admin-club-management__facts">
                          {club.operationsFacts?.ageLabel ? (
                            <div>
                              <dt>현재 상태</dt>
                              <dd>{club.operationsFacts.ageLabel}</dd>
                            </div>
                          ) : null}
                          {club.requiredAction ? (
                            <div className="admin-club-management__action">
                              <dt>필요한 조치</dt>
                              <dd>{club.requiredAction}</dd>
                            </div>
                          ) : (
                            <div>
                              <dt>운영 상태</dt>
                              <dd>{club.currentState}</dd>
                            </div>
                          )}
                          {club.recentSignal ? (
                            <div className="admin-club-management__signal">
                              <dt>최근 신호</dt>
                              <dd>{club.recentSignal}</dd>
                            </div>
                          ) : null}
                        </dl>
                        <AdminTechnicalDisclosure items={club.technicalDisclosure} />
                      </li>
                    ))}
                  </ul>
                  </section>
                </div>
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
              </section>
              <ClubDocket club={selected} />
            </div>
          </div>
        )}
      </AdminPageContext>
    </div>
  );
}

function ClubDocket({ club }: { club: AdminClubsLedgerClub | null }) {
  if (!club) {
    return (
      <aside className="admin-club-management__docket" aria-label="선택한 클럽" role="region">
        <p>클럽을 선택하세요.</p>
      </aside>
    );
  }
  const facts = club.operationsFacts;
  return (
    <aside className="admin-club-management__docket" aria-label="선택한 클럽" role="region">
      <p className="admin-club-management__docket-kicker">선택한 클럽</p>
      <h2>{club.name}</h2>
      <section>
        <h3>운영 상태</h3>
        <ul className="admin-club-management__ops">
          <li>{facts?.hostsLabel ?? "호스트"}</li>
          <li>{facts?.membersLabel ?? "멤버"}</li>
          <li>{facts?.recordsLabel ?? "공개 기록"}</li>
          <li>{facts?.domainLabel ?? club.currentState}</li>
        </ul>
      </section>
      {club.requiredAction || club.recentSignal ? (
        <section>
          <h3>확인할 내용</h3>
          <p>{facts?.reviewLabel ?? club.recentSignal ?? club.requiredAction}</p>
        </section>
      ) : null}
      <section>
        <h3>운영 상태 변경 검토</h3>
        <p>클럽의 공개 범위, 호스트 구성, 운영 지속 여부를 주기적으로 검토해 주세요.</p>
        <div className="admin-club-management__docket-actions">
          <Link to={club.href} className="btn btn-primary">운영 상태 변경 검토</Link>
          <Link to={club.href} className="btn btn-secondary">접근 권한 보기</Link>
          <Link to={club.href} className="btn btn-quiet">예시 데이터</Link>
        </div>
      </section>
      <AdminTechnicalDisclosure items={club.technicalDisclosure} />
    </aside>
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
