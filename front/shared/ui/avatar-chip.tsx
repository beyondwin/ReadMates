import type { CSSProperties } from "react";
import type { RsvpStatus } from "@/shared/api/readmates";
import { avatarInitial } from "@/shared/ui/avatar-chip-utils";
import { displayText } from "@/shared/ui/readmates-display";

const avatarTones = [
  { background: "var(--accent-soft)", color: "var(--accent)", border: "var(--accent-line)" },
  { background: "var(--ok-soft)", color: "var(--ok)", border: "color-mix(in oklch, var(--ok), transparent 70%)" },
  { background: "var(--warn-soft)", color: "var(--warn)", border: "color-mix(in oklch, var(--warn), transparent 70%)" },
  { background: "var(--bg-deep)", color: "var(--text-2)", border: "var(--line-soft)" },
];

function hashText(value: string) {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash;
}

export function AvatarChip({
  name,
  fallbackInitial,
  label,
  rsvpStatus,
  size = 24,
}: {
  name: string | null | undefined;
  fallbackInitial?: string | null;
  label?: string;
  rsvpStatus?: RsvpStatus;
  size?: number;
}) {
  const safeLabel = displayText(label, displayText(name, "멤버"));
  const initial = avatarInitial(name, fallbackInitial);
  const tone = avatarTones[hashText(safeLabel) % avatarTones.length];
  const isPending = rsvpStatus === "NO_RESPONSE";

  return (
    <span
      aria-label={safeLabel}
      title={safeLabel}
      data-rsvp-status={rsvpStatus}
      style={
        {
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: "999px",
          background: tone.background,
          border: `1px solid ${tone.border}`,
          color: tone.color,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: `${Math.max(10, size * 0.42)}px`,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          flexShrink: 0,
          opacity: isPending ? 0.55 : 1,
        } as CSSProperties
      }
    >
      {initial}
    </span>
  );
}
