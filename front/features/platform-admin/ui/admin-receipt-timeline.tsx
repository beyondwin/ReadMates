import type { ReactNode } from "react";

export type AdminReceiptTimelineEntry = {
  key: string;
  label: ReactNode;
  state: "pending" | "succeeded" | "failed" | "unknown";
  occurredAt?: string;
  detail?: ReactNode;
};

export type AdminReceiptTimelineProps = {
  level: "L2" | "L3";
  receiptId: string;
  entries: readonly AdminReceiptTimelineEntry[];
  convergence?: ReactNode;
};

export function AdminReceiptTimeline({
  level,
  receiptId,
  entries,
  convergence,
}: AdminReceiptTimelineProps) {
  if (level !== "L2" && level !== "L3") {
    return null;
  }

  return (
    <section className="admin-receipt-timeline" aria-label="명령 기록">
      <p className="admin-receipt-timeline__id">{receiptId}</p>
      <ol className="admin-receipt-timeline__entries">
        {entries.map((entry) => (
          <li
            key={entry.key}
            className={`admin-receipt-timeline__entry admin-receipt-timeline__entry--${entry.state}`}
          >
            <span className="admin-receipt-timeline__label">{entry.label}</span>
            {entry.occurredAt ? (
              <time className="admin-receipt-timeline__time" dateTime={entry.occurredAt}>
                {entry.occurredAt}
              </time>
            ) : null}
            {entry.detail != null && entry.detail !== false ? (
              <div className="admin-receipt-timeline__detail">{entry.detail}</div>
            ) : null}
          </li>
        ))}
      </ol>
      {level === "L3" && convergence != null && convergence !== false ? (
        <div className="admin-receipt-timeline__convergence">{convergence}</div>
      ) : null}
    </section>
  );
}
