"use client";

import { Link } from "@/src/app/router-link";
import { usePublicAuthenticated, type PublicAuthAction } from "@/shared/ui/public-auth-action-state";

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
