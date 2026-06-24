import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PasswordResetCard } from "@/features/auth/ui/password-reset-card";
import ResetPasswordPage from "@/src/pages/reset-password";

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("[data-readmates-page-head]").forEach((node) => node.remove());
  document.title = "";
});

describe("PasswordResetCard", () => {
  it("sets retired password route metadata for Lighthouse and browser tabs", () => {
    render(
      <MemoryRouter initialEntries={["/reset-password/page-token"]}>
        <Routes>
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(document.title).toBe("비밀번호 경로 종료 | ReadMates");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(
      "ReadMates 비밀번호 로그인과 재설정 경로는 종료되었습니다. 기존 멤버는 Google 계정으로 계속 입장합니다.",
    );
  });

  it("shows a Google-only legacy password endpoint is gone 안내 page", () => {
    render(<PasswordResetCard token="reset-token" />);

    expect(screen.getByRole("heading", { name: "비밀번호 로그인은 종료되었습니다." })).toBeInTheDocument();
    expect(screen.getByText("안내 전용")).toBeInTheDocument();
    expect(screen.getByText(/읽는사이는 현재 Google OAuth와 서버 세션으로만 입장합니다/)).toBeInTheDocument();
    expect(screen.getByText("현재 로그인")).toBeInTheDocument();
    expect(screen.getByText("비밀번호 재설정")).toBeInTheDocument();
    expect(screen.getByText("운영 경로에서 종료")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
    expect(screen.getByText("비밀번호 입력, 새 비밀번호 저장, 재설정 제출 버튼은 제공하지 않습니다.")).toBeInTheDocument();
    expect(screen.queryByLabelText("새 비밀번호")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("새 비밀번호 확인")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "비밀번호 재설정" })).not.toBeInTheDocument();
  });

  it("renders from the reset password page route", () => {
    render(
      <MemoryRouter initialEntries={["/reset-password/page-token"]}>
        <Routes>
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
  });
});
