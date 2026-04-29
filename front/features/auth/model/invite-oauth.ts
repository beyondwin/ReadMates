import type { InvitationPreviewView } from "@/features/auth/model/auth-model";

type InviteLocation = Pick<Location, "hostname" | "origin" | "pathname">;

export function googleInviteHref(
  token: string,
  preview: InvitationPreviewView | null,
  currentLocation: InviteLocation = window.location,
) {
  const returnTo = inviteReturnTo(token, preview, currentLocation);
  return returnTo
    ? `/oauth2/authorization/google?inviteToken=${encodeURIComponent(token)}&returnTo=${encodeURIComponent(returnTo)}`
    : `/oauth2/authorization/google?inviteToken=${encodeURIComponent(token)}`;
}

function inviteReturnTo(token: string, preview: InvitationPreviewView | null, currentLocation: InviteLocation) {
  if (!preview?.canonicalPath) {
    return null;
  }
  if (
    currentLocation.origin.startsWith("http") &&
    !isLocalhost(currentLocation.hostname) &&
    (currentLocation.pathname === `/invite/${token}` || currentLocation.pathname === preview.canonicalPath)
  ) {
    return `${currentLocation.origin}${currentLocation.pathname}`;
  }

  return preview.canonicalPath;
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
