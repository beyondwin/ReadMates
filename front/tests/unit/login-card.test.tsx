import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginRoute } from "@/features/auth/route/login-route";

afterEach(() => {
  cleanup();
  window.history.pushState({}, "", "/");
  vi.unstubAllEnvs();
});

describe("LoginRoute", () => {
  it("shows only the Google login action outside dev login mode", () => {
    render(<LoginRoute />);

    expect(screen.getByText("Private reading room")).toBeVisible();
    expect(screen.getByRole("heading", { name: "읽는사이 멤버 입장" })).toBeVisible();
    expect(screen.getByText(/Google 계정으로 읽는사이 멤버 공간에 입장합니다/)).toBeVisible();
    expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
    expect(screen.queryByRole("button", { name: "김호스트 · 호스트" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("이메일")).toBeNull();
    expect(screen.queryByLabelText("비밀번호")).toBeNull();
  });

  it("hides dev login shortcuts in production builds even when the flag is true", () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_DEV_LOGIN", "true");

    render(<LoginRoute />);

    expect(screen.getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    expect(screen.queryByText("Local development only")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "김호스트 · 호스트" })).not.toBeInTheDocument();
  });

  it("shows seeded existing-user shortcuts in dev login mode", () => {
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true");

    render(<LoginRoute />);

    expect(screen.getByRole("link", { name: "시작하기" })).toBeInTheDocument();
    expect(screen.getByText("Local development only")).toBeInTheDocument();
    expect(screen.getByText("프로덕션 제외")).toBeInTheDocument();
    expect(screen.getByText(/실제 멤버 로그인은 위 Google OAuth 경로를 사용합니다/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "김호스트 · 호스트" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "안멤버1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최멤버2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "김멤버3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "송멤버4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이멤버5" })).toBeInTheDocument();
  });

  it("shows a specific message when a left member returns from Google login", () => {
    window.history.pushState({}, "", "/login?error=membership-left");

    render(<LoginRoute />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "이전 멤버십이 종료된 계정입니다. 다시 참여하려면 호스트의 새 초대가 필요합니다.",
    );
  });

});
