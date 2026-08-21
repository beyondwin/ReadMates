import type { ComponentType, ReactNode } from "react";

export type HostLinkProps = {
  to: string;
  className?: string;
  state?: unknown;
  children: ReactNode;
  "aria-label"?: string;
};

export type HostLinkComponent = ComponentType<HostLinkProps>;
