import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./classnames";

export type BadgeTone =
  | "default"
  | "accent"
  | "warn"
  | "ok"
  | "pending"
  | "success"
  | "warning"
  | "locked"
  | "readonly";

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
};

const toneClassName: Record<BadgeTone, string> = {
  default: "",
  accent: "badge-accent",
  warn: "badge-warn",
  ok: "badge-ok",
  pending: "badge-pending",
  success: "badge-success",
  warning: "badge-warning",
  locked: "badge-locked",
  readonly: "badge-readonly",
};

export function Badge({ tone = "default", dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span {...props} className={cx("badge", toneClassName[tone], dot && "badge-dot", className)}>
      {children}
    </span>
  );
}
