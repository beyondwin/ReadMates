import type { HTMLAttributes, ReactNode } from "react";
import { Badge } from "./badge";
import { cx } from "./classnames";

export type StatePanelProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
};

export type LockedStateReason = "memberOnly" | "pending" | "closed";

export type LockedStateProps = StatePanelProps & {
  reason?: LockedStateReason;
};

const reasonClassName: Record<LockedStateReason, string> = {
  memberOnly: "rm-state--locked",
  pending: "rm-state--pending",
  closed: "rm-state--readonly",
};

const reasonLabel: Record<LockedStateReason, string> = {
  memberOnly: "멤버 전용",
  pending: "승인 대기",
  closed: "닫힘",
};

export function EmptyState({ title, description, action, compact = false, className, ...props }: StatePanelProps) {
  return (
    <div
      {...props}
      role="status"
      className={cx("rm-empty-state", "rm-state-panel", compact && "rm-state-panel--compact", className)}
    >
      <div className="rm-state-panel__content">
        <h3 className="h4">{title}</h3>
        {description ? <p className="small">{description}</p> : null}
      </div>
      {action ? <div className="rm-state-panel__action">{action}</div> : null}
    </div>
  );
}

export function LockedState({
  title,
  description,
  action,
  compact = false,
  reason = "memberOnly",
  className,
  ...props
}: LockedStateProps) {
  return (
    <div
      {...props}
      role="status"
      className={cx(
        "rm-locked-state",
        "rm-state-panel",
        "rm-state",
        reasonClassName[reason],
        compact && "rm-state-panel--compact",
        className,
      )}
    >
      <div className="rm-state-panel__content">
        <Badge tone={reason === "pending" ? "pending" : "locked"}>{reasonLabel[reason]}</Badge>
        <h3 className="h4">{title}</h3>
        {description ? <p className="small">{description}</p> : null}
      </div>
      {action ? <div className="rm-state-panel__action">{action}</div> : null}
    </div>
  );
}
