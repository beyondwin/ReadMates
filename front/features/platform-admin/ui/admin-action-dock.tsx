import type { ReactNode } from "react";

export type AdminActionDockProps = {
  primary?: ReactNode;
  secondary?: ReactNode;
  status?: ReactNode;
};

export function AdminActionDock({ primary, secondary, status }: AdminActionDockProps) {
  return (
    <div className="admin-action-dock" role="group" aria-label="작업">
      {status ? <div className="admin-action-dock__status">{status}</div> : null}
      {secondary ? <div className="admin-action-dock__secondary">{secondary}</div> : null}
      {primary ? <div className="admin-action-dock__primary">{primary}</div> : null}
    </div>
  );
}
