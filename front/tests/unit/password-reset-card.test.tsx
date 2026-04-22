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

    expect(screen.getByRole("heading", { name: "Google로 계속하기" })).toBeInTheDocument();
    expect(
      screen.getByText("가입했던 Gmail 계정으로 Google 로그인을 진행하면 기존 읽는사이 회원 기록이 자동으로 연결됩니다."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 계속하기" })).toHaveAttribute(
      "href",
      "/oauth2/authorization/google",
    );
    expect(
      screen.getByText(
        "이 화면은 이전 비밀번호 재설정 링크를 위한 안내 페이지입니다. 비밀번호 재설정과 비밀번호 로그인은 더 이상 제공하지 않습니다.",
      ),
    ).toBeInTheDocument();
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
