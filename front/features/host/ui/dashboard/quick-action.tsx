import type { CSSProperties } from "react";
import type { ReadmatesReturnState, ReadmatesReturnTarget } from "@/shared/routing/readmates-route-state";
import type { HostDashboardLinkComponent, QuickActionIcon } from "./types";

export function QuickAction({
  icon,
  label,
  href,
  unavailableReason,
  disabledStatusLabel,
  index,
  LinkComponent,
  hostDashboardReturnTarget,
  readmatesReturnState,
}: {
  icon: QuickActionIcon;
  label: string;
  href: string | null;
  unavailableReason: string;
  disabledStatusLabel: string;
  index: number;
  LinkComponent: HostDashboardLinkComponent;
  hostDashboardReturnTarget: ReadmatesReturnTarget;
  readmatesReturnState: (target: ReadmatesReturnTarget) => ReadmatesReturnState;
}) {
  const style = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "12px 14px",
    borderRadius: "6px",
    textAlign: "left" as const,
    borderTop: index > 0 ? "1px solid var(--line-soft)" : "none",
  };

  if (href) {
    return (
      <LinkComponent to={href} state={readmatesReturnState(hostDashboardReturnTarget)} style={style}>
        <Icon name={icon} size={14} style={{ color: "var(--text-3)" }} />
        <span className="body" style={{ fontSize: "13.5px", flex: 1 }}>
          {label}
        </span>
        <Icon name="arrow-right" size={13} style={{ color: "var(--text-4)" }} />
      </LinkComponent>
    );
  }

  return (
    <button
      type="button"
      disabled
      aria-label={`${label} ${disabledStatusLabel}: ${unavailableReason}`}
      style={{
        ...style,
        color: "var(--text-3)",
        cursor: "not-allowed",
      }}
    >
      <Icon name={icon} size={14} style={{ color: "var(--text-4)" }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="body" style={{ display: "block", fontSize: "13.5px" }}>
          {label}
        </span>
        <span className="tiny" style={{ display: "block", marginTop: 2, color: "var(--text-3)" }}>
          {unavailableReason}
        </span>
      </span>
      <span className="badge">{disabledStatusLabel}</span>
    </button>
  );
}

function Icon({
  name,
  size = 16,
  style,
}: {
  name: QuickActionIcon | "arrow-right";
  size?: number;
  style?: CSSProperties;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    style,
  };

  switch (name) {
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M4 10h12M11 5l5 5-5 5" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M4 10.5l4 4L16 6" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M4 16h3l8-8-3-3-8 8v3zM12 5l3 3" />
        </svg>
      );
    case "notes":
      return (
        <svg {...common}>
          <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
          <path d="M12 3v3h3M7 10h6M7 13h4" />
        </svg>
      );
  }
}
