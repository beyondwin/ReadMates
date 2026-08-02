import type { CSSProperties, ReactNode } from "react";

export type GuestSurfaceLinkProps = {
  to: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  "aria-label"?: string;
};
