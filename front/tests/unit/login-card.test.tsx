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

    expect(screen.getByText("둘러보기부터 멤버 참여까지")).toBeVisible();
    expect(screen.getByRole("heading", { name: "읽는사이 들어가기" })).toBeVisible();
    expect(screen.getByText(/초대 링크가 없다면 둘러보기 멤버로 시작해 기록을 읽을 수 있고/)).toBeVisible();
    expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
    expect(screen.queryByRole("button", { name: "김호스트 · 호스트" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("이메일")).toBeNull();
    expect(screen.queryByLabelText("비밀번호")).toBeNull();
  });

  it("adds a safe returnTo value to the Google login action", () => {
    window.history.pushState({}, "", "/login?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail");

    render(<LoginRoute />);

    expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google?returnTo=%2Fclubs%2Freading-sai%2Fapp%2Ffeedback%2Fsession-1%3Ffrom%3Demail",
    );
  });

  it("ignores unsafe returnTo values on the login route", () => {
    window.history.pushState({}, "", "/login?returnTo=https%3A%2F%2Fevil.example%2Fapp");

    render(<LoginRoute />);

    expect(screen.getByRole("link", { name: "시작하기" })).toHaveAttribute("href", "/oauth2/authorization/google");
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
