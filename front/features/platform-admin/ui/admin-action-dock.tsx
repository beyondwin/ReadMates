import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

export type AdminCommandLevel = "L1" | "L2" | "L3";
export type AdminSafeActionState =
  | "ready"
  | "pending"
  | "stale"
  | "conflict"
  | "unknown-outcome"
  | "complete"
  | "forbidden";

export type AdminActionDockProps = {
  primary?: ReactNode;
  secondary?: ReactNode;
  status?: ReactNode;
};

export type AdminSafeActionDockProps = {
  level: AdminCommandLevel;
  authority: "allowed" | "denied";
  state: AdminSafeActionState;
  reason?: ReactNode;
  primary?: ReactNode;
  secondary?: ReactNode;
  status?: ReactNode;
};

const LOCKED_STATES = new Set<AdminSafeActionState>([
  "pending",
  "stale",
  "conflict",
  "unknown-outcome",
  "complete",
  "forbidden",
]);

export function AdminActionDock({ primary, secondary, status }: AdminActionDockProps) {
  return (
    <div className="admin-action-dock" role="group" aria-label="작업">
      {status ? <div className="admin-action-dock__status">{status}</div> : null}
      {secondary ? <div className="admin-action-dock__secondary">{secondary}</div> : null}
      {primary ? <div className="admin-action-dock__primary">{primary}</div> : null}
    </div>
  );
}

export function AdminSafeActionDock({
  level,
  authority,
  state,
  reason,
  primary,
  secondary,
  status,
}: AdminSafeActionDockProps) {
  const locked = authority === "denied" || LOCKED_STATES.has(state);
  return (
    <div
      className="admin-safe-action-dock"
      data-level={level}
      data-state={state}
      data-authority={authority}
    >
      <AdminActionDock
        primary={locked ? lockPrimary(primary) : primary}
        secondary={secondary}
        status={
          (reason != null && reason !== false) || (status != null && status !== false) ? (
            <>
              {reason != null && reason !== false ? (
                <div className="admin-safe-action-dock__reason">{reason}</div>
              ) : null}
              {status}
            </>
          ) : null
        }
      />
    </div>
  );
}

function lockPrimary(primary: ReactNode): ReactNode {
  if (primary == null || primary === false) {
    return null;
  }
  if (isValidElement(primary)) {
    return cloneElement(primary as ReactElement<{ disabled?: boolean; onClick?: unknown }>, {
      disabled: true,
      onClick: undefined,
    });
  }
  return primary;
}
