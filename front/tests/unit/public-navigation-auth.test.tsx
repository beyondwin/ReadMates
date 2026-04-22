import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicMobileHeader } from "@/shared/ui/public-mobile-header";
import { TopNav } from "@/shared/ui/top-nav";

const authenticatedMember = {
  authenticated: true,
  userId: "user-1",
  membershipId: "member-1",
  clubId: "club-1",
  email: "member@example.com",
  displayName: "이멤버5",
  shortName: "수",
  role: "MEMBER",
};

function mockAuthMe(authenticated: boolean) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(authenticated ? authenticatedMember : { authenticated: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderAt(pathname: string, element: ReactElement) {
  render(<MemoryRouter initialEntries={[pathname]}>{element}</MemoryRouter>);
}

describe("public navigation auth state", () => {
  it("keeps the desktop login link for guests", async () => {
    mockAuthMe(false);

    renderAt("/", <TopNav />);

    const loginLink = await screen.findByRole("link", { name: "로그인" });
    expect(loginLink).toHaveAttribute("href", "/login");
  });

  it("links desktop authenticated members back to their app instead of login", async () => {
    mockAuthMe(true);

    renderAt("/", <TopNav />);

    const appLink = await screen.findByRole("link", { name: "내 공간" });
    expect(appLink).toHaveAttribute("href", "/app");
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
  });

  it("keeps the mobile back link on login for guests", async () => {
    mockAuthMe(false);

    renderAt("/login", <PublicMobileHeader />);

    const backLink = await screen.findByRole("link", { name: "뒤로" });
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("links mobile authenticated members back to their app instead of login", async () => {
    mockAuthMe(true);

    renderAt("/", <PublicMobileHeader />);

    const appLink = await screen.findByRole("link", { name: "내 공간" });
    expect(appLink).toHaveAttribute("href", "/app");
  });
});
