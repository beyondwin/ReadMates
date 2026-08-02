import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse, MembershipStatus } from "@/shared/auth/auth-contracts";
import MyRoutePage from "./my-page";

const auth = vi.hoisted(() => ({
  state: null as unknown,
  refreshAuth: vi.fn(),
  canEditOwnProfile: vi.fn(),
  clubAppAccess: undefined as { auth: AuthMeResponse; allowed: boolean } | undefined,
}));
const route = vi.hoisted(() => ({ MyPageRoute: vi.fn(() => null) }));

vi.mock("@/src/app/auth-state", () => ({
  useAuth: () => auth.state,
  useAuthActions: () => ({ refreshAuth: auth.refreshAuth }),
}));
vi.mock("@/shared/auth/member-app-access", () => ({
  canEditOwnProfile: auth.canEditOwnProfile,
}));
vi.mock("react-router-dom", () => ({
  useRouteLoaderData: (routeId: string) => routeId === "club-app" ? auth.clubAppAccess : undefined,
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
    currentMembership: {
      membershipId: `${membershipStatus.toLowerCase()}-membership`,
      clubId: "club-id",
      clubSlug: "reading-sai",
      displayName: "샘플 멤버",
      role: "MEMBER",
      membershipStatus,
      approvalState: membershipStatus,
      avatarKey: "banana-green-book",
    },
  };
}

function latestRouteProps() {
  return route.MyPageRoute.mock.calls.at(-1)?.[0] as {
    canEditProfile: boolean;
    clubSlug: string | null;
    onProfileUpdated: () => Promise<void>;
  };
}

describe("MyRoutePage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.clubAppAccess = undefined;
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
      clubSlug: "reading-sai",
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
      clubSlug: "reading-sai",
      onProfileUpdated: auth.refreshAuth,
    });
  });

  it("uses the scoped club loader membership when global auth is active in another club", () => {
    const globalActiveAuth = memberAuth("ACTIVE");
    const scopedSuspendedAuth = {
      ...memberAuth("SUSPENDED"),
      clubId: "suspended-club",
      membershipId: "suspended-membership",
      currentMembership: {
        ...memberAuth("SUSPENDED").currentMembership!,
        clubId: "suspended-club",
        clubSlug: "suspended-club",
        membershipId: "suspended-membership",
      },
    };
    auth.state = { status: "ready", auth: globalActiveAuth };
    auth.clubAppAccess = { auth: scopedSuspendedAuth, allowed: true };
    auth.canEditOwnProfile.mockImplementation((candidate) => candidate.membershipStatus === "ACTIVE");

    render(<MyRoutePage />);

    expect(auth.canEditOwnProfile).toHaveBeenCalledWith(scopedSuspendedAuth);
    expect(latestRouteProps()).toEqual({
      canEditProfile: false,
      clubSlug: "suspended-club",
      onProfileUpdated: auth.refreshAuth,
    });
  });

  it("uses the scoped club loader membership when global auth is suspended in another club", () => {
    const globalSuspendedAuth = memberAuth("SUSPENDED");
    const scopedActiveAuth = {
      ...memberAuth("ACTIVE"),
      clubId: "active-club",
      membershipId: "active-membership",
      currentMembership: {
        ...memberAuth("ACTIVE").currentMembership!,
        clubId: "active-club",
        clubSlug: "active-club",
        membershipId: "active-membership",
      },
    };
    auth.state = { status: "ready", auth: globalSuspendedAuth };
    auth.clubAppAccess = { auth: scopedActiveAuth, allowed: true };
    auth.canEditOwnProfile.mockImplementation((candidate) => candidate.membershipStatus === "ACTIVE");

    render(<MyRoutePage />);

    expect(auth.canEditOwnProfile).toHaveBeenCalledWith(scopedActiveAuth);
    expect(latestRouteProps()).toEqual({
      canEditProfile: true,
      clubSlug: "active-club",
      onProfileUpdated: auth.refreshAuth,
    });
  });
});
