import { useState, type ComponentType, type ReactNode } from "react";
import type { HostWorkboxItemView } from "@/features/host/model/host-workbox-model";
import { ReadmatesIcon, ReadmatesIconBadge } from "@/shared/ui/icon";
import { workItemIcon } from "./host-work-item-icon";

export type HostWorkboxDeferralOption = "TOMORROW" | "THREE_DAYS" | "NEXT_WEEK";

type WorkItemLinkProps = {
  to: string;
  className?: string;
  children: ReactNode;
};

const DefaultLink: ComponentType<WorkItemLinkProps> = ({ to, children, ...props }) => (
  <a {...props} href={to}>{children}</a>
);

export type HostWorkItemProps = {
  item: HostWorkboxItemView;
  error?: string | null;
  pending?: boolean;
  now?: Date;
  showDeferral?: boolean;
  onDefer?: (key: string, option: HostWorkboxDeferralOption) => void;
  onUndoDeferral?: (key: string) => void;
  LinkComponent?: ComponentType<WorkItemLinkProps>;
};

export function HostWorkItem({
  item,
  error = null,
  pending = false,
  now = new Date(),
  showDeferral = false,
  onDefer,
  onUndoDeferral,
  LinkComponent = DefaultLink,
}: HostWorkItemProps) {
  const [deferralOption, setDeferralOption] = useState<HostWorkboxDeferralOption>("TOMORROW");
  const due = dueLabel(item, now);
  const icon = workItemIcon(item.type);

  return (
    <li className="rm-host-work-item" aria-label={item.title} data-state={item.state}>
      <LinkComponent to={item.destinationHref} className="rm-host-work-item__destination">
        <ReadmatesIconBadge name={icon.name} tone={icon.tone} size={40} />
        <strong className="rm-host-work-item__title">{item.title}</strong>
        <span className="rm-host-work-item__meta" aria-hidden="true">
          <span>{item.countLabel}</span>
          {due ? <span data-overdue={due === "기한 지남" ? "true" : undefined}>{due}</span> : null}
        </span>
        <ReadmatesIcon name="chevron-right" size={16} />
      </LinkComponent>

      {showDeferral && item.state === "NOW" && onDefer ? (
        <div className="rm-host-work-item__deferral">
          <label>
            <span className="rm-sr-only">{item.title} 보류 기간</span>
            <select
              aria-label={`${item.title} 보류 기간`}
              value={deferralOption}
              disabled={pending}
              onChange={(event) => setDeferralOption(event.currentTarget.value as HostWorkboxDeferralOption)}
            >
              <option value="TOMORROW">내일 오전 9시</option>
              <option value="THREE_DAYS">3일 뒤 오전 9시</option>
              <option value="NEXT_WEEK">7일 뒤 오전 9시</option>
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={() => onDefer(item.key, deferralOption)}
            aria-label={`${item.title} 보류`}
          >
            {pending ? "보류 중" : "보류"}
          </button>
        </div>
      ) : null}

      {showDeferral && item.state === "DEFERRED" && onUndoDeferral ? (
        <button
          type="button"
          className="rm-host-work-item__undo"
          disabled={pending}
          onClick={() => onUndoDeferral(item.key)}
          aria-label={`${item.title} 보류 해제`}
        >
          {pending ? "해제 중" : "지금 다시 보기"}
        </button>
      ) : null}

      {error ? <p className="rm-host-work-item__error" role="alert">{error}</p> : null}
    </li>
  );
}

function dueLabel(item: HostWorkboxItemView, now: Date): string | null {
  if (item.state === "NOW" && item.dueAt !== null && new Date(item.dueAt).getTime() < now.getTime()) {
    return "기한 지남";
  }
  if (item.dueAt) return formatDateTime(item.dueAt);
  return null;
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
