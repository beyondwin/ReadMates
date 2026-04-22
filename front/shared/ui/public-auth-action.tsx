"use client";

import type { ReactNode } from "react";
import { Link } from "@/src/app/router-link";
import { usePublicAuthenticated, type PublicAuthAction } from "@/shared/ui/public-auth-action-state";

export const PUBLIC_INVITE_ACCEPTANCE_LABEL = "초대 수락하기";
export const PUBLIC_INVITE_ACCEPTANCE_GUIDANCE = "초대 메일의 개인 링크에서만 열립니다.";

export function PublicGuestOnlyLink({
  action,
  className,
}: {
  action: PublicAuthAction;
  className?: string;
}) {
  const authenticated = usePublicAuthenticated();

  if (authenticated) {
    return null;
  }

  return (
    <Link to={action.href} className={className}>
      {action.label}
    </Link>
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
