import type { CSSProperties } from "react";
import type { SaveScope, SaveState } from "@/features/current-session/ui/current-session-types";
import { getCurrentSessionSaveStatusLabel } from "@/features/current-session/model/current-session-view-model";

export function SaveFeedback({ scope, status }: { scope: SaveScope; status: SaveState }) {
  const label = getCurrentSessionSaveStatusLabel(scope, status);

  return (
    <span
      role="status"
      aria-live="polite"
      className="tiny"
      style={{
        color: status === "error" ? "var(--danger)" : status === "saved" ? "var(--ok)" : "var(--text-3)",
        minWidth: "88px",
        textAlign: "right",
      }}
    >
      {label}
    </span>
  );
}

export function Icon({
  name,
  size = 14,
  style,
}: {
  name: "arrow-up-right" | "chevron-down" | "mic";
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
    style,
    "aria-hidden": true,
  };

  if (name === "arrow-up-right") {
    return (
      <svg {...common}>
        <path d="M7 5h8v8" />
        <path d="M5 15 15 5" />
      </svg>
    );
  }

  if (name === "chevron-down") {
    return (
      <svg {...common}>
        <path d="M5 8l5 5 5-5" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M10 4v7" />
      <path d="M7 8v2a3 3 0 0 0 6 0V8" />
      <path d="M6 10a4 4 0 0 0 8 0" />
      <path d="M10 14v3" />
    </svg>
  );
}
