import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render as testingLibraryRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryRouter, MemoryRouter, Route, Routes, useLocation, useLoaderData } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AuthProvider } from "@/src/app/auth-context";
import { AppRouteLayout, PublicRouteLayout } from "@/src/app/layouts";
import { ClubMemberAppRouteLayout } from "@/src/app/layouts/club-app-route-layout";
import { Link } from "@/src/app/router-link";
import { RequireMemberApp } from "@/src/app/route-guards";
import { anonymousAuth } from "@/src/app/auth-state";
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
  currentMembership: {
    membershipId: "membership-host",
    clubId: "club-1",
    clubSlug: "reading-sai",
    displayName: "김호스트",
    avatarKey: "cloud-green-book",
    role: "HOST",
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
  },
  joinedClubs: [{
    clubId: "club-1",
    clubSlug: "reading-sai",
    clubName: "읽는사이",
    membershipId: "membership-host",
    role: "HOST",
    status: "ACTIVE",
    approvalState: "ACTIVE",
    primaryHost: "김호스트",
  }],
  availableSpaces: {
    version: 1,
    kinds: ["CLUBS"],
    clubs: [{
      clubId: "club-1",
      clubSlug: "reading-sai",
      clubName: "읽는사이",
      perspectives: ["MEMBER", "HOST"],
    }],
  },
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

const activeMemberAuth: AuthMeResponse = {
  authenticated: true,
  userId: "member-2",
  membershipId: "membership-active-member",
  clubId: "club-2",
  email: "member2@example.com",
  displayName: "클럽멤버",
  accountName: "멤버2",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
  currentMembership: {
    membershipId: "membership-active-member",
    clubId: "club-2",
    clubSlug: "reading-sai",
    displayName: "클럽멤버",
    avatarKey: "cloud-green-book",
    role: "MEMBER",
    membershipStatus: "ACTIVE",
    approvalState: "ACTIVE",
  },
  availableSpaces: {
    version: 1,
    kinds: ["CLUBS"],
    clubs: [{
      clubId: "club-2",
      clubSlug: "reading-sai",
      clubName: "읽는사이",
      perspectives: ["MEMBER"],
    }],
  },
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

function CurrentLocationText() {
  const location = useLocation();

  return <span>{`${location.pathname}${location.search}${location.hash}`}</span>;
}

function ClubAppLayoutFromLoader() {
  const access = useLoaderData() as {
    auth: AuthMeResponse;
    allowed: boolean;
  };

  return <AppRouteLayout scopedAuth={access.auth} />;
}

function render(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return testingLibraryRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
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

    const nav = screen.getByRole("navigation", { name: "멤버 주 메뉴" });
    expect(within(nav).getByRole("link", { name: "오늘" })).toHaveAttribute("href", "/app");
    expect(within(nav).getByRole("link", { name: "오늘" })).toHaveAttribute("aria-current", "page");
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

    await waitFor(() => expect(screen.getByText("member child")).toBeInTheDocument());

    const nav = screen.getByRole("navigation", { name: "멤버 주 메뉴" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "오늘",
      "노트",
      "기록",
      "내 공간",
    ]);
    expect(screen.queryByRole("button", { name: /^공간 전환/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("현재 공간 내 클럽, 읽는사이 멤버로 보기")).toHaveLength(2);
    const accountTriggers = screen.getAllByRole("button", { name: "김호스트 계정 메뉴" });
    expect(accountTriggers).toHaveLength(2);
    expect(new Set(accountTriggers.map((trigger) => trigger.getAttribute("aria-controls"))).size).toBe(2);
    expect(accountTriggers[0].closest(".desktop-only")).toBeInTheDocument();
    expect(accountTriggers[1].closest(".mobile-only")).toBeInTheDocument();

    const tabs = screen.getByRole("navigation", { name: "멤버 주 메뉴 모바일" });
    expect(within(tabs).getAllByRole("link").map((tab) => tab.textContent)).toEqual([
      "오늘",
      "노트",
      "기록",
      "내 공간",
    ]);
    expect(within(tabs).queryByRole("link", { name: "모임" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/sessions/current", expect.anything());

    const appContent = document.querySelector(".app-content");
    expect(appContent?.querySelector(":scope > .rm-route-reveal")).toBeInTheDocument();
    expect(appContent?.querySelector(".topnav")).not.toBeInTheDocument();
  });

  it("uses club-app loader auth while a redundant scoped request remains pending", async () => {
    const redundantScopedRequest = createDeferred<Response>();
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(hostAuth));
      }

      if (url === "/api/bff/api/auth/me?clubSlug=reading-sai") {
        return redundantScopedRequest.promise;
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    const router = createMemoryRouter(
      [
        {
          id: "club-app",
          path: "/clubs/:clubSlug/app",
          loader: () => ({ auth: activeMemberAuth, allowed: true }),
          element: <ClubAppLayoutFromLoader />,
          children: [{ index: true, element: <main>scoped member child</main> }],
        },
      ],
      { initialEntries: ["/clubs/reading-sai/app"] },
    );

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByText("scoped member child")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "클럽멤버 계정 메뉴" })).toHaveLength(2);
    expect(screen.queryByRole("link", { name: "호스트 공간" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/bff/api/auth/me?clubSlug=reading-sai",
      expect.anything(),
    );
  });

  it("keeps both guest club-app headers free of persistent conversion actions", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/clubs/:clubSlug/app",
          loader: () => ({ audience: "GUEST", auth: anonymousAuth, club: null }),
          element: <ClubMemberAppRouteLayout />,
          children: [{ path: "archive", element: <main>guest archive child</main> }],
        },
      ],
      { initialEntries: ["/clubs/reading-sai/app/archive?view=report#sessions"] },
    );

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("guest archive child")).toBeInTheDocument();
    expect(document.querySelector(".desktop-only .topnav")).toBeInTheDocument();
    expect(document.querySelector(".mobile-only .m-hdr")).toBeInTheDocument();
    expect(screen.queryByLabelText("게스트 계정")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "공개 홈으로 나가기" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "멤버로 시작" })).not.toBeInTheDocument();
  });

  it("switches clubs through a safe route-family target", async () => {
    const user = userEvent.setup();
    const scopedAuth: AuthMeResponse = {
      ...activeMemberAuth,
      currentMembership: {
        membershipId: "membership-active-member",
        clubId: "club-2",
        clubSlug: "reading-sai",
        displayName: "클럽멤버",
        avatarKey: "cloud-green-book",
        role: "MEMBER",
        membershipStatus: "ACTIVE",
        approvalState: "ACTIVE",
      },
      joinedClubs: [
        {
          clubId: "club-2",
          clubSlug: "reading-sai",
          clubName: "읽는사이",
          membershipId: "membership-active-member",
          role: "MEMBER",
          status: "ACTIVE",
          approvalState: "ACTIVE",
          primaryHost: "reading-sai.example.test",
        },
        {
          clubId: "club-3",
          clubSlug: "sample-book-club",
          clubName: "샘플 북클럽",
          membershipId: "membership-sample",
          role: "HOST",
          status: "ACTIVE",
          approvalState: "ACTIVE",
          primaryHost: null,
        },
      ],
      platformAdmin: {
        userId: "member-2",
        email: "member2@example.com",
        role: "OWNER",
      },
      availableSpaces: {
        version: 1,
        kinds: ["PLATFORM", "CLUBS"],
        clubs: [
          {
            clubId: "club-2",
            clubSlug: "reading-sai",
            clubName: "읽는사이",
            perspectives: ["MEMBER"],
          },
          {
            clubId: "club-3",
            clubSlug: "sample-book-club",
            clubName: "샘플 북클럽",
            perspectives: ["MEMBER", "HOST"],
          },
        ],
      },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(scopedAuth));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={["/clubs/reading-sai/app/archive"]}>
          <Routes>
            <Route
              path="/clubs/:clubSlug/app"
              element={<AppRouteLayout scopedAuth={scopedAuth} />}
            >
              <Route
                path="archive"
                element={
                  <main>
                    archive child <CurrentLocationText />
                  </main>
                }
              />
              <Route
                path="host"
                element={
                  <main>
                    host child <CurrentLocationText />
                  </main>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(await screen.findByText(/archive child/)).toBeInTheDocument();
    await user.click((await screen.findAllByRole("button", { name: /^공간 전환, 현재 내 클럽/ }))[0]);
    await user.click(screen.getByRole("menuitemradio", { name: "샘플 북클럽 호스트로 운영" }));

    expect(await screen.findByText("/clubs/sample-book-club/app/host")).toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText("member child")).toBeInTheDocument());

    const tabs = screen.getByRole("navigation", { name: "멤버 주 메뉴 모바일" });
    await user.click(within(tabs).getByRole("link", { name: "기록" }));

    await waitFor(() => expect(screen.getByText("archive child")).toBeInTheDocument());
    expect(within(tabs).getAllByRole("link").map((tab) => tab.textContent)).toEqual([
      "오늘",
      "노트",
      "기록",
      "내 공간",
    ]);
    expect(within(tabs).getByRole("link", { name: "기록" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: /^공간 전환/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("현재 공간 내 클럽, 읽는사이 멤버로 보기")).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/sessions/current", expect.anything());
  });

  it("keeps archive routes in member chrome for active hosts", async () => {
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

    await waitFor(() => expect(screen.getByText("archive child")).toBeInTheDocument());

    const desktopNav = screen.getByRole("navigation", { name: "멤버 주 메뉴" });
    expect(within(desktopNav).getByRole("link", { name: "기록" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: /^공간 전환/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("현재 공간 내 클럽, 읽는사이 멤버로 보기")).toHaveLength(2);

    expect(screen.getAllByText("기록")).toHaveLength(2);

    const tabs = screen.getByRole("navigation", { name: "멤버 주 메뉴 모바일" });
    expect(within(tabs).getAllByRole("link").map((tab) => tab.textContent)).toEqual([
      "오늘",
      "노트",
      "기록",
      "내 공간",
    ]);
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/sessions/current", expect.anything());
  });

  it("keeps feedback document routes in member chrome for active hosts", async () => {
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

    await waitFor(() => expect(screen.getByText("feedback child")).toBeInTheDocument());
    await waitFor(() => {
      expect(screen.getAllByRole("banner").find((element) => element.classList.contains("m-hdr"))).toHaveAttribute(
        "data-workspace",
        "member",
      );
    });
    const mobileHeader = screen.getAllByRole("banner").find((element) => element.classList.contains("m-hdr"));
    expect(mobileHeader).toBeDefined();
    expect(within(mobileHeader!).getByText("피드백 문서")).toBeInTheDocument();
    const backLink = within(mobileHeader!).getByRole("link", { name: "뒤로" });
    expect(backLink).toHaveAttribute("href", "/app/archive?view=report");
    expect(backLink.textContent).toBe("뒤로");
    expect(backLink).not.toHaveClass("m-hdr-back--icon");

    const tabs = screen.getByRole("navigation", { name: "멤버 주 메뉴 모바일" });
    expect(within(tabs).getAllByRole("link").map((tab) => tab.textContent)).toEqual([
      "오늘",
      "노트",
      "기록",
      "내 공간",
    ]);
    expect(screen.getAllByText("현재 공간 내 클럽, 읽는사이 멤버로 보기")).toHaveLength(2);
  });

  it("keeps the host meeting list available without waiting for a current-session target", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = input.toString();

        if (url === "/api/bff/api/auth/me") {
          return Promise.resolve(jsonResponse(hostAuth));
        }

        if (url === "/api/bff/api/sessions/current") {
          return Promise.reject(new Error("current session should not be requested"));
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

    await waitFor(() => expect(screen.getByText("host child")).toBeInTheDocument());

    expect(screen.queryByRole("button", { name: /^공간 전환/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("현재 공간 내 클럽, 읽는사이 호스트로 운영")).toHaveLength(2);

    const tabs = screen.getByRole("navigation", { name: "호스트 주 메뉴 모바일" });
    expect(within(tabs).getByRole("link", { name: "모임" })).toHaveAttribute(
      "href",
      "/app/host/sessions",
    );
    expect(within(tabs).queryByLabelText("모임 불러오는 중")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith("/api/bff/api/sessions/current", expect.anything());
  });

  it("keeps the host meeting list available when current-session lookup is unavailable", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(hostAuth));
      }

      if (url === "/api/bff/api/sessions/current") {
        return Promise.reject(new Error("current session unavailable"));
      }

      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

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

    await waitFor(() => expect(screen.getByText("host child")).toBeInTheDocument());

    const tabs = screen.getByRole("navigation", { name: "호스트 주 메뉴 모바일" });
    expect(within(tabs).getByRole("link", { name: "모임" })).toHaveAttribute(
      "href",
      "/app/host/sessions",
    );
    expect(within(tabs).queryByRole("button", { name: "모임 다시 확인" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/sessions/current", expect.anything());
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
