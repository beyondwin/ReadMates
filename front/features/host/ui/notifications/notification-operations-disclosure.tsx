import { type FormEvent, useEffect, useRef, useState } from "react";
import type { ManualNotificationDispatchListItem } from "@/features/host/model/host-view-types";
import { ManualNotificationDispatchLedger } from "./manual-notification-dispatch-ledger";
import { NotificationLedgerTabs } from "./notification-ledger-tabs";
import {
  type HostNotificationDeliveryItem,
  type HostNotificationEventItem,
  type HostNotificationSummary,
  type NotificationLedgerTab,
  type NotificationTestMailAuditItem,
} from "./notification-formatters";
import { NotificationTestMailTool } from "./notification-test-mail-tool";

export type NotificationOperationsDisclosureProps = {
  summary: HostNotificationSummary;
  events: HostNotificationEventItem[];
  deliveries: HostNotificationDeliveryItem[];
  manualDispatches: ManualNotificationDispatchListItem[];
  audit: NotificationTestMailAuditItem[];
  retryPendingId: string | null;
  restorePendingId: string | null;
  disabled: boolean;
  hasMoreEvents: boolean;
  hasMoreDeliveries: boolean;
  hasMoreManualDispatches: boolean;
  hasMoreAudit: boolean;
  isLoadingMoreEvents: boolean;
  isLoadingMoreDeliveries: boolean;
  isLoadingMoreManualDispatches: boolean;
  isLoadingMoreAudit: boolean;
  testMailValue: string;
  testMailPending: boolean;
  onTestMailValueChange: (value: string) => void;
  onSubmitTestMail: (event: FormEvent<HTMLFormElement>) => void;
  onRetry: (item: HostNotificationDeliveryItem) => void;
  onRestore: (item: HostNotificationDeliveryItem) => void;
  onLoadMoreEvents?: () => Promise<unknown>;
  onLoadMoreDeliveries?: () => Promise<unknown>;
  onLoadMoreManualDispatches?: () => Promise<unknown>;
  onLoadMoreAudit?: () => Promise<unknown>;
};

const issueStatuses = new Set(["PENDING", "FAILED", "DEAD"]);
const healthyIssueSignature = "summary:0:0:0";

// This deterministic UI-state signature is part of the disclosure's public contract.
// eslint-disable-next-line react-refresh/only-export-components
export function notificationIssueSignature(
  summary: HostNotificationSummary,
  events: HostNotificationEventItem[],
  deliveries: HostNotificationDeliveryItem[],
) {
  const eventIssues = events
    .filter((item) => issueStatuses.has(item.status))
    .map((item) => `event:${item.id}:${item.status}`)
    .sort();
  const deliveryIssues = deliveries
    .filter((item) => issueStatuses.has(item.status))
    .map((item) => `delivery:${item.id}:${item.status}`)
    .sort();

  return [
    `summary:${Math.max(0, summary.pending)}:${Math.max(0, summary.failed)}:${Math.max(0, summary.dead)}`,
    ...eventIssues,
    ...deliveryIssues,
  ].join("|");
}

export function NotificationOperationsDisclosure({
  summary,
  events,
  deliveries,
  manualDispatches,
  audit,
  retryPendingId,
  restorePendingId,
  disabled,
  hasMoreEvents,
  hasMoreDeliveries,
  hasMoreManualDispatches,
  hasMoreAudit,
  isLoadingMoreEvents,
  isLoadingMoreDeliveries,
  isLoadingMoreManualDispatches,
  isLoadingMoreAudit,
  testMailValue,
  testMailPending,
  onTestMailValueChange,
  onSubmitTestMail,
  onRetry,
  onRestore,
  onLoadMoreEvents,
  onLoadMoreDeliveries,
  onLoadMoreManualDispatches,
  onLoadMoreAudit,
}: NotificationOperationsDisclosureProps) {
  const issueSignature = notificationIssueSignature(summary, events, deliveries);
  const hasIssues = issueSignature !== healthyIssueSignature;
  const hasActionableDelivery = deliveries.some((item) => issueStatuses.has(item.status));
  const [open, setOpen] = useState(hasIssues);
  const [activeTab, setActiveTab] = useState<NotificationLedgerTab>(
    hasActionableDelivery ? "deliveries" : "events",
  );
  const previousIssueSignature = useRef(issueSignature);

  useEffect(() => {
    const isNewIssue = hasIssues && issueSignature !== previousIssueSignature.current;
    if (isNewIssue) {
      setOpen(true);
      setActiveTab(hasActionableDelivery ? "deliveries" : "events");
    }
    previousIssueSignature.current = issueSignature;
  }, [hasActionableDelivery, hasIssues, issueSignature]);

  return (
    <section className="rm-notification-operations-disclosure">
      <button
        type="button"
        className="rm-notification-operations-disclosure__toggle"
        aria-expanded={open}
        aria-controls="notification-operations-detail"
        onClick={() => setOpen((value) => !value)}
      >
        <span>운영 상세</span>
        <span>대기 {summary.pending} · 실패 {summary.failed} · 중단 {summary.dead}</span>
      </button>

      {open ? (
        <div id="notification-operations-detail" className="rm-notification-operations-disclosure__detail">
          <ManualNotificationDispatchLedger
            variant="full"
            dispatches={manualDispatches}
            hasMore={hasMoreManualDispatches}
            loading={isLoadingMoreManualDispatches}
            onLoadMore={onLoadMoreManualDispatches}
          />
          <NotificationLedgerTabs
            events={events}
            deliveries={deliveries}
            activeLedgerTab={activeTab}
            retryPendingId={retryPendingId}
            restorePendingId={restorePendingId}
            disabled={disabled}
            hasMoreEvents={hasMoreEvents}
            hasMoreDeliveries={hasMoreDeliveries}
            isLoadingMoreEvents={isLoadingMoreEvents}
            isLoadingMoreDeliveries={isLoadingMoreDeliveries}
            onActiveLedgerTabChange={setActiveTab}
            onRetry={onRetry}
            onRestore={onRestore}
            onLoadMoreEvents={onLoadMoreEvents}
            onLoadMoreDeliveries={onLoadMoreDeliveries}
          />
          <NotificationTestMailTool
            value={testMailValue}
            audit={audit}
            disabled={disabled}
            pending={testMailPending}
            hasMore={hasMoreAudit}
            loadingMore={isLoadingMoreAudit}
            onValueChange={onTestMailValueChange}
            onSubmit={onSubmitTestMail}
            onLoadMore={onLoadMoreAudit}
          />
        </div>
      ) : null}
    </section>
  );
}
