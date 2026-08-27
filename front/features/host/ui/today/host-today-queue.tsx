import { useState } from "react";
import { HOST_TODAY_QUEUE_CAP, type HostTodayQueueItem } from "@/features/host/model/host-today-model";
import type { HostLinkComponent, HostLinkProps } from "@/features/host/ui/host-link-types";

function DefaultLink({ to, children, ...props }: HostLinkProps) {
  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

const KIND_LABEL: Record<HostTodayQueueItem["kind"], string> = {
  record: "기록",
  notification: "알림",
  readiness: "준비",
};

export function HostTodayQueue({
  items,
  totalCount,
  emptyCheckedAtLabel,
  widgetError = false,
  onRetry,
  LinkComponent = DefaultLink,
}: {
  items: readonly HostTodayQueueItem[];
  totalCount: number;
  emptyCheckedAtLabel: string | null;
  widgetError?: boolean;
  onRetry?: () => void;
  LinkComponent?: HostLinkComponent;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleItems = expanded ? items : items.slice(0, HOST_TODAY_QUEUE_CAP);
  return (
    <section className="rm-host-today__queue" aria-label="처리할 일">
      <div className="rm-host-today__queue-head">
        <h2 className="rm-host-today__section-title">처리할 일</h2>
        <span className="tiny mono rm-host-today__queue-count">{totalCount}건</span>
      </div>

      {widgetError ? (
        <div className="rm-host-editorial-ledger__state" role="alert">
          <span>처리할 일 목록을 불러오지 못했습니다.</span>
          {onRetry ? (
            <button type="button" className="btn btn-ghost rm-host-today__action" onClick={onRetry}>
              다시 시도
            </button>
          ) : null}
        </div>
      ) : null}

      {!widgetError && items.length === 0 ? (
        <p className="small rm-host-today__queue-empty">
          오늘 처리할 일이 없습니다 · 마지막 확인 {emptyCheckedAtLabel ?? "—"}
        </p>
      ) : null}

      {visibleItems.length > 0 ? (
        <ul className="rm-host-today__queue-list">
          {visibleItems.map((item) => (
            <li key={item.id} className="rm-host-today__queue-row">
              <span className={`rm-host-today__kind rm-host-today__kind--${item.kind}`}>
                {KIND_LABEL[item.kind]}
              </span>
              <div className="rm-host-today__queue-copy">
                <div className="rm-host-today__queue-title">{item.title}</div>
                <div className="small rm-host-today__queue-detail">{item.detail}</div>
              </div>
              <span className="tiny mono rm-host-today__queue-aged">{item.agedLabel}</span>
              <LinkComponent
                to={item.resolveHref}
                className="btn btn-ghost btn-sm rm-host-today__resolve"
              >
                {item.resolveLabel}
              </LinkComponent>
            </li>
          ))}
        </ul>
      ) : null}

      {!widgetError && !expanded && items.length > HOST_TODAY_QUEUE_CAP ? (
        <button
          type="button"
          className="rm-host-today__queue-all"
          onClick={() => setExpanded(true)}
        >
          전체 보기
        </button>
      ) : null}
    </section>
  );
}
