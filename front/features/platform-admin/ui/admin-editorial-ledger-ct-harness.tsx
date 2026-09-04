import type { PropsWithChildren } from "react";
import { AdminOperationStateActions } from "./admin-operation-state-actions";
import { AdminTodayLedger } from "./admin-today-ledger";
import { noopEditorialLedgerHandler, type TodayLedgerFixture } from "./admin-editorial-ledger.fixtures";
import "./admin-shell.css";
import "./admin-page-patterns.css";
import "./admin-editorial-ledger.css";
import "./admin-today.css";
import "./admin-club-management.css";

export function AdminEditorialLedgerCtHarness({ children }: PropsWithChildren) {
  return <div style={{ width: "100%" }}>{children}</div>;
}

export function TodayLedgerCtNode({ fixture }: { fixture: TodayLedgerFixture }) {
  const lifecycleControls = fixture.allowedActions.length > 0 ? (
    <AdminOperationStateActions
      allowedActions={fixture.allowedActions}
      pending={false}
      disabled={fixture.actionState !== "ready"}
      message={
        fixture.actionState === "unknown-outcome"
          ? { kind: "unknown-outcome", text: fixture.actionReason ?? "결과를 확인하지 못했습니다." }
          : null
      }
      actionCopy={fixture.actionCopy}
      onAcknowledge={noopEditorialLedgerHandler}
      onSnooze={noopEditorialLedgerHandler}
      onResolve={noopEditorialLedgerHandler}
    />
  ) : null;
  const mobileLifecycleControls = fixture.allowedActions.length > 0 ? (
    <AdminOperationStateActions
      allowedActions={fixture.allowedActions}
      pending={false}
      disabled={fixture.actionState !== "ready"}
      message={
        fixture.actionState === "unknown-outcome"
          ? { kind: "unknown-outcome", text: fixture.actionReason ?? "결과를 확인하지 못했습니다." }
          : null
      }
      presentation="prioritized"
      actionCopy={fixture.actionCopy}
      onAcknowledge={noopEditorialLedgerHandler}
      onSnooze={noopEditorialLedgerHandler}
      onResolve={noopEditorialLedgerHandler}
    />
  ) : null;
  return (
    <AdminTodayLedger
      view={fixture.view}
      auditHref="/admin/audit"
      filters={fixture.filters}
      history={fixture.history}
      lifecycleControls={lifecycleControls}
      mobileLifecycleControls={mobileLifecycleControls}
      actionState={fixture.actionState}
      actionReason={fixture.actionReason}
      pendingCount={fixture.pendingCount}
      urgentCount={fixture.urgentCount}
      urgentAnnouncement={fixture.urgentAnnouncement}
      hasNextPage={fixture.hasNextPage}
      loadingMore={fixture.loadingMore}
      mode={fixture.mode}
      query={fixture.query}
      workView={fixture.workView}
      onFilterChange={noopEditorialLedgerHandler}
      onSelectCase={noopEditorialLedgerHandler}
      onViewChange={noopEditorialLedgerHandler}
      onQueryChange={noopEditorialLedgerHandler}
      onApplyPending={noopEditorialLedgerHandler}
      onBackToList={noopEditorialLedgerHandler}
      onRetrySource={noopEditorialLedgerHandler}
      onClearFilters={noopEditorialLedgerHandler}
    />
  );
}
