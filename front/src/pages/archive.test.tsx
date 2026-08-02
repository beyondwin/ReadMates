import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import { VIEWER_READ_SURFACE_CAPABILITIES } from "@/shared/model/read-surface-capabilities";
import ArchiveRoutePage from "./archive";

const auth = vi.hoisted(() => ({
  state: null as unknown,
  clubAppAccess: undefined as { auth: AuthMeResponse; allowed: boolean } | undefined,
}));
const route = vi.hoisted(() => ({ ArchiveListRoute: vi.fn(() => null) }));

vi.mock("@/src/app/auth-state", () => ({ useAuth: () => auth.state }));
vi.mock("react-router", () => ({
  useRouteLoaderData: (routeId: string) => routeId === "club-app" ? auth.clubAppAccess : undefined,
}));
vi.mock("@/features/archive/route/archive-list-route", () => route);

function viewerAuth(): AuthMeResponse {
  return {
    authenticated: true,
    userId: "viewer-user",
    membershipId: "viewer-membership",
    clubId: "viewer-club",
    email: "viewer@example.com",
    displayName: "둘러보기 멤버",
    accountName: "viewer-account",
    role: "MEMBER",
    membershipStatus: "VIEWER",
    approvalState: "VIEWER",
    currentMembership: {
      membershipId: "viewer-membership",
      clubId: "viewer-club",
      clubSlug: "viewer-club",
      displayName: "둘러보기 멤버",
      role: "MEMBER",
      membershipStatus: "VIEWER",
      approvalState: "VIEWER",
      avatarKey: "book",
    },
  };
}

describe("ArchiveRoutePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.state = { status: "ready", auth: viewerAuth() };
    auth.clubAppAccess = undefined;
  });

  afterEach(cleanup);

  it("keeps the scoped viewer archive feedback-locked", () => {
    const scopedViewer = viewerAuth();
    auth.clubAppAccess = { auth: scopedViewer, allowed: true };

    render(<ArchiveRoutePage />);

    expect(route.ArchiveListRoute).toHaveBeenCalledWith(
      {
        capabilities: VIEWER_READ_SURFACE_CAPABILITIES,
        reviewAuthorName: "둘러보기 멤버",
      },
      undefined,
    );
  });
});
