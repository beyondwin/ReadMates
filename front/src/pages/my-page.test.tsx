import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse, MembershipStatus } from "@/shared/auth/auth-contracts";
import MyRoutePage from "./my-page";

const auth = vi.hoisted(() => ({
  state: null as unknown,
  refreshAuth: vi.fn(),
  canEditOwnProfile: vi.fn(),
}));
const route = vi.hoisted(() => ({ MyPageRoute: vi.fn(() => null) }));

vi.mock("@/src/app/auth-state", () => ({
  useAuth: () => auth.state,
  useAuthActions: () => ({ refreshAuth: auth.refreshAuth }),
}));
vi.mock("@/shared/auth/member-app-access", () => ({
  canEditOwnProfile: auth.canEditOwnProfile,
}));
vi.mock("@/features/archive/route/my-page-route", () => route);

function memberAuth(membershipStatus: MembershipStatus): AuthMeResponse {
  return {
    authenticated: true,
    userId: `${membershipStatus.toLowerCase()}-user`,
    membershipId: `${membershipStatus.toLowerCase()}-membership`,
    clubId: "club-id",
    email: "member@example.com",
    displayName: "샘플 멤버",
    accountName: "sample-member",
    role: "MEMBER",
    membershipStatus,
    approvalState: membershipStatus,
  };
}

function latestRouteProps() {
  return route.MyPageRoute.mock.calls.at(-1)?.[0] as {
    canEditProfile: boolean;
    onProfileUpdated: () => Promise<void>;
  };
}

describe("MyRoutePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(cleanup);

  it("passes active members the editable profile contract and auth refresh callback", () => {
    const activeAuth = memberAuth("ACTIVE");
    auth.state = { status: "ready", auth: activeAuth };
    auth.canEditOwnProfile.mockReturnValue(true);

    render(<MyRoutePage />);

    expect(auth.canEditOwnProfile).toHaveBeenCalledWith(activeAuth);
    expect(latestRouteProps()).toEqual({
      canEditProfile: true,
      onProfileUpdated: auth.refreshAuth,
    });
  });

  it.each(["VIEWER", "SUSPENDED"] as const)("passes %s members a non-editable profile contract", (membershipStatus) => {
    const restrictedAuth = memberAuth(membershipStatus);
    auth.state = { status: "ready", auth: restrictedAuth };
    auth.canEditOwnProfile.mockReturnValue(false);

    render(<MyRoutePage />);

    expect(auth.canEditOwnProfile).toHaveBeenCalledWith(restrictedAuth);
    expect(latestRouteProps()).toEqual({
      canEditProfile: false,
      onProfileUpdated: auth.refreshAuth,
    });
  });
});
