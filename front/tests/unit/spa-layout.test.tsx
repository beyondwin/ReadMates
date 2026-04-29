import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/src/app/auth-context";
import { AppRouteLayout, PublicRouteLayout } from "@/src/app/layouts";
import { Link } from "@/src/app/router-link";
import { RequireMemberApp } from "@/src/app/route-guards";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";

const hostAuth: AuthMeResponse = {
  authenticated: true,
  userId: "host-1",
  membershipId: "membership-host",
  clubId: "club-1",
  email: "host@example.com",
  displayName: "김호스트",
  accountName: "호스트",
  role: "HOST",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
};

const suspendedMemberAuth: AuthMeResponse = {
  authenticated: true,
  userId: "member-1",
  membershipId: "membership-member",
  clubId: "club-1",
  email: "member@example.com",
  displayName: "이멤버",
  accountName: "멤버",
  role: "MEMBER",
  membershipStatus: "SUSPENDED",
  approvalState: "SUSPENDED",
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

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SPA AppRouteLayout", () => {
  it("scrolls public route navigation to the top", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, value: scrollTo });
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<PublicRouteLayout />}>
            <Route
              path="/"
              element={
                <main>
                  <Link to="/about">클럽 소개로 이동</Link>
                </main>
              }
            />
            <Route path="/about" element={<main>club page</main>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    scrollTo.mockClear();
    await user.click(screen.getByRole("link", { name: "클럽 소개로 이동" }));

    expect(await screen.findByText("club page")).toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("renders the member app shell for suspended members", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(suspendedMemberAuth));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/app/session/current"]}>
          <Routes>
            <Route
              path="/app"
              element={
                <RequireMemberApp>
                  <AppRouteLayout />
                </RequireMemberApp>
              }
            >
              <Route path="session/current" element={<main>current session page</main>} />
            </Route>
            <Route path="/app/pending" element={<main>pending page</main>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("current session page")).toBeInTheDocument();
    expect(screen.queryByText("pending page")).not.toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "앱 내비게이션" });
    expect(within(nav).getByRole("link", { name: "이번 세션" })).toHaveAttribute("href", "/app/session/current");
  });

  it("keeps host users on member chrome while they are in the member workspace", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(hostAuth));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route path="/app" element={<AppRouteLayout />}>
              <Route index element={<main>member child</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("member child")).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "앱 내비게이션" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "홈",
      "이번 세션",
      "클럽 노트",
      "아카이브",
      "내 공간",
    ]);
    expect(screen.getAllByRole("link", { name: "호스트 화면" }).map((link) => link.getAttribute("href"))).toEqual([
      "/app/host",
      "/app/host",
    ]);
    expect(screen.getAllByRole("link", { name: "호스트 화면" }).map((link) => link.textContent)).toEqual(["", ""]);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).getAllByRole("link").map((tab) => tab.textContent)).toEqual([
      "홈",
      "이번 세션",
      "클럽 노트",
      "아카이브",
      "내 공간",
    ]);
    expect(within(tabs).queryByRole("link", { name: "세션" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/sessions/current", expect.anything());

    const appContent = document.querySelector(".app-content");
    expect(appContent?.querySelector(":scope > .rm-route-reveal")).toBeInTheDocument();
    expect(appContent?.querySelector(".topnav")).not.toBeInTheDocument();
  });

  it("keeps host users on member mobile chrome after opening archive from the member workspace", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(hostAuth));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route path="/app" element={<AppRouteLayout />}>
              <Route index element={<main>member child</main>} />
              <Route path="archive" element={<main>archive child</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("member child")).toBeInTheDocument();

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    await user.click(within(tabs).getByRole("link", { name: "아카이브" }));

    expect(await screen.findByText("archive child")).toBeInTheDocument();
    expect(within(tabs).getAllByRole("link").map((tab) => tab.textContent)).toEqual([
      "홈",
      "이번 세션",
      "클럽 노트",
      "아카이브",
      "내 공간",
    ]);
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).queryByRole("link", { name: "기록" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "호스트 화면" }).map((link) => link.getAttribute("href"))).toEqual([
      "/app/host",
      "/app/host",
    ]);
    expect(screen.queryByRole("link", { name: "멤버 화면으로" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/sessions/current", expect.anything());
  });

  it("keeps active hosts on host mobile chrome for archive routes", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(hostAuth));
      }

      if (url === "/api/bff/api/sessions/current") {
        return Promise.resolve(
          jsonResponse({
            currentSession: {
              sessionId: "session-6",
            },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/app/archive"]}>
          <Routes>
            <Route path="/app" element={<AppRouteLayout />}>
              <Route path="archive" element={<main>archive child</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("archive child")).toBeInTheDocument();

    const desktopNav = screen.getByRole("navigation", { name: "앱 내비게이션" });
    expect(within(desktopNav).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => {
      expect(screen.getAllByRole("link", { name: "호스트 화면" })).toHaveLength(1);
    });
    expect(screen.getByRole("link", { name: "호스트 화면" })).toHaveAttribute("href", "/app/host");

    expect(screen.getAllByText("기록")).toHaveLength(1);
    const memberReturn = screen.getByRole("link", { name: "멤버 화면으로" });
    expect(memberReturn).toHaveAttribute("href", "/app");
    expect(memberReturn).toHaveClass("m-hdr-link--icon");
    expect(memberReturn.textContent).toBe("");

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    await waitFor(() => {
      expect(within(tabs).getAllByRole("link").map((tab) => tab.textContent)).toEqual([
        "홈",
        "세션",
        "알림",
        "멤버",
        "아카이브",
      ]);
    });
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "세션" })).toHaveAttribute(
      "href",
      "/app/host/sessions/session-6/edit",
    );
    expect(within(tabs).queryByRole("link", { name: "기록" })).not.toBeInTheDocument();
  });

  it("keeps active hosts on host mobile chrome for feedback document routes", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(hostAuth));
      }

      if (url === "/api/bff/api/sessions/current") {
        return Promise.resolve(
          jsonResponse({
            currentSession: {
              sessionId: "session-6",
            },
          }),
        );
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/app/feedback/session-1"]}>
          <Routes>
            <Route path="/app" element={<AppRouteLayout />}>
              <Route path="feedback/:sessionId" element={<main>feedback child</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("feedback child")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByRole("banner").find((element) => element.classList.contains("m-hdr"))).toHaveAttribute(
        "data-workspace",
        "host",
      );
    });
    const mobileHeader = screen.getAllByRole("banner").find((element) => element.classList.contains("m-hdr"));
    expect(mobileHeader).toBeDefined();
    expect(within(mobileHeader!).getByText("기록")).toBeInTheDocument();
    const backLink = within(mobileHeader!).getByRole("link", { name: "뒤로" });
    expect(backLink).toHaveAttribute("href", "/app/archive?view=report");
    expect(backLink.textContent).toBe("뒤로");
    expect(backLink).not.toHaveClass("m-hdr-back--icon");

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    await waitFor(() => {
      expect(within(tabs).getAllByRole("link").map((tab) => tab.textContent)).toEqual([
        "홈",
        "세션",
        "알림",
        "멤버",
        "아카이브",
      ]);
    });
    expect(within(tabs).getByRole("link", { name: "아카이브" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps host edit disabled while the current session tab target is loading", async () => {
    const currentSession = createDeferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();

        if (url === "/api/bff/api/auth/me") {
          return Promise.resolve(jsonResponse(hostAuth));
        }

        if (url === "/api/bff/api/sessions/current") {
          return currentSession.promise;
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/app/host"]}>
          <Routes>
            <Route path="/app/host" element={<AppRouteLayout />}>
              <Route index element={<main>host child</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText("host child")).toBeInTheDocument();

    expect(screen.getAllByRole("link", { name: "멤버 화면으로" }).map((link) => link.getAttribute("href"))).toEqual([
      "/app",
      "/app",
    ]);

    const tabs = screen.getByRole("navigation", { name: "앱 탭" });
    expect(within(tabs).queryByRole("link", { name: "세션" })).not.toBeInTheDocument();
    expect(within(tabs).getByLabelText("세션 불러오는 중")).toHaveAttribute("aria-disabled", "true");
    expect(within(tabs).getByText("확인 중")).toBeInTheDocument();

    currentSession.resolve(
      jsonResponse({
        currentSession: {
          sessionId: "session-6",
        },
      }),
    );

    await waitFor(() => {
      expect(within(tabs).getByRole("link", { name: "세션" })).toHaveAttribute(
        "href",
        "/app/host/sessions/session-6/edit",
      );
    });
  });

  it("renders a shell-aware member loading skeleton while auth is unresolved", () => {
    const currentAuth = createDeferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();

        if (url === "/api/bff/api/auth/me") {
          return currentAuth.promise;
        }

        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/app"]}>
          <Routes>
            <Route
              path="/app"
              element={
                <RequireMemberApp>
                  <AppRouteLayout />
                </RequireMemberApp>
              }
            >
              <Route index element={<main>member child</main>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("멤버 화면을 확인하는 중");
    expect(document.querySelector(".rm-route-loading--member")).toBeInTheDocument();
    expect(document.querySelector(".rm-loading-member-desk")).toBeInTheDocument();
    expect(screen.queryByText("member child")).not.toBeInTheDocument();
  });
});
