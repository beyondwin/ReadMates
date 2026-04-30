import { useEffect } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "@/src/app/auth-context";
import { useAuth, useAuthActions } from "@/src/app/auth-state";
import { RequireAuth, RequireHost, RequireMemberApp } from "@/src/app/route-guards";
import { LogoutButton } from "@/features/auth/route/logout-button";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
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
  accountName: "둘러보기",
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
  accountName: "호스트",
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

function AuthAwareLogoutButton() {
  const { markLoggedOut } = useAuthActions();

  return <LogoutButton onLoggedOut={markLoggedOut} />;
}

function AuthRefreshProbe() {
  const state = useAuth();
  const { refreshAuth } = useAuthActions();

  if (state.status === "loading") {
    return <div data-testid="short-name">loading</div>;
  }

  return (
    <>
      <div data-testid="short-name">{state.auth.displayName}</div>
      <button type="button" onClick={() => void refreshAuth()}>
        refresh auth
      </button>
    </>
  );
}

function ImmediateRefreshProbe() {
  const state = useAuth();
  const { refreshAuth } = useAuthActions();

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  if (state.status === "loading") {
    return <div data-testid="short-name">loading</div>;
  }

  return <div data-testid="short-name">{state.auth.displayName}</div>;
}

async function resolveAuthRequest(deferred: Deferred<Response>, auth: AuthMeResponse) {
  await act(async () => {
    deferred.resolve(authResponse(auth));
    await deferred.promise;
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function rejectAuthRequest(deferred: Deferred<Response>, reason: unknown) {
  await act(async () => {
    deferred.reject(reason);
    await deferred.promise.catch(() => undefined);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function LoginLocationProbe() {
  const location = useLocation();

  return <main>login page {location.search}</main>;
}

function renderGuard(element: React.ReactElement, initialEntry = "/guard") {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/guard" element={element} />
          <Route path="/clubs/:clubSlug/app/feedback/:sessionId" element={element} />
          <Route path="/login" element={<LoginLocationProbe />} />
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

  it("keeps guarded routes in a specific loading state while auth is unresolved", async () => {
    const deferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(deferred.promise));

    renderGuard(
      <RequireAuth>
        <main>protected app</main>
      </RequireAuth>,
    );

    expect(screen.getByText("로그인 상태를 확인하는 중")).toBeInTheDocument();
    expect(screen.queryByText("화면을 불러오는 중")).not.toBeInTheDocument();

    deferred.resolve(authResponse(activeMemberAuth));

    expect(await screen.findByText("protected app")).toBeInTheDocument();
  });

  it("marks the current app shell anonymous after a successful logout", async () => {
    const user = userEvent.setup();
    const location = { href: "" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse(activeMemberAuth))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("location", location);

    render(
      <AuthProvider>
        <AuthProbe />
        <AuthAwareLogoutButton />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("auth-state")).toHaveTextContent("ACTIVE");

    await user.click(screen.getByRole("button", { name: "로그아웃" }));

    expect(await screen.findByTestId("auth-state")).toHaveTextContent("ANONYMOUS");
    expect(location.href).toBe("/login");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/bff/api/auth/logout", { method: "POST" });
  });

  it("refreshes the auth payload and updates the current display name", async () => {
    const user = userEvent.setup();
    const refreshedAuth: AuthMeResponse = {
      ...activeMemberAuth,
      displayName: "새이름",
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(authResponse(activeMemberAuth)).mockResolvedValueOnce(authResponse(refreshedAuth));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <AuthRefreshProbe />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("short-name")).toHaveTextContent(activeMemberAuth.displayName ?? "");

    await user.click(screen.getByRole("button", { name: "refresh auth" }));

    expect(await screen.findByTestId("short-name")).toHaveTextContent("새이름");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/bff/api/auth/me", { cache: "no-store" });
  });

  it("keeps the newest auth state when an older refresh response resolves last", async () => {
    const user = userEvent.setup();
    const firstRefresh = createDeferred<Response>();
    const secondRefresh = createDeferred<Response>();
    const staleAuth: AuthMeResponse = { ...activeMemberAuth, displayName: "이전" };
    const latestAuth: AuthMeResponse = { ...activeMemberAuth, displayName: "최신" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse(activeMemberAuth))
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <AuthRefreshProbe />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("short-name")).toHaveTextContent(activeMemberAuth.displayName ?? "");

    await user.click(screen.getByRole("button", { name: "refresh auth" }));
    await user.click(screen.getByRole("button", { name: "refresh auth" }));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await resolveAuthRequest(secondRefresh, latestAuth);
    expect(screen.getByTestId("short-name")).toHaveTextContent("최신");

    await resolveAuthRequest(firstRefresh, staleAuth);
    expect(screen.getByTestId("short-name")).toHaveTextContent("최신");
  });

  it("does not let an older refresh failure reset a newer successful auth state", async () => {
    const user = userEvent.setup();
    const firstRefresh = createDeferred<Response>();
    const secondRefresh = createDeferred<Response>();
    const latestAuth: AuthMeResponse = { ...activeMemberAuth, displayName: "최신" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(authResponse(activeMemberAuth))
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <AuthRefreshProbe />
      </AuthProvider>,
    );

    expect(await screen.findByTestId("short-name")).toHaveTextContent(activeMemberAuth.displayName ?? "");

    await user.click(screen.getByRole("button", { name: "refresh auth" }));
    await user.click(screen.getByRole("button", { name: "refresh auth" }));
    expect(fetchMock).toHaveBeenCalledTimes(3);

    await resolveAuthRequest(secondRefresh, latestAuth);
    expect(screen.getByTestId("short-name")).toHaveTextContent("최신");

    await rejectAuthRequest(firstRefresh, new Error("stale network failure"));
    expect(screen.getByTestId("short-name")).toHaveTextContent("최신");
  });

  it("does not let the initial auth response overwrite a newer refresh", async () => {
    const initialFetch = createDeferred<Response>();
    const refreshFetch = createDeferred<Response>();
    const staleAuth: AuthMeResponse = { ...activeMemberAuth, displayName: "초기" };
    const latestAuth: AuthMeResponse = { ...activeMemberAuth, displayName: "최신" };
    const fetchMock = vi.fn().mockReturnValueOnce(initialFetch.promise).mockReturnValueOnce(refreshFetch.promise);
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <ImmediateRefreshProbe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("short-name")).toHaveTextContent("loading");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await resolveAuthRequest(refreshFetch, latestAuth);
    expect(screen.getByTestId("short-name")).toHaveTextContent("최신");

    await resolveAuthRequest(initialFetch, staleAuth);
    expect(screen.getByTestId("short-name")).toHaveTextContent("최신");
  });
});

describe("route guards", () => {
  it("keeps member app routes in a specific loading state while auth is unresolved", async () => {
    const deferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(deferred.promise));

    renderGuard(
      <RequireMemberApp>
        <main>member app boundary</main>
      </RequireMemberApp>,
    );

    expect(screen.getByText("멤버 화면을 확인하는 중")).toBeInTheDocument();
    expect(screen.queryByText("화면을 불러오는 중")).not.toBeInTheDocument();

    deferred.resolve(authResponse(activeMemberAuth));

    expect(await screen.findByText("member app boundary")).toBeInTheDocument();
  });

  it("keeps host routes in a specific loading state while auth is unresolved", async () => {
    const deferred = createDeferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(deferred.promise));

    renderGuard(
      <RequireHost>
        <main>host app boundary</main>
      </RequireHost>,
    );

    expect(screen.getByText("호스트 권한을 확인하는 중")).toBeInTheDocument();
    expect(screen.queryByText("화면을 불러오는 중")).not.toBeInTheDocument();

    deferred.resolve(authResponse(activeHostAuth));

    expect(await screen.findByText("host app boundary")).toBeInTheDocument();
  });

  it("redirects anonymous guarded routes to login", async () => {
    mockAuthFetch(anonymousAuth);

    renderGuard(
      <RequireAuth>
        <main>protected app</main>
      </RequireAuth>,
    );

    expect(await screen.findByText(/login page/)).toBeInTheDocument();
    expect(screen.queryByText("protected app")).not.toBeInTheDocument();
  });

  it("redirects anonymous member app routes to login", async () => {
    mockAuthFetch(anonymousAuth);

    renderGuard(
      <RequireMemberApp>
        <main>member app boundary</main>
      </RequireMemberApp>,
    );

    expect(await screen.findByText(/login page/)).toBeInTheDocument();
    expect(screen.queryByText("member app boundary")).not.toBeInTheDocument();
  });

  it("redirects anonymous member app routes to login with returnTo", async () => {
    mockAuthFetch(anonymousAuth);

    renderGuard(
      <RequireMemberApp>
        <main>member app boundary</main>
      </RequireMemberApp>,
      "/clubs/reading-sai/app/feedback/session-1?from=email",
    );

    expect(
      await screen.findByText(/returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail/),
    ).toBeInTheDocument();
    expect(screen.queryByText("member app boundary")).not.toBeInTheDocument();
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

  it("blocks inactive users on member routes without rendering child routes", async () => {
    mockAuthFetch(inactiveMemberAuth);

    renderGuard(
      <RequireMemberApp>
        <main>active member app</main>
      </RequireMemberApp>,
    );

    expect(await screen.findByRole("heading", { name: "멤버 공간에 들어갈 수 없습니다." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "공개 홈" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "클럽 소개" })).toHaveAttribute("href", "/about");
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
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

  it("requires active host membership status for host routes", async () => {
    mockAuthFetch({
      ...activeHostAuth,
      membershipStatus: "INACTIVE",
    });

    renderGuard(
      <RequireHost>
        <main>host app</main>
      </RequireHost>,
    );

    expect(await screen.findByText("member app")).toBeInTheDocument();
    expect(screen.queryByText("host app")).not.toBeInTheDocument();
  });
});
