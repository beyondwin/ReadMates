import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PasswordResetCard } from "@/features/auth/components/password-reset-card";
import ResetPasswordPage from "@/src/pages/reset-password";

afterEach(() => {
  cleanup();
});

describe("PasswordResetCard", () => {
  it("shows a Google-only legacy password endpoint is gone 안내 page", () => {
    render(<PasswordResetCard token="reset-token" />);

    expect(screen.getByRole("heading", { name: "비밀번호 링크는 보관용 안내로 전환되었습니다." })).toBeInTheDocument();
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
