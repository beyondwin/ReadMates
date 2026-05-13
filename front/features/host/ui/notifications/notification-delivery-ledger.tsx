import { type CSSProperties } from "react";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import {
  deliveryStatusBadgeClass,
  deliveryStatusLabels,
  type HostNotificationDeliveryItem,
  maskRecipient,
  shortId,
} from "./notification-formatters";

export function NotificationDeliveryLedger({
  deliveries,
  retryPendingId,
  restorePendingId,
  disabled,
  onRetry,
  onRestore,
}: {
  deliveries: HostNotificationDeliveryItem[];
  retryPendingId: string | null;
  restorePendingId: string | null;
  disabled: boolean;
  onRetry: (item: HostNotificationDeliveryItem) => void;
  onRestore: (item: HostNotificationDeliveryItem) => void;
}) {
  if (deliveries.length === 0) {
    return (
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        표시할 알림 배송 기록이 없습니다.
      </p>
    );
  }

  return (
    <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
      {deliveries.map((delivery, index) => (
        <NotificationDeliveryRow
          key={delivery.id}
          item={delivery}
          isFirst={index === 0}
          retryPending={retryPendingId === delivery.id}
          restorePending={restorePendingId === delivery.id}
          disabled={disabled}
          onRetry={() => onRetry(delivery)}
          onRestore={() => onRestore(delivery)}
        />
      ))}
    </div>
  );
}

function NotificationDeliveryRow({
  item,
  isFirst,
  retryPending,
  restorePending,
  disabled,
  onRetry,
  onRestore,
}: {
  item: HostNotificationDeliveryItem;
  isFirst: boolean;
  retryPending: boolean;
  restorePending: boolean;
  disabled: boolean;
  onRetry: () => void;
  onRestore: () => void;
}) {
  const canRetry = item.status === "PENDING" || item.status === "FAILED";
  const canRestore = item.status === "DEAD";

  return (
    <article
      className="row-between"
      style={{
        gap: 14,
        alignItems: "center",
        padding: "14px 0",
        borderTop: isFirst ? undefined : "1px solid var(--line-soft)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong className="body" style={{ minWidth: 0 }}>
            {item.channel}
          </strong>
          <span className={deliveryStatusBadgeClass(item.status)}>{item.status}</span>
        </div>
        <div className="tiny" style={{ color: "var(--text-2)", marginTop: 5 }}>
          <span>{maskRecipient(item.recipientEmail)}</span>
          <span> · {deliveryStatusLabels[item.status]} · </span>
          <span>{Math.max(0, item.attemptCount)}회 시도</span>
        </div>
        <div className="tiny" style={{ color: "var(--text-3)", marginTop: 3 }}>
          이벤트 {shortId(item.eventId)} · 업데이트 {formatDateOnlyLabel(item.updatedAt)}
        </div>
      </div>
      <div className="row" style={{ gap: 8, flex: "0 0 auto" }}>
        {canRetry ? (
          <button className="btn btn-quiet btn-sm" type="button" disabled={disabled} onClick={onRetry}>
            {retryPending ? "재시도 중" : "재시도"}
          </button>
        ) : null}
        {canRestore ? (
          <button className="btn btn-quiet btn-sm" type="button" disabled={disabled} onClick={onRestore}>
            {restorePending ? "복구 중" : "복구"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
