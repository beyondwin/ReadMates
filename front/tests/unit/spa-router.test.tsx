import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/src/app/auth-context";
import { routes } from "@/src/app/router";

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

describe("SPA router", () => {
  it("renders the login route", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/login"] });

    render(<RouterProvider router={router} />);

    expect(screen.getByRole("heading", { name: "Google로 읽는사이에 들어가기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
  });

  it("renders the reset password route", () => {
    const router = createMemoryRouter(routes, { initialEntries: ["/reset-password/reset-token"] });

    render(<RouterProvider router={router} />);

    expect(screen.getByRole("heading", { name: "Google로 계속하기" })).toBeInTheDocument();
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
      await screen.findByRole("heading", { name: "전체 세션은 읽을 수 있고, 참여는 정식 멤버에게 열립니다." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "전체 세션 둘러보기" })).toHaveAttribute("href", "/app/archive");
    expect(screen.getByRole("link", { name: "이번 세션 보기" })).toHaveAttribute("href", "/app/session/current");
    expect(fetchMock).not.toHaveBeenCalledWith("/api/bff/api/app/pending", expect.anything());
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
    const router = createMemoryRouter(routes, { initialEntries: ["/app/archive"] });

    render(
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>,
    );

    expect(await screen.findAllByText("가난한 찰리의 연감")).not.toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "페이지를 불러오지 못했습니다." })).not.toBeInTheDocument();
  });
});
