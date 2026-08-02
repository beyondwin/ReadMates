import type { ComponentType } from "react";
import type { GuestCurrentSessionResponse } from "@/features/guest-browse/api/guest-browse-contracts";
import type { GuestCurrentSessionContentProps } from "@/features/guest-browse/route/guest-scoped-app-route";
import type { GuestSurfaceLinkProps } from "@/features/guest-browse/ui/guest-surfaces";
import { guestCurrentSessionReadPage } from "@/features/current-session/model/current-session-read-view";
import { CurrentSessionPage } from "@/features/current-session/ui/current-session-page";
import type { CurrentSessionInternalLinkProps } from "@/features/current-session/ui/current-session-types";

function guestCurrentSessionInternalLink(LinkComponent: ComponentType<GuestSurfaceLinkProps>) {
  return function GuestCurrentSessionInternalLink({ href, ...props }: CurrentSessionInternalLinkProps) {
    return <LinkComponent to={href} {...props} />;
  };
}

export function GuestCurrentSessionContent({ data, LinkComponent }: GuestCurrentSessionContentProps) {
  const page = guestCurrentSessionReadPage(data as GuestCurrentSessionResponse);
  return <CurrentSessionPage data={page} internalLinkComponent={guestCurrentSessionInternalLink(LinkComponent)} />;
}
