import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicRouteLayout } from "@/src/app/layouts";
import { AuthContext, anonymousAuth, type AuthState } from "@/src/app/auth-state";
import { Link } from "@/src/app/router-link";
import { PublicGuestOnlyActions, PublicInviteGuidance } from "@/shared/ui/public-auth-action";
import { PublicMobileHeader } from "@/shared/ui/public-mobile-header";
import { PublicFooter } from "@/shared/ui/public-footer";
import { TopNav } from "@/shared/ui/top-nav";

const authenticatedMember = {
  authenticated: true,
  userId: "user-1",
  membershipId: "member-1",
  clubId: "club-1",
  email: "member@example.com",
  displayName: "이멤버5",
  accountName: "수",
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
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

function renderAt(pathname: string, element: ReactElement) {
  render(<MemoryRouter initialEntries={[pathname]}>{element}</MemoryRouter>);
}

function renderWithAuth(pathname: string, authState: AuthState, element: ReactElement) {
  render(
    <AuthContext.Provider value={authState}>
      <MemoryRouter initialEntries={[pathname]}>{element}</MemoryRouter>
    </AuthContext.Provider>,
  );
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

    const appLink = await screen.findByRole("link", { name: "멤버 화면" });
    expect(appLink).toHaveAttribute("href", "/app");
    expect(screen.queryByRole("link", { name: "로그인" })).not.toBeInTheDocument();
  });

  it("keeps the public top navigation logged out when the app auth context is anonymous", async () => {
    mockAuthMe(true);

    renderWithAuth(
      "/login",
      { status: "ready", auth: anonymousAuth },
      <Routes>
        <Route element={<PublicRouteLayout />}>
          <Route path="/login" element={<main>login page</main>} />
        </Route>
      </Routes>,
    );

    const loginLink = await screen.findByRole("link", { name: "로그인" });
    expect(loginLink).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: "멤버 화면" })).not.toBeInTheDocument();
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

    const appLink = await screen.findByRole("link", { name: "멤버 화면" });
    expect(appLink).toHaveAttribute("href", "/app");
  });

  it("keeps footer member actions route-safe for guests", async () => {
    mockAuthMe(false);

    renderAt("/", <PublicFooter />);

    const loginLink = await screen.findByRole("link", { name: "기존 멤버 로그인" });
    expect(loginLink).toHaveAttribute("href", "/login");
    const inviteCta = screen.getByRole("button", { name: /초대 수락하기/ });
    expect(inviteCta).toBeDisabled();
    expect(inviteCta).toHaveAttribute("aria-disabled", "true");
    expect(inviteCta).toHaveTextContent("초대 메일의 개인 링크에서만 열립니다.");
    expect(screen.queryByRole("link", { name: /초대 수락하기/ })).not.toBeInTheDocument();
  });

  it("hides footer guest login actions when mounted for authenticated app users", () => {
    mockAuthMe(true);

    renderAt("/app", <PublicFooter showGuestMemberActions={false} />);

    expect(screen.queryByRole("link", { name: "기존 멤버 로그인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /초대 수락하기/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /초대 수락하기/ })).not.toBeInTheDocument();
    expect(screen.queryByText("초대 메일의 개인 링크에서만 열립니다.")).not.toBeInTheDocument();
  });

  it("moves footer public navigation to the top instead of restoring prior record scroll", () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, value: scrollTo });
    window.sessionStorage.setItem(
      "readmates:public-records-scroll",
      JSON.stringify({ pathname: "/records", search: "", scrollY: 720 }),
    );

    renderAt("/sessions/session-1", <PublicFooter showGuestMemberActions={false} LinkComponent={Link} />);

    fireEvent.click(screen.getByRole("link", { name: "공개 기록" }));

    expect(window.sessionStorage.getItem("readmates:public-records-scroll")).toBeNull();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });

  it("does not duplicate guest member actions in the full public route shell", async () => {
    mockAuthMe(false);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route element={<PublicRouteLayout />}>
            <Route
              path="/"
              element={
                <main>
                  <PublicGuestOnlyActions>
                    <Link to="/login">기존 멤버 로그인</Link>
                    <PublicInviteGuidance />
                  </PublicGuestOnlyActions>
                </main>
              }
            />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findAllByRole("link", { name: "기존 멤버 로그인" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /초대 수락하기/ })).toHaveLength(1);
  });
});
