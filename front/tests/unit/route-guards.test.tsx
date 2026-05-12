/**
 * DEF-003: route-guards clubSlug bypass 제거
 *
 * Covers the 6 scenarios listed in the spec (§DEF-003 테스트 기준):
 *   RequireMemberApp:
 *     1. INACTIVE member + clubSlug present → BlockedMemberApp (bypass was letting them through)
 *     2. ACTIVE+APPROVED member + clubSlug present → children
 *     3. Unauthenticated + clubSlug present → redirect to login
 *   RequireHost:
 *     4. Non-host user + clubSlug present → redirect to scoped app path (bypass was letting through)
 *     5. HOST role (active) + clubSlug present → children
 *     6. Unauthenticated + clubSlug present → redirect to login
 */
import { cleanup } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthContext, AuthActionsContext } from "@/src/app/auth-state";
import { RequireMemberApp, RequireHost } from "@/src/app/route-guards";
import type { AuthState } from "@/src/app/auth-state";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const noopActions = { markLoggedOut: () => {}, refreshAuth: async () => {} };

// ── auth fixtures ────────────────────────────────────────────────────────────

const activeMemberAuth: AuthMeResponse = {
  authenticated: true,
  userId: "user-1",
  membershipId: "membership-1",
  clubId: "club-1",
  email: "member@example.com",
  displayName: "멤버",
  accountName: "mem",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

const inactiveMemberAuth: AuthMeResponse = {
  ...activeMemberAuth,
  membershipStatus: "INACTIVE",
  approvalState: "INACTIVE",
};

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

const activeHostAuth: AuthMeResponse = {
  ...activeMemberAuth,
  userId: "host-1",
  membershipId: "membership-host",
  email: "host@example.com",
  displayName: "호스트",
  accountName: "host",
  role: "HOST",
};

const nonHostMemberAuth: AuthMeResponse = {
  ...activeMemberAuth,
  role: "MEMBER",
};

// ── helpers ──────────────────────────────────────────────────────────────────

function renderWithState(state: AuthState, path: string, children: React.ReactNode) {
  return render(
    <AuthActionsContext.Provider value={noopActions}>
      <AuthContext.Provider value={state}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/clubs/:clubSlug/app/*" element={children} />
            <Route path="/login" element={<LoginRouteProbe />} />
            {/* RequireHost redirects non-host to scopedAppPath(clubSlug) = /clubs/<slug>/app */}
            <Route path="/clubs/:clubSlug/app" element={<div>scoped-app-root</div>} />
            <Route path="/app" element={<div>app-root</div>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </AuthActionsContext.Provider>,
  );
}

function renderWithAuth(auth: AuthMeResponse, path: string, children: React.ReactNode) {
  return renderWithState({ status: "ready", auth }, path, children);
}

function LoginRouteProbe() {
  const location = useLocation();

  return (
    <div>
      login
      <span data-testid="login-url">{`${location.pathname}${location.search}${location.hash}`}</span>
    </div>
  );
}

function expectLoginReturnTo(returnTo: string) {
  expect(screen.getByTestId("login-url").textContent).toContain(`returnTo=${encodeURIComponent(returnTo)}`);
}

afterEach(() => {
  cleanup();
});

// ── RequireMemberApp ─────────────────────────────────────────────────────────

describe("RequireMemberApp", () => {
  it("renders BlockedMemberApp for INACTIVE member even when clubSlug is present", () => {
    renderWithAuth(
      inactiveMemberAuth,
      "/clubs/test-slug/app/home",
      <RequireMemberApp>
        <div>member content</div>
      </RequireMemberApp>,
    );

    expect(screen.getByRole("heading", { name: "멤버 공간에 들어갈 수 없습니다." })).toBeInTheDocument();
    expect(screen.queryByText("member content")).not.toBeInTheDocument();
  });

  it("renders children for ACTIVE+APPROVED member with clubSlug", () => {
    renderWithAuth(
      activeMemberAuth,
      "/clubs/test-slug/app/home",
      <RequireMemberApp>
        <div>member content</div>
      </RequireMemberApp>,
    );

    expect(screen.getByText("member content")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "멤버 공간에 들어갈 수 없습니다." })).not.toBeInTheDocument();
  });

  it("redirects unauthenticated user to login even with clubSlug", () => {
    renderWithAuth(
      anonymousAuth,
      "/clubs/test-slug/app/home",
      <RequireMemberApp>
        <div>member content</div>
      </RequireMemberApp>,
    );

    expect(screen.getByText("login")).toBeInTheDocument();
    expect(screen.queryByText("member content")).not.toBeInTheDocument();
  });

  it("redirects expired sessions to login instead of rendering loading", () => {
    renderWithState(
      { status: "session_expired" },
      "/clubs/test-slug/app/home",
      <RequireMemberApp>
        <div>member content</div>
      </RequireMemberApp>,
    );

    expect(screen.getByText("login")).toBeInTheDocument();
    expectLoginReturnTo("/clubs/test-slug/app/home");
    expect(screen.queryByText("멤버 화면을 확인하는 중")).not.toBeInTheDocument();
    expect(screen.queryByText("member content")).not.toBeInTheDocument();
  });
});

// ── RequireHost ──────────────────────────────────────────────────────────────

describe("RequireHost", () => {
  it("redirects non-host user to scoped app path even when clubSlug is present", () => {
    renderWithAuth(
      nonHostMemberAuth,
      "/clubs/test-slug/app/host/sessions",
      <RequireHost>
        <div>host content</div>
      </RequireHost>,
    );

    expect(screen.getByText("scoped-app-root")).toBeInTheDocument();
    expect(screen.queryByText("host content")).not.toBeInTheDocument();
  });

  it("renders children for HOST role with clubSlug", () => {
    renderWithAuth(
      activeHostAuth,
      "/clubs/test-slug/app/host/sessions",
      <RequireHost>
        <div>host content</div>
      </RequireHost>,
    );

    expect(screen.getByText("host content")).toBeInTheDocument();
    expect(screen.queryByText("scoped-app-root")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated user to login even with clubSlug", () => {
    renderWithAuth(
      anonymousAuth,
      "/clubs/test-slug/app/host/sessions",
      <RequireHost>
        <div>host content</div>
      </RequireHost>,
    );

    expect(screen.getByText("login")).toBeInTheDocument();
    expect(screen.queryByText("host content")).not.toBeInTheDocument();
  });

  it("redirects expired sessions to login instead of rendering loading", () => {
    renderWithState(
      { status: "session_expired" },
      "/clubs/test-slug/app/host/sessions",
      <RequireHost>
        <div>host content</div>
      </RequireHost>,
    );

    expect(screen.getByText("login")).toBeInTheDocument();
    expectLoginReturnTo("/clubs/test-slug/app/host/sessions");
    expect(screen.queryByText("호스트 권한을 확인하는 중")).not.toBeInTheDocument();
    expect(screen.queryByText("host content")).not.toBeInTheDocument();
  });
});
