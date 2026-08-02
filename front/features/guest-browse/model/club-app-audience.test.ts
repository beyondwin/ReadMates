import { describe, expect, it } from "vitest";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { deriveClubAppAudience, guestNavigationCapability } from "./club-app-audience";

function auth(overrides: Partial<AuthMeResponse>): AuthMeResponse {
  return {
    authenticated: false,
    userId: null,
    membershipId: null,
    clubId: null,
    email: null,
    displayName: null,
    accountName: null,
    role: null,
    membershipStatus: null,
    approvalState: "ANONYMOUS",
    ...overrides,
  };
}

describe("club app audience", () => {
  it.each([
    [false, null, null, "GUEST"],
    [true, "VIEWER", "MEMBER", "VIEWER"],
    [true, "ACTIVE", "MEMBER", "MEMBER"],
    [true, "ACTIVE", "HOST", "HOST"],
    [true, "SUSPENDED", "MEMBER", "GUEST"],
  ] as const)("derives %s/%s/%s as %s", (authenticated, membershipStatus, role, expected) => {
    expect(deriveClubAppAudience(auth({ authenticated, membershipStatus, role }))).toBe(expected);
  });

  it.each([
    ["/clubs/alpha/app", "OPEN"],
    ["/clubs/alpha/app/session/current", "OPEN"],
    ["/clubs/alpha/app/notes", "OPEN"],
    ["/clubs/alpha/app/notes?sessionId=session-8&filter=highlights", "OPEN"],
    ["/clubs/alpha/app/archive/session-8", "OPEN"],
    ["/clubs/alpha/app/sessions/session-8", "OPEN"],
    ["/clubs/alpha/app/me", "PREVIEW"],
    ["/clubs/alpha/app/me/records", "PREVIEW"],
    ["/clubs/alpha/app/me/settings", "LOCKED"],
    ["/clubs/alpha/app/notifications/settings", "LOCKED"],
    ["/clubs/alpha/app/feedback/session-8", "LOCKED"],
    ["/clubs/alpha/app/host/members", "DENY"],
    ["/app/new-feature", "LOCKED"],
  ] as const)("maps %s to %s", (path, expected) => {
    expect(guestNavigationCapability(path)).toBe(expected);
  });
});
