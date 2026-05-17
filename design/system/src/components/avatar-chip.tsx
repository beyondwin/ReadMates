import type { HTMLAttributes } from "react";
import { cx } from "./classnames";

export type AvatarChipSize = "sm" | "md" | "lg";
export type AvatarChipTone = "default" | "muted";

export type AvatarChipProps = HTMLAttributes<HTMLSpanElement> & {
  name: string;
  meta?: string;
  initials?: string;
  size?: AvatarChipSize;
  tone?: AvatarChipTone;
};

const sizeClassName: Record<AvatarChipSize, string> = {
  sm: "rm-avatar-chip-group--sm",
  md: "rm-avatar-chip-group--md",
  lg: "rm-avatar-chip-group--lg",
};

const toneClassName: Record<AvatarChipTone, string> = {
  default: "",
  muted: "rm-avatar-chip-group--muted",
};

function deriveInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "RM";
  }

  if (parts.length === 1) {
    return Array.from(parts[0]).slice(0, 2).join("").toUpperCase();
  }

  return parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join("")
    .toUpperCase();
}

export function AvatarChip({
  name,
  meta,
  initials,
  size = "md",
  tone = "default",
  className,
  ...props
}: AvatarChipProps) {
  return (
    <span
      {...props}
      aria-label={name}
      className={cx("rm-avatar-chip-group", sizeClassName[size], toneClassName[tone], className)}
    >
      <span className="rm-avatar-chip" aria-hidden="true">
        {initials ?? deriveInitials(name)}
      </span>
      <span className="rm-avatar-chip-group__text">
        <span className="rm-avatar-chip-group__name">{name}</span>
        {meta ? <span className="rm-avatar-chip-group__meta">{meta}</span> : null}
      </span>
    </span>
  );
}
