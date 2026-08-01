import { describe, expect, it } from "vitest";
import { loginRecoveryFromSearch } from "./login-recovery";

describe("login recovery model", () => {
  it("keeps normal login fast", () => {
    expect(loginRecoveryFromSearch("")).toEqual({
      code: null,
      errorMessage: null,
      googleActionLabel: "Google로 시작하기",
      chooseAccount: false,
    });
  });

  it("forces account choice after a left-membership login", () => {
    expect(loginRecoveryFromSearch("?error=membership-left")).toEqual({
      code: "membership-left",
      errorMessage: "이전 멤버십이 종료된 계정입니다. 다시 참여하려면 호스트의 새 초대가 필요합니다.",
      googleActionLabel: "다른 Google 계정으로 로그인",
      chooseAccount: true,
    });
  });

  it("forces account choice after a generic Google failure", () => {
    expect(loginRecoveryFromSearch("?error=google")).toEqual({
      code: "google",
      errorMessage: "Google 인증을 완료하지 못했습니다. 사용할 계정을 다시 선택해 주세요.",
      googleActionLabel: "Google 로그인 다시 시도",
      chooseAccount: true,
    });
  });

  it("does not trust unknown error codes", () => {
    expect(loginRecoveryFromSearch("?error=provider-detail")).toEqual(loginRecoveryFromSearch(""));
  });
});
