import { type CSSProperties } from "react";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import {
  eventLabels,
  eventOutboxStatusBadgeClass,
  eventOutboxStatusLabels,
  type HostNotificationEventItem,
} from "./notification-formatters";

export function NotificationEventLedger({ events }: { events: HostNotificationEventItem[] }) {
  if (events.length === 0) {
    return (
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        표시할 알림 이벤트가 없습니다.
      </p>
    );
  }

  return (
    <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
      {events.map((event, index) => (
        <NotificationEventRow key={event.id} event={event} isFirst={index === 0} />
      ))}
    </div>
  );
}

function NotificationEventRow({ event, isFirst }: { event: HostNotificationEventItem; isFirst: boolean }) {
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
            {eventLabels[event.eventType]}
          </strong>
          <span className={eventOutboxStatusBadgeClass(event.status)}>{event.status}</span>
        </div>
        <div className="tiny" style={{ color: "var(--text-2)", marginTop: 5 }}>
          <span>{eventOutboxStatusLabels[event.status]}</span>
          <span> · {Math.max(0, event.attemptCount)}회 시도</span>
        </div>
        <div className="tiny" style={{ color: "var(--text-3)", marginTop: 3 }}>
          생성 {formatDateOnlyLabel(event.createdAt)} · 업데이트 {formatDateOnlyLabel(event.updatedAt)}
        </div>
      </div>
    </article>
  );
}
