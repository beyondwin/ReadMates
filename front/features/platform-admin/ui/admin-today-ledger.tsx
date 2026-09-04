import { useLayoutEffect, type ReactNode } from "react";
import {
  beginAdminEditorialLedgerCaseSelection,
  beginAdminEditorialLedgerFilterCommit,
  commitAdminEditorialLedgerFilterRaf,
  commitAdminEditorialLedgerFirstUsable,
  commitAdminEditorialLedgerPollMergeRaf,
} from "@/shared/observability/admin-editorial-ledger-performance";
import { ADMIN_COPY } from "@/features/platform-admin/model/admin-copy";
import type {
  AdminOperationsSearchMode,
  AdminOperationsView,
  AdminOperationsWorkViewId,
} from "@/features/platform-admin/model/platform-admin-operations-model";
import type { AdminSafeActionState } from "./admin-action-dock";
import type { AdminPageState, AdminStateSource } from "./admin-state-panel";
import { AdminOperationMobileDetail } from "./admin-operation-mobile-detail";
import { AdminOperationsInspector, type AdminCaseTraversal } from "./admin-operations-inspector";
import { AdminOperationsQueue } from "./admin-operations-queue";
import { AdminPageContext } from "./admin-page-context";
import { AdminStatePanel } from "./admin-state-panel";
import { AdminTodayControls, type AdminTodayFilters } from "./admin-today-controls";
import { useAdminContentWidth } from "./use-admin-content-width";

export const ADMIN_TODAY_HEADING = "오늘 할 일";
export const ADMIN_TODAY_DESCRIPTION =
  "감지된 운영 신호를 영향과 최신성에 따라 확인하고 상태를 기록합니다.";

export type { AdminTodayFilters };

type HistoryEvent = {
  fromState: string | null;
  toState: string;
  action: string | null;
  reasonCode: string;
  occurredAt: string;
  caseVersion: number;
};

type Props = {
  view: AdminOperationsView;
  auditHref: string;
  filters: AdminTodayFilters;
  history: readonly HistoryEvent[];
  lifecycleControls: ReactNode;
  mobileLifecycleControls?: ReactNode;
  detailLoading?: boolean;
  detailUnavailable?: boolean;
  permissionDenied?: boolean;
  refreshing?: boolean;
  hasNextPage?: boolean;
  loadingMore?: boolean;
  mode?: AdminOperationsSearchMode;
  query?: string;
  workView?: AdminOperationsWorkViewId;
  pendingCount?: number;
  urgentCount?: number;
  urgentAnnouncement?: string | null;
  actionState?: AdminSafeActionState;
  actionReason?: ReactNode;
  onFilterChange: (key: keyof AdminTodayFilters, value: string) => void;
  onSelectCase: (caseId: string, options?: { mode?: AdminOperationsSearchMode }) => void;
  onLoadMore?: () => void;
  onRetrySource?: (sourceType: AdminOperationsView["sources"][number]["sourceType"]) => void;
  onClearFilters?: () => void;
  onViewChange?: (id: string) => void;
  onQueryChange?: (value: string) => void;
  onApplyPending?: () => void;
  onBackToList?: () => void;
  visibleLimit?: number;
  queueExpanded?: boolean;
  onShowAll?: () => void;
};

export function AdminTodayLedger({
  view,
  auditHref,
  filters,
  history,
  lifecycleControls,
  mobileLifecycleControls,
  detailLoading = false,
  detailUnavailable = false,
  permissionDenied = false,
  refreshing = false,
  hasNextPage = false,
  loadingMore = false,
  mode,
  query = "",
  workView = "briefing",
  pendingCount = 0,
  urgentCount = 0,
  urgentAnnouncement = null,
  actionState,
  actionReason,
  onFilterChange,
  onSelectCase,
  onLoadMore,
  onRetrySource,
  onClearFilters,
  onViewChange,
  onQueryChange,
  onApplyPending,
  onBackToList,
  visibleLimit,
  queueExpanded = false,
  onShowAll,
}: Props) {
  const { ref: ledgerRef, layout: contentLayout, width: contentWidth } = useAdminContentWidth<HTMLDivElement>();
  const flowLayout = contentLayout === "flow";
  const filtered = hasActiveTodayFilters(filters) || Boolean(query.trim());
  const pageState = deriveTodayPageState(view);

  const selectDocketCase = (caseId: string) => {
    beginAdminEditorialLedgerCaseSelection(caseId);
    onSelectCase(caseId, flowLayout ? { mode: "detail" } : undefined);
  };
  const traversal = buildTodayCaseTraversal(view.items, view.selectedCaseId, selectDocketCase);

  useLayoutEffect(() => {
    const control = ledgerRef.current?.querySelector<HTMLElement>(
      `input[type='search'][aria-label='${ADMIN_COPY.search.loadedCases}']`,
    );
    if (control) commitAdminEditorialLedgerFirstUsable();
  }, [ledgerRef, view.items.length, view.generatedAt]);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      commitAdminEditorialLedgerFilterRaf();
      commitAdminEditorialLedgerPollMergeRaf();
    });
    return () => cancelAnimationFrame(frame);
  }, [view.generatedAt, view.items, view.selectedCaseId]);

  const emptyCopy = filtered
    ? {
        title: "조건에 맞는 운영 케이스가 없습니다",
        description: "필터를 바꾸면 다른 케이스를 볼 수 있습니다.",
      }
    : {
        title: "지금은 처리할 운영 케이스가 없습니다",
        description: "새로운 신호가 생기면 여기에 나타납니다.",
      };
  const failedSources = view.sources
    .filter((source) => isFetchFailedTodaySource(source.status))
    .map((source): AdminStateSource => ({
      id: source.sourceType,
      label: source.sourceLabel,
      available: false,
    }));

  const inspector = (
    <AdminOperationsInspector
      selectedCase={view.selectedCase}
      auditHref={auditHref}
      history={history}
      lifecycleControls={lifecycleControls}
      detailLoading={detailLoading}
      detailUnavailable={detailUnavailable}
      permissionDenied={permissionDenied}
      actionState={actionState}
      actionReason={actionReason}
      traversal={traversal}
    />
  );

  const queueControls = (
    <AdminTodayControls
      defaultOpen={view.items.length === 0 && filtered}
      workViews={view.workViews}
      activeView={workView}
      query={query}
      filters={filters}
      pendingCount={pendingCount}
      urgentCount={urgentCount}
      refreshing={refreshing}
      urgentAnnouncement={urgentAnnouncement}
      onViewChange={onViewChange ?? (() => undefined)}
      onQueryChange={(value) => {
        beginAdminEditorialLedgerFilterCommit();
        onQueryChange?.(value);
      }}
      onFilterChange={onFilterChange}
      onApplyPending={onApplyPending}
    >
      {view.sources.length > 0 ? (
        <section className="admin-operation-sources" aria-labelledby="admin-operation-sources-title">
          <header className="admin-operation-sources__header">
            <h3 id="admin-operation-sources-title">신호 상태</h3>
            <p>{view.sourceStatusLabel}</p>
          </header>
          <ul className="admin-operation-sources__list">
            {view.sources.map((source) => (
              <li key={source.sourceType} data-source-status={source.status.toLowerCase()}>
                <div>
                  <strong>{source.sourceLabel}</strong>
                  <span className="admin-operation-wrap">{source.message}</span>
                </div>
                {source.canRetry && onRetrySource ? (
                  <button
                    type="button"
                    className="btn btn-secondary admin-operation-control--touch"
                    onClick={() => onRetrySource(source.sourceType)}
                  >
                    {source.sourceLabel} 다시 확인
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AdminTodayControls>
  );

  const workSurface = view.items.length === 0 ? null : flowLayout ? (
    <AdminOperationMobileDetail
      view={view}
      auditHref={auditHref}
      history={history}
      lifecycleControls={mobileLifecycleControls ?? lifecycleControls}
      queueControls={queueControls}
      detailLoading={detailLoading}
      detailUnavailable={detailUnavailable}
      permissionDenied={permissionDenied}
      actionState={actionState}
      actionReason={actionReason}
      traversal={traversal}
      mode={mode}
      onSelectCase={(caseId, options) => {
        beginAdminEditorialLedgerCaseSelection(caseId);
        onSelectCase(caseId, options);
      }}
      onBack={onBackToList}
      hasNextPage={hasNextPage}
      loadingMore={loadingMore}
      onLoadMore={onLoadMore}
      visibleLimit={visibleLimit}
      expanded={queueExpanded}
      onShowAll={onShowAll}
      showBack={mode !== "detail"}
    />
  ) : (
    <div className="admin-today-ledger__columns">
      <AdminOperationsQueue
        items={view.items}
        selectedCaseId={view.selectedCaseId}
        onSelectCase={(caseId) => {
          beginAdminEditorialLedgerCaseSelection(caseId);
          onSelectCase(caseId);
        }}
        hasNextPage={hasNextPage}
        loadingMore={loadingMore}
        onLoadMore={onLoadMore}
        visibleLimit={visibleLimit}
        expanded={queueExpanded}
        onShowAll={onShowAll}
        secondaryControls={queueControls}
      />
      {inspector}
    </div>
  );

  const detailMode = flowLayout && mode === "detail";
  const detailBack = detailMode && onBackToList ? (
    <button
      type="button"
      className="admin-operation-mobile-detail__back admin-operation-control--touch"
      aria-label="목록으로"
      onClick={onBackToList}
    >
      <span aria-hidden="true">오늘 할 일</span>
    </button>
  ) : null;

  return (
    <AdminPageContext
      eyebrow={detailMode ? false : "오늘"}
      heading={detailMode ? (view.selectedCase?.summary.title ?? false) : ADMIN_TODAY_HEADING}
      description={detailMode ? false : ADMIN_TODAY_DESCRIPTION}
      freshness={detailMode ? false : `${view.generatedAtLabel} 기준`}
      scope={detailMode ? false : view.sourceStatusLabel}
      leading={detailBack}
      action={detailMode ? false : (
        <p
          className="admin-today-ledger__summary"
          tabIndex={-1}
          aria-label="운영 케이스 요약"
        >
          {view.mobileSummary.open} · {view.mobileSummary.critical} · {view.mobileSummary.assignedToMe}
        </p>
      )}
    >
      <div
        className="admin-today-ledger"
        ref={ledgerRef}
        data-content-layout={contentLayout}
        data-content-width={contentWidth}
      >
        {view.items.length === 0 ? queueControls : null}

        <AdminStatePanel
          state={pageState}
          title={pageState === "empty" ? emptyCopy.title : undefined}
          description={pageState === "empty" ? emptyCopy.description : undefined}
          sources={pageState === "partial" ? failedSources : undefined}
          action={
            pageState === "empty" && filtered && onClearFilters ? (
              <button type="button" className="btn btn-secondary" onClick={onClearFilters}>
                필터 지우기
              </button>
            ) : null
          }
        >
          {workSurface}
        </AdminStatePanel>
      </div>
    </AdminPageContext>
  );
}

function hasActiveTodayFilters(filters: AdminTodayFilters): boolean {
  return Boolean(filters.state || filters.severity || filters.source || filters.assignee);
}

function isFetchFailedTodaySource(status: AdminOperationsView["sources"][number]["status"]): boolean {
  return status === "PARTIAL" || status === "UNAVAILABLE";
}

function deriveTodayPageState(view: AdminOperationsView): AdminPageState {
  if (view.sources.some((source) => isFetchFailedTodaySource(source.status))) return "partial";
  if (view.items.length === 0) return "empty";
  return "ready";
}

function buildTodayCaseTraversal(
  items: readonly { id: string }[],
  selectedCaseId: string | null,
  onSelect: (caseId: string) => void,
): AdminCaseTraversal | undefined {
  if (!selectedCaseId || items.length === 0) return undefined;
  const index = items.findIndex((item) => item.id === selectedCaseId);
  if (index < 0) return undefined;
  return {
    index,
    total: items.length,
    onPrev: index > 0 ? () => onSelect(items[index - 1]!.id) : null,
    onNext: index < items.length - 1 ? () => onSelect(items[index + 1]!.id) : null,
  };
}
