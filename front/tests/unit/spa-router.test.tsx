import { cleanup, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
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

    expect(screen.getByRole("heading", { name: "읽는사이 로그인" })).toBeInTheDocument();
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
});
