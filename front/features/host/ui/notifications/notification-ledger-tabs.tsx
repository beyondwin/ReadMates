import { type KeyboardEvent as ReactKeyboardEvent } from "react";
import { NotificationDeliveryLedger } from "./notification-delivery-ledger";
import { NotificationEventLedger } from "./notification-event-ledger";
import {
  type HostNotificationDeliveryItem,
  type HostNotificationEventItem,
  type NotificationLedgerTab,
  notificationLedgerTabs,
} from "./notification-formatters";

export function NotificationLedgerTabs({
  events,
  deliveries,
  activeLedgerTab,
  retryPendingId,
  restorePendingId,
  disabled,
  hasMoreEvents,
  hasMoreDeliveries,
  isLoadingMoreEvents,
  isLoadingMoreDeliveries,
  onActiveLedgerTabChange,
  onRetry,
  onRestore,
  onLoadMoreEvents,
  onLoadMoreDeliveries,
}: {
  events: HostNotificationEventItem[];
  deliveries: HostNotificationDeliveryItem[];
  activeLedgerTab: NotificationLedgerTab;
  retryPendingId: string | null;
  restorePendingId: string | null;
  disabled: boolean;
  hasMoreEvents: boolean;
  hasMoreDeliveries: boolean;
  isLoadingMoreEvents: boolean;
  isLoadingMoreDeliveries: boolean;
  onActiveLedgerTabChange: (tab: NotificationLedgerTab) => void;
  onRetry: (item: HostNotificationDeliveryItem) => void;
  onRestore: (item: HostNotificationDeliveryItem) => void;
  onLoadMoreEvents?: () => Promise<unknown>;
  onLoadMoreDeliveries?: () => Promise<unknown>;
}) {
  return (
    <section className="surface" aria-labelledby="notification-items-title" style={{ padding: 22 }}>
      <div className="row-between" style={{ gap: 14, alignItems: "baseline", marginBottom: 12 }}>
        <h2 id="notification-items-title" className="h3 editorial" style={{ margin: 0 }}>
          운영 장부
        </h2>
        <span className="tiny mono" style={{ color: "var(--text-3)" }}>
          이벤트 {events.length}건 · 배송 {deliveries.length}건
        </span>
      </div>

      <div
        role="tablist"
        aria-label="알림 운영 장부"
        onKeyDown={(event) => handleLedgerTabKeyDown(event, activeLedgerTab, onActiveLedgerTabChange)}
        style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}
      >
        {notificationLedgerTabs.map((tab) => {
          const selected = activeLedgerTab === tab.key;

          return (
            <button
              key={tab.key}
              id={`host-notifications-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`host-notifications-panel-${tab.key}`}
              className={`btn btn-sm ${selected ? "btn-primary" : "btn-quiet"}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onActiveLedgerTabChange(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <section
        id={`host-notifications-panel-${activeLedgerTab}`}
        role="tabpanel"
        aria-labelledby={`host-notifications-tab-${activeLedgerTab}`}
      >
        {activeLedgerTab === "events" ? (
          <NotificationEventLedger events={events} />
        ) : (
          <NotificationDeliveryLedger
            deliveries={deliveries}
            retryPendingId={retryPendingId}
            restorePendingId={restorePendingId}
            disabled={disabled}
            onRetry={onRetry}
            onRestore={onRestore}
          />
        )}
        {activeLedgerTab === "events" && hasMoreEvents && onLoadMoreEvents ? (
          <LoadMoreButton loading={isLoadingMoreEvents} onLoadMore={onLoadMoreEvents} />
        ) : null}
        {activeLedgerTab === "deliveries" && hasMoreDeliveries && onLoadMoreDeliveries ? (
          <LoadMoreButton loading={isLoadingMoreDeliveries} onLoadMore={onLoadMoreDeliveries} />
        ) : null}
      </section>
    </section>
  );
}

function LoadMoreButton({ loading, onLoadMore }: { loading: boolean; onLoadMore: () => Promise<unknown> }) {
  return (
    <button
      type="button"
      className="btn btn-quiet btn-sm"
      disabled={loading}
      style={{ marginTop: 12 }}
      onClick={() => void onLoadMore()}
    >
      {loading ? "불러오는 중" : "더 보기"}
    </button>
  );
}

function handleLedgerTabKeyDown(
  event: ReactKeyboardEvent<HTMLDivElement>,
  activeTab: NotificationLedgerTab,
  setActiveTab: (tab: NotificationLedgerTab) => void,
) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    return;
  }

  event.preventDefault();

  const currentIndex = notificationLedgerTabs.findIndex((tab) => tab.key === activeTab);
  const lastIndex = notificationLedgerTabs.length - 1;
  let nextIndex = currentIndex;

  if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = lastIndex;
  } else if (event.key === "ArrowLeft") {
    nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1;
  } else {
    nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1;
  }

  const nextTab = notificationLedgerTabs[nextIndex]?.key;

  if (nextTab) {
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(`host-notifications-tab-${nextTab}`)?.focus();
    });
  }
}
