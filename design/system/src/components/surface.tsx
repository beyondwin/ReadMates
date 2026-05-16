import type { HTMLAttributes } from "react";
import { cx } from "./classnames";

export type SurfaceTone = "default" | "quiet" | "readingDesk" | "documentPanel";

export type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  tone?: SurfaceTone;
};

const toneClassName: Record<SurfaceTone, string> = {
  default: "surface",
  quiet: "surface-quiet",
  readingDesk: "rm-reading-desk",
  documentPanel: "rm-document-panel",
};

export function Surface({ tone = "default", className, ...props }: SurfaceProps) {
  return <div {...props} className={cx(toneClassName[tone], className)} />;
}

export function Divider({ soft = false }: { soft?: boolean }) {
  return <hr className={soft ? "divider-soft" : "divider"} />;
}
