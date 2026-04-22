import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginCard } from "@/features/auth/components/login-card";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("LoginCard", () => {
  it("shows only the Google login action outside dev login mode", () => {
    render(<LoginCard />);

    expect(screen.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
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

    render(<LoginCard />);

    expect(screen.getByRole("link", { name: "Google로 계속하기" })).toBeInTheDocument();
    expect(screen.queryByText("로컬 테스트")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "김호스트 · 호스트" })).not.toBeInTheDocument();
  });

  it("shows seeded existing-user shortcuts in dev login mode", () => {
    vi.stubEnv("VITE_ENABLE_DEV_LOGIN", "true");

    render(<LoginCard />);

    expect(screen.getByRole("link", { name: "Google로 계속하기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "김호스트 · 호스트" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "안멤버1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "최멤버2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "김멤버3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "송멤버4" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이멤버5" })).toBeInTheDocument();
  });
});
