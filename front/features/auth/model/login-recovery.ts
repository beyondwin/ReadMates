import { safeRelativeReturnTo } from "@/shared/auth/login-return";

export type LoginRecoveryCode = "membership-left" | "google" | null;

export type LoginRecoveryView = {
  code: LoginRecoveryCode;
  errorMessage: string | null;
  googleActionLabel: string;
  chooseAccount: boolean;
};

const NORMAL_LOGIN: LoginRecoveryView = {
  code: null,
  errorMessage: null,
  googleActionLabel: "Google로 시작하기",
  chooseAccount: false,
};

export function loginRecoveryFromSearch(search: string): LoginRecoveryView {
  const error = new URLSearchParams(search).get("error");
  if (error === "membership-left") {
    return {
      code: "membership-left",
      errorMessage: "이전 멤버십이 종료된 계정입니다. 다시 참여하려면 호스트의 새 초대가 필요합니다.",
      googleActionLabel: "다른 Google 계정으로 로그인",
      chooseAccount: true,
    };
  }
  if (error === "google") {
    return {
      code: "google",
      errorMessage: "Google 인증을 완료하지 못했습니다. 사용할 계정을 다시 선택해 주세요.",
      googleActionLabel: "Google 로그인 다시 시도",
      chooseAccount: true,
    };
  }
  return NORMAL_LOGIN;
}

export function isKakaoInAppBrowser(userAgent: string) {
  return userAgent.toUpperCase().includes("KAKAOTALK");
}

export function canonicalLoginUrl(
  origin: string,
  rawReturnTo: string | null | undefined,
  recovery: LoginRecoveryView,
) {
  const url = new URL("/login", origin);
  if (recovery.code) {
    url.searchParams.set("error", recovery.code);
  }
  const returnTo = safeRelativeReturnTo(rawReturnTo);
  if (returnTo) {
    url.searchParams.set("returnTo", returnTo);
  }
  return url.toString();
}
