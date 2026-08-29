import type { ComponentType, CSSProperties, MouseEventHandler, ReactNode } from "react";

export type ClubWorkspace = "member" | "host";

export type ClubNavigationItem = {
  slug: string;
  name: string;
  href: string;
};

export type WorkspaceNavigationItem = {
  id: ClubWorkspace;
  label: string;
  href: string;
  navigation?: "push" | "replace";
};

export type PrimaryNavigationIcon =
  | "home"
  | "session"
  | "notes"
  | "archive"
  | "notifications"
  | "me"
  | "host"
  | "edit"
  | "notify"
  | "invite"
  | "approve";

export type PrimaryNavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: PrimaryNavigationIcon;
  current: boolean;
  navigation?: "push" | "replace";
};

export type AccountMenuModel = {
  control: ReactNode;
};

export type ClubShellResponsiveSlot = {
  desktop: ReactNode;
  mobile?: ReactNode;
};

export type ClubShellBackTarget = {
  href: string;
  label: string;
  state?: unknown;
  icon?: PrimaryNavigationIcon | "brand";
};

export type ClubShellLinkProps = {
  to: string;
  replace?: boolean;
  state?: unknown;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
  "aria-current"?: "page" | "true";
  title?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

export type ClubShellLinkComponent = ComponentType<ClubShellLinkProps>;
