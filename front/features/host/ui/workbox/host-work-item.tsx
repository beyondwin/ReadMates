import type { ComponentType, ReactNode } from "react";
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
  now?: Date;
  LinkComponent?: ComponentType<WorkItemLinkProps>;
};

export function HostWorkItem({
  item,
  error = null,
  now = new Date(),
  LinkComponent = DefaultLink,
}: HostWorkItemProps) {
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
