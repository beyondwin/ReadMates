import {
  Children,
  cloneElement,
  isValidElement,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from "react";

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
  return (
    <div
      className="admin-safe-action-dock__locked"
      onClickCapture={preventActivation}
      onPointerDownCapture={preventActivation}
      onKeyDownCapture={preventKeyActivation}
    >
      {disableInteractiveTree(primary)}
    </div>
  );
}

function preventActivation(event: SyntheticEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function preventKeyActivation(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
    preventActivation(event);
  }
}

function disableInteractiveTree(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) {
      return child;
    }
    const element = child as ReactElement<{
      children?: ReactNode;
      href?: string;
      disabled?: boolean;
      onClick?: unknown;
      tabIndex?: number;
    }>;
    const lockedProps: Record<string, unknown> = {};
    if (element.type === "button" || element.type === "input" || element.type === "select" || element.type === "textarea") {
      lockedProps.disabled = true;
      lockedProps.onClick = undefined;
    }
    if (element.type === "a") {
      lockedProps.href = undefined;
      lockedProps.role = "link";
      lockedProps["aria-disabled"] = true;
      lockedProps.tabIndex = -1;
      lockedProps.onClick = undefined;
    }
    if (element.props.children === undefined) {
      return cloneElement(element, lockedProps);
    }
    return cloneElement(element, lockedProps, disableInteractiveTree(element.props.children));
  });
}
