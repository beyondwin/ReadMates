import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse, MembershipStatus } from "@/shared/auth/auth-contracts";
import { loadMemberAppAuth } from "@/shared/auth/member-app-loader";
import {
  canEditOwnProfile,
  canReadMemberContent,
  canUseHostApp,
  canUseMemberApp,
  canWriteMemberActivity,
} from "@/shared/auth/member-app-access";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, "", "/");
});

const readableStatuses: MembershipStatus[] = ["VIEWER", "ACTIVE", "SUSPENDED"];
const blockedStatuses: MembershipStatus[] = ["LEFT", "INACTIVE", "INVITED"];

function authForStatus(membershipStatus: MembershipStatus, overrides: Partial<AuthMeResponse> = {}): AuthMeResponse {
  const approvalState =
    membershipStatus === "VIEWER" || membershipStatus === "ACTIVE" || membershipStatus === "SUSPENDED"
      ? membershipStatus
      : "INACTIVE";

  return {
    authenticated: true,
    userId: `${membershipStatus.toLowerCase()}-user`,
    membershipId: `${membershipStatus.toLowerCase()}-membership`,
    clubId: "club-id",
    email: `${membershipStatus.toLowerCase()}@example.com`,
    displayName: `${membershipStatus} member`,
    accountName: membershipStatus,
    role: "MEMBER",
    membershipStatus,
    approvalState,
    ...overrides,
  };
}

const anonymousAuth: AuthMeResponse = {
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
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("member app access helpers", () => {
  it.each(readableStatuses)("allows authenticated %s members to read member content", (membershipStatus) => {
    const auth = authForStatus(membershipStatus);

    expect(canReadMemberContent(auth)).toBe(true);
    expect(canUseMemberApp(auth)).toBe(true);
  });

  it.each([anonymousAuth, ...blockedStatuses.map((membershipStatus) => authForStatus(membershipStatus))])(
    "blocks anonymous, invited, left, and inactive users from reading member content",
    (auth) => {
      expect(canReadMemberContent(auth)).toBe(false);
      expect(canUseMemberApp(auth)).toBe(false);
    },
  );

  it("allows writing member activity only for authenticated active members", () => {
    expect(canWriteMemberActivity(authForStatus("ACTIVE"))).toBe(true);

    for (const membershipStatus of ["VIEWER", "SUSPENDED", ...blockedStatuses] as MembershipStatus[]) {
      expect(canWriteMemberActivity(authForStatus(membershipStatus))).toBe(false);
    }
    expect(canWriteMemberActivity(anonymousAuth)).toBe(false);
  });

  it("allows host app access only for authenticated active hosts", () => {
    expect(canUseHostApp(authForStatus("ACTIVE", { role: "HOST" }))).toBe(true);

    expect(canUseHostApp(authForStatus("ACTIVE", { role: "MEMBER" }))).toBe(false);
    expect(canUseHostApp(authForStatus("VIEWER", { role: "HOST" }))).toBe(false);
    expect(canUseHostApp(authForStatus("SUSPENDED", { role: "HOST" }))).toBe(false);
    expect(canUseHostApp(anonymousAuth)).toBe(false);
  });

  it("blocks all users from editing their own profile", () => {
    expect(canEditOwnProfile(authForStatus("ACTIVE", { role: "HOST" }))).toBe(false);
    expect(canEditOwnProfile(authForStatus("ACTIVE", { role: "MEMBER" }))).toBe(false);
    expect(canEditOwnProfile(authForStatus("VIEWER", { role: "HOST" }))).toBe(false);
    expect(canEditOwnProfile(authForStatus("SUSPENDED", { role: "HOST" }))).toBe(false);
    expect(canEditOwnProfile(anonymousAuth)).toBe(false);
  });

  it("passes club slug context to the member app auth endpoint", async () => {
    const auth = authForStatus("ACTIVE");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(auth));
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadMemberAppAuth({ clubSlug: "reading-sai" })).resolves.toEqual({
      auth,
      allowed: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/auth/me?clubSlug=reading-sai",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("does not use stale scoped browser location for unscoped member app auth", async () => {
    const auth = authForStatus("ACTIVE");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(auth));
    vi.stubGlobal("fetch", fetchMock);
    window.history.pushState({}, "", "/clubs/reading-sai/app");

    await expect(loadMemberAppAuth({ params: {} })).resolves.toEqual({
      auth,
      allowed: true,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/auth/me",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
