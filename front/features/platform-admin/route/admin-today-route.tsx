import type { ReactNode } from "react";
import { ADMIN_TODAY_PRIORITY_LIMIT } from "@/features/platform-admin/model/platform-admin-operations-model";
import {
  AdminOperationStateActions,
  APPROVED_TODAY_ACTION_COPY,
} from "@/features/platform-admin/ui/admin-operation-state-actions";
import { AdminPageFrame } from "@/features/platform-admin/ui/admin-page-frame";
import { AdminStatePanel, type AdminPageState } from "@/features/platform-admin/ui/admin-state-panel";
import {
  ADMIN_TODAY_DESCRIPTION,
  ADMIN_TODAY_HEADING,
  AdminTodayLedger,
} from "@/features/platform-admin/ui/admin-today-ledger";
import { useAdminTodayController } from "./use-admin-today-controller";

export function AdminTodayRoute() {
  const controller = useAdminTodayController();

  if (controller.status === "forbidden") {
    return (
      <TodayBoundary
        state="forbidden"
        title="권한이 없습니다"
        description="현재 역할로 운영 케이스를 확인할 수 없습니다. 권한을 확인해 주세요."
      />
    );
  }

  if (controller.status === "capabilities-unavailable") {
    return (
      <TodayBoundary
        state="unavailable"
        title="운영 케이스를 불러오지 못했습니다"
        description="잠시 뒤 다시 시도해 주세요."
        action={(
          <button
            type="button"
            className="btn btn-primary"
            onClick={controller.retryCapabilities}
          >
            다시 시도
          </button>
        )}
      />
    );
  }

  if (controller.status === "loading") {
    return (
      <TodayBoundary
        state="loading"
        title="운영 케이스를 불러오는 중입니다."
        description=""
      />
    );
  }

  if (controller.status === "list-unavailable" || !controller.view) {
    return (
      <TodayBoundary
        state="unavailable"
        title="운영 케이스를 불러오지 못했습니다"
        description="잠시 뒤 다시 시도해 주세요."
        action={(
          <button
            type="button"
            className="btn btn-primary"
            onClick={controller.retrySource}
          >
            다시 시도
          </button>
        )}
      />
    );
  }

  const currentCase = controller.view.selectedCase;
  const lifecycleControls = !controller.permissionDenied
    && currentCase
    && (currentCase.allowedActions.length > 0 || controller.actionMessage) ? (
      <AdminOperationStateActions
        allowedActions={currentCase.allowedActions}
        pending={controller.pending}
        disabled={controller.actionDisabled}
        message={controller.actionMessage}
        confirmationKey={controller.confirmationKey}
        actionCopy={APPROVED_TODAY_ACTION_COPY}
        onAcknowledge={() => void controller.acknowledgeCurrent()}
        onSnooze={(snoozedUntil) => void controller.snoozeCurrent(snoozedUntil)}
        onResolve={() => void controller.resolveCurrent()}
      />
    ) : null;
  const mobileLifecycleControls = !controller.permissionDenied
    && currentCase
    && (currentCase.allowedActions.length > 0 || controller.actionMessage) ? (
      <AdminOperationStateActions
        allowedActions={currentCase.allowedActions}
        pending={controller.pending}
        disabled={controller.actionDisabled}
        message={controller.actionMessage}
        confirmationKey={controller.confirmationKey}
        presentation="prioritized"
        actionCopy={APPROVED_TODAY_ACTION_COPY}
        onAcknowledge={() => void controller.acknowledgeCurrent()}
        onSnooze={(snoozedUntil) => void controller.snoozeCurrent(snoozedUntil)}
        onResolve={() => void controller.resolveCurrent()}
      />
    ) : null;
  const auditHref = currentCase?.clubId
    ? `/admin/audit?target=${encodeURIComponent(currentCase.clubId)}`
    : "/admin/audit";

  return (
    <AdminTodayLedger
      view={controller.view}
      auditHref={auditHref}
      filters={controller.filters}
      history={controller.history}
      lifecycleControls={lifecycleControls}
      mobileLifecycleControls={mobileLifecycleControls}
      detailLoading={controller.detailLoading}
      detailUnavailable={controller.detailUnavailable}
      permissionDenied={controller.permissionDenied}
      refreshing={controller.refreshing}
      mode={controller.searchState.mode}
      query={controller.searchState.query}
      workView={controller.searchState.workView}
      pendingCount={controller.pendingCount}
      urgentCount={controller.urgentCount}
      urgentAnnouncement={controller.urgentAnnouncement}
      actionState={controller.actionState}
      actionReason={controller.actionReason}
      onFilterChange={controller.changeFilter}
      onSelectCase={(caseId, options) => controller.selectCase(
        caseId,
        options?.mode ?? controller.searchState.mode,
      )}
      onBackToList={controller.backToList}
      onViewChange={controller.changeView}
      onQueryChange={controller.changeQuery}
      onApplyPending={controller.acceptPending}
      hasNextPage={controller.hasNextPage}
      loadingMore={controller.loadingMore}
      onLoadMore={controller.loadMore}
      onRetrySource={controller.retrySource}
      onClearFilters={controller.clearFilters}
      visibleLimit={ADMIN_TODAY_PRIORITY_LIMIT}
      queueExpanded={controller.queueExpanded}
      onShowAll={controller.showAllQueue}
    />
  );
}

function TodayBoundary({
  state,
  title,
  description,
  action,
}: {
  state: Extract<AdminPageState, "loading" | "forbidden" | "unavailable">;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <AdminPageFrame heading={ADMIN_TODAY_HEADING} description={ADMIN_TODAY_DESCRIPTION}>
      <AdminStatePanel state={state} title={title} description={description} action={action} />
    </AdminPageFrame>
  );
}
