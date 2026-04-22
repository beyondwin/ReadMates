import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/src/app/auth-context";
import { useAuth } from "@/src/app/auth-state";
import { RequireAuth, RequireHost, RequireMemberApp } from "@/src/app/route-guards";
import type { AuthMeResponse } from "@/shared/api/readmates";
import {
  anonymousAuthMeContractFixture,
  authMeContractFixture,
} from "./api-contract-fixtures";

const activeMemberAuth: AuthMeResponse = authMeContractFixture;

const anonymousAuth: AuthMeResponse = anonymousAuthMeContractFixture;

const viewerAuth: AuthMeResponse = {
  authenticated: true,
  userId: "viewer-user",
  membershipId: "viewer-membership",
  clubId: "club-id",
  email: "viewer@example.com",
  displayName: "둘러보기 멤버",
  shortName: "둘러보기",
  role: "MEMBER",
  membershipStatus: "VIEWER",
  approvalState: "VIEWER",
};

const inactiveMemberAuth: AuthMeResponse = {
  ...activeMemberAuth,
  membershipStatus: "INACTIVE",
  approvalState: "INACTIVE",
};

const suspendedMemberAuth: AuthMeResponse = {
  ...activeMemberAuth,
  membershipStatus: "SUSPENDED",
  approvalState: "SUSPENDED",
};

const activeHostAuth: AuthMeResponse = {
  ...activeMemberAuth,
  userId: "host-1",
  membershipId: "membership-host",
  email: "host@example.com",
  displayName: "김호스트",
  shortName: "호스트",
  role: "HOST",
};

const viewerHostAuth: AuthMeResponse = {
  ...activeHostAuth,
  membershipStatus: "VIEWER",
  approvalState: "VIEWER",
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function authResponse(auth: AuthMeResponse) {
  return new Response(JSON.stringify(auth), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function mockAuthFetch(auth: AuthMeResponse) {
  const fetchMock = vi.fn().mockResolvedValue(authResponse(auth));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function AuthProbe() {
  const state = useAuth();

  if (state.status === "loading") {
    return <div data-testid="auth-state">loading</div>;
  }

  return <div data-testid="auth-state">{state.auth.approvalState}</div>;
}

function renderGuard(element: React.ReactElement) {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/guard"]}>
        <Routes>
          <Route path="/guard" element={element} />
          <Route path="/login" element={<main>login page</main>} />
          <Route path="/app" element={<main>member app</main>} />
          <Route path="/app/pending" element={<main>pending page</main>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AuthProvider", () => {
  it("accepts viewer auth payloads from the API contract", () => {
    expect(viewerAuth.membershipStatus).toBe("VIEWER");
    expect(viewerAuth.approvalState).toBe("VIEWER");
  });

  it("fetches the auth payload without cache and falls back to anonymous on failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network failure"));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("auth-state")).toHaveTextContent("ANONYMOUS");
    expect(fetchMock).toHaveBeenCalledWith("/api/bff/api/auth/me", { cache: "no-store" });
  });

  it("keeps guarded routes in a loading state while auth is unresolved", async () => {
    const deferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(deferred.promise));

    renderGuard(
      <RequireAuth>
        <main>protected app</main>
      </RequireAuth>,
    );

    expect(screen.getByText("불러오는 중")).toBeInTheDocument();

    deferred.resolve(authResponse(activeMemberAuth));

    expect(await screen.findByText("protected app")).toBeInTheDocument();
  });
});

describe("route guards", () => {
  it("redirects anonymous guarded routes to login", async () => {
    mockAuthFetch(anonymousAuth);

    renderGuard(
      <RequireAuth>
        <main>protected app</main>
      </RequireAuth>,
    );

    expect(await screen.findByText("login page")).toBeInTheDocument();
    expect(screen.queryByText("protected app")).not.toBeInTheDocument();
  });

  it("allows viewer members through member app routes", async () => {
    mockAuthFetch(viewerAuth);

    renderGuard(
      <RequireMemberApp>
        <main>active member app</main>
      </RequireMemberApp>,
    );

    expect(await screen.findByText("active member app")).toBeInTheDocument();
    expect(screen.queryByText("pending page")).not.toBeInTheDocument();
    expect(screen.queryByText("활성 멤버만 이용할 수 있습니다.")).not.toBeInTheDocument();
  });

  it("blocks inactive users on active-member routes without redirecting to app home", async () => {
    mockAuthFetch(inactiveMemberAuth);

    renderGuard(
      <RequireMemberApp>
        <main>active member app</main>
      </RequireMemberApp>,
    );

    expect(await screen.findByText("활성 멤버만 이용할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByText("member app")).not.toBeInTheDocument();
    expect(screen.queryByText("active member app")).not.toBeInTheDocument();
  });

  it("allows suspended members through member app routes", async () => {
    mockAuthFetch(suspendedMemberAuth);

    renderGuard(
      <RequireMemberApp>
        <main>active member app</main>
      </RequireMemberApp>,
    );

    expect(await screen.findByText("active member app")).toBeInTheDocument();
    expect(screen.queryByText("pending page")).not.toBeInTheDocument();
    expect(screen.queryByText("활성 멤버만 이용할 수 있습니다.")).not.toBeInTheDocument();
  });

  it("allows active hosts through host routes", async () => {
    mockAuthFetch(activeHostAuth);

    renderGuard(
      <RequireHost>
        <main>host app</main>
      </RequireHost>,
    );

    expect(await screen.findByText("host app")).toBeInTheDocument();
  });

  it("redirects non-active hosts away from host routes", async () => {
    mockAuthFetch(viewerHostAuth);

    renderGuard(
      <RequireHost>
        <main>host app</main>
      </RequireHost>,
    );

    expect(await screen.findByText("member app")).toBeInTheDocument();
    expect(screen.queryByText("host app")).not.toBeInTheDocument();
  });
});
