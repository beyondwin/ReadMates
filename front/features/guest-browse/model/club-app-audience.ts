import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

export type ClubAppAudience = "GUEST" | "VIEWER" | "MEMBER" | "HOST";
export type GuestNavigationCapability = "OPEN" | "PREVIEW" | "LOCKED" | "DENY";

export const GUEST_NAVIGATION = {
  home: "OPEN",
  current: "OPEN",
  notes: "OPEN",
  archive: "OPEN",
  sessionDetail: "OPEN",
  mySpace: "PREVIEW",
  myRecords: "PREVIEW",
  settings: "LOCKED",
  notifications: "LOCKED",
  feedback: "LOCKED",
  host: "DENY",
} as const satisfies Record<string, GuestNavigationCapability>;

export function deriveClubAppAudience(auth: AuthMeResponse): ClubAppAudience {
  if (!auth.authenticated) {
    return "GUEST";
  }

  if (auth.membershipStatus === "VIEWER") {
    return "VIEWER";
  }

  if (auth.membershipStatus === "ACTIVE") {
    return auth.role === "HOST" ? "HOST" : "MEMBER";
  }

  return "GUEST";
}

function appPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  const scoped = /^\/clubs\/[^/]+(\/app(?:\/.*)?$)/.exec(pathname);
  return scoped?.[1] ?? pathname;
}

export function guestNavigationCapability(path: string): GuestNavigationCapability {
  const normalized = appPath(path).replace(/\/+$/, "") || "/app";

  if (normalized === "/app" || normalized === "/app/") return GUEST_NAVIGATION.home;
  if (normalized === "/app/session/current") return GUEST_NAVIGATION.current;
  if (normalized === "/app/notes" || normalized.startsWith("/app/notes/")) return GUEST_NAVIGATION.notes;
  if (normalized === "/app/archive" || normalized.startsWith("/app/archive/")) return GUEST_NAVIGATION.archive;
  if (normalized.startsWith("/app/sessions/")) return GUEST_NAVIGATION.sessionDetail;
  if (normalized === "/app/me") return GUEST_NAVIGATION.mySpace;
  if (normalized === "/app/me/records") return GUEST_NAVIGATION.myRecords;
  if (normalized === "/app/me/settings") return GUEST_NAVIGATION.settings;
  if (normalized === "/app/notifications" || normalized.startsWith("/app/notifications/")) return GUEST_NAVIGATION.notifications;
  if (normalized.startsWith("/app/feedback/")) return GUEST_NAVIGATION.feedback;
  if (normalized === "/app/host" || normalized.startsWith("/app/host/")) return GUEST_NAVIGATION.host;

  return "LOCKED";
}
