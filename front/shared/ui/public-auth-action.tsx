"use client";

import type { ComponentType, ReactNode } from "react";
import { usePublicAuthenticated, type PublicAuthAction } from "@/shared/ui/public-auth-action-state";

export const PUBLIC_INVITE_ACCEPTANCE_LABEL = "초대 수락하기";
export const PUBLIC_INVITE_ACCEPTANCE_GUIDANCE = "초대 메일의 개인 링크에서만 열립니다.";

export type AppLinkProps = {
  to: string;
  resetScroll?: boolean;
  className?: string;
  children: ReactNode;
};

export type AppLinkComponent = ComponentType<AppLinkProps>;

function DefaultLink({ to, resetScroll: _resetScroll, children, ...props }: AppLinkProps) {
  void _resetScroll;

  return (
    <a {...props} href={to}>
      {children}
    </a>
  );
}

export function PublicGuestOnlyLink({
  action,
  className,
  LinkComponent = DefaultLink,
}: {
  action: PublicAuthAction;
  className?: string;
  LinkComponent?: AppLinkComponent;
}) {
  const authenticated = usePublicAuthenticated();

  if (authenticated) {
    return null;
  }

  return (
    <LinkComponent to={action.href} className={className}>
      {action.label}
    </LinkComponent>
  );
}

export function PublicGuestOnlyActions({ children }: { children: ReactNode }) {
  const authenticated = usePublicAuthenticated();

  if (authenticated) {
    return null;
  }

  return children;
}

export function PublicInviteGuidance({ className = "btn btn-ghost public-invite-guidance" }: { className?: string }) {
  return (
    <button type="button" className={className} disabled aria-disabled="true">
      <span>{PUBLIC_INVITE_ACCEPTANCE_LABEL}</span>
      <span className="public-invite-guidance__note">{PUBLIC_INVITE_ACCEPTANCE_GUIDANCE}</span>
    </button>
  );
}
