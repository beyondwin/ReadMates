import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/src/app/auth-context";
import { routes } from "@/src/app/router";
import { currentSessionContractFixture } from "./api-contract-fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installRouterRequestShim() {
  const NativeRequest = globalThis.Request;

  vi.stubGlobal(
    "Request",
    class RouterTestRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(input, init === undefined ? init : { ...init, signal: undefined });
      }
    },
  );
}

const anonymousAuth = {
  authenticated: false,
  userId: null,
  membershipId: null,
  clubId: null,
  email: null,
  displayName: null,
  shortName: null,
  role: null,
  membershipStatus: null,
  approvalState: "ANONYMOUS",
};

const inactiveAuth = {
  authenticated: true,
  userId: "inactive-user",
  membershipId: "inactive-membership",
  clubId: "club-id",
  email: "inactive@example.com",
  displayName: "비활성 멤버",
  shortName: "비활성",
  role: "MEMBER",
  membershipStatus: "INACTIVE",
  approvalState: "INACTIVE",
};

function isArchiveChildDataEndpoint(url: string) {
  return (
    url === "/api/bff/api/archive/sessions" ||
    url.startsWith("/api/bff/api/archive/sessions/") ||
    (url.startsWith("/api/bff/api/sessions/") && url.endsWith("/feedback-document")) ||
    url === "/api/bff/api/archive/me/questions" ||
    url === "/api/bff/api/archive/me/reviews" ||
    url === "/api/bff/api/feedback-documents/me" ||
    url === "/api/bff/api/notes/sessions" ||
    url.startsWith("/api/bff/api/notes/feed") ||
    url === "/api/bff/api/app/me"
  );
}

function expectNoArchiveChildDataFetch(fetchMock: ReturnType<typeof vi.fn>) {
  const childDataCalls = fetchMock.mock.calls.map(([input]) => input.toString()).filter(isArchiveChildDataEndpoint);

  expect(childDataCalls).toEqual([]);
}

function isMemberHomeChildDataEndpoint(url: string) {
  return (
    url === "/api/bff/api/sessions/current" ||
    url === "/api/bff/api/notes/feed" ||
    url === "/api/bff/api/app/me"
  );
}

function expectNoMemberHomeChildDataFetch(fetchMock: ReturnType<typeof vi.fn>) {
  const childDataCalls = fetchMock.mock.calls.map(([input]) => input.toString()).filter(isMemberHomeChildDataEndpoint);

  expect(childDataCalls).toEqual([]);
}

describe("SPA router", () => {
  it("renders the login route", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });

    render(<RouterProvider router={router} />);

    expect(screen.getByRole("heading", { name: "읽는사이 멤버 입장" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 멤버 공간 열기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
  });

  it("renders the reset password route", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/reset-password/reset-token"] });

    render(<RouterProvider router={router} />);

    expect(screen.getByRole("heading", { name: "비밀번호 링크는 보관용 안내로 전환되었습니다." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
  });

  it("renders the invite route with the route token", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/invitations/raw-token") {
        return Promise.resolve(
          jsonResponse({
            clubName: "읽는사이",
            email: "member@example.com",
            name: "새멤버",
            emailHint: "me****@example.com",
            status: "PENDING",
            expiresAt: "2026-05-20T12:00:00Z",
            canAccept: true,
          }),
        );
      }

      return Promise.resolve(jsonResponse({ authenticated: false }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const router = createMemoryRouter(routes, { initialEntries: ["/invite/raw-token"] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByText("member@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 초대 수락" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google?inviteToken=raw-token",
    );
  });

  it("renders the viewer explainer without fetching the legacy pending app endpoint", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(
          jsonResponse({
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
          }),
        );
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    const router = createMemoryRouter(routes, { initialEntries: ["/app/pending"] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(
      await screen.findByRole("heading", { name: "읽을 수 있는 공간은 열렸고, 참여는 승인 뒤 열립니다." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "전체 세션 둘러보기" })).toHaveAttribute("href", "/app/archive");
    expect(screen.getByRole("link", { name: "이번 세션 보기" })).toHaveAttribute("href", "/app/session/current");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/app/pending", expect.anything());
  });

  it("renders the current session route through its loader", async () => {
    const auth = {
      authenticated: true,
      userId: "member-user",
      membershipId: "member-membership",
      clubId: "club-id",
      email: "member@example.com",
      displayName: "이멤버5",
      shortName: "멤버",
      role: "MEMBER",
      membershipStatus: "ACTIVE",
      approvalState: "ACTIVE",
    };
    const current = {
      currentSession: currentSessionContractFixture.currentSession,
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(auth));
      }

      if (url === "/api/bff/api/sessions/current") {
        return Promise.resolve(jsonResponse(current));
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/app/session/current"] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect((await screen.findAllByText("테스트 책")).length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/bff/api/sessions/current",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("redirects anonymous current session navigation without fetching current session data", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(
          jsonResponse({
            authenticated: false,
            userId: null,
            membershipId: null,
            clubId: null,
            email: null,
            displayName: null,
            shortName: null,
            role: null,
            membershipStatus: null,
            approvalState: "ANONYMOUS",
          }),
        );
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/app/session/current"] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: "읽는사이 멤버 입장" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([input]) => input.toString())).not.toContain("/api/bff/api/sessions/current");
  });

  it("blocks disallowed authenticated current session navigation without fetching current session data", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(
          jsonResponse({
            authenticated: true,
            userId: "inactive-user",
            membershipId: "inactive-membership",
            clubId: "club-id",
            email: "inactive@example.com",
            displayName: "비활성 멤버",
            shortName: "비활성",
            role: "MEMBER",
            membershipStatus: "INACTIVE",
            approvalState: "INACTIVE",
          }),
        );
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/app/session/current"] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByText("활성 멤버만 이용할 수 있습니다.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([input]) => input.toString())).not.toContain("/api/bff/api/sessions/current");
  });

  it("redirects anonymous member home navigation before child data fetches", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(anonymousAuth));
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/app"] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: "읽는사이 멤버 입장" })).toBeInTheDocument();
    expectNoMemberHomeChildDataFetch(fetchMock);
  });

  it("blocks inactive member home navigation before child data fetches", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(inactiveAuth));
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/app"] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByText("활성 멤버만 이용할 수 있습니다.")).toBeInTheDocument();
    expectNoMemberHomeChildDataFetch(fetchMock);
  });

  it("renders the archive session list when viewer feedback documents are forbidden", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(
          jsonResponse({
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
          }),
        );
      }

      if (url === "/api/bff/api/archive/sessions") {
        return Promise.resolve(
          jsonResponse([
            {
              sessionId: "session-6",
              sessionNumber: 6,
              title: "6회차 모임 · 가난한 찰리의 연감",
              bookTitle: "가난한 찰리의 연감",
              bookAuthor: "찰리 멍거",
              bookImageUrl: null,
              date: "2026-04-15",
              attendance: 6,
              total: 6,
              published: true,
              state: "CLOSED",
            },
          ]),
        );
      }

      if (url === "/api/bff/api/archive/me/questions" || url === "/api/bff/api/archive/me/reviews") {
        return Promise.resolve(jsonResponse([]));
      }

      if (url === "/api/bff/api/feedback-documents/me") {
        return Promise.resolve(jsonResponse({ message: "forbidden" }, 403));
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: ["/app/archive"] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findAllByText("가난한 찰리의 연감")).not.toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "페이지를 불러오지 못했습니다." })).not.toBeInTheDocument();
  });

  it.each([
    ["/app/archive"],
    ["/app/notes"],
    ["/app/me"],
    ["/app/sessions/session-6"],
    ["/app/feedback/session-6"],
    ["/app/feedback/session-6/print"],
  ])("redirects anonymous archive route navigation from %s before child data fetches", async (path) => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(anonymousAuth));
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: [path] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByRole("heading", { name: "읽는사이 멤버 입장" })).toBeInTheDocument();
    expectNoArchiveChildDataFetch(fetchMock);
  });

  it.each([
    ["/app/archive"],
    ["/app/notes"],
    ["/app/me"],
    ["/app/sessions/session-6"],
    ["/app/feedback/session-6"],
    ["/app/feedback/session-6/print"],
  ])("blocks inactive archive route navigation from %s before child data fetches", async (path) => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = input.toString();

      if (url === "/api/bff/api/auth/me") {
        return Promise.resolve(jsonResponse(inactiveAuth));
      }

      return Promise.resolve(jsonResponse({ message: "unexpected request" }, 404));
    });
    vi.stubGlobal("fetch", fetchMock);
    installRouterRequestShim();
    const router = createMemoryRouter(routes, { initialEntries: [path] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findByText("활성 멤버만 이용할 수 있습니다.")).toBeInTheDocument();
    expectNoArchiveChildDataFetch(fetchMock);
  });
});
