import { useCallback } from "react";
import { submitDevLogin } from "@/features/auth/api/auth-api";
import { LoginCard, type DevAccount } from "@/features/auth/ui/login-card";

const devAccounts: DevAccount[] = [
  { label: "김호스트 · 호스트", email: "host@example.com" },
  { label: "안멤버1", email: "member1@example.com" },
  { label: "최멤버2", email: "member2@example.com" },
  { label: "김멤버3", email: "member3@example.com" },
  { label: "송멤버4", email: "member4@example.com" },
  { label: "이멤버5", email: "member5@example.com" },
];

function isDevLoginEnabled() {
  if (import.meta.env.PROD) {
    return false;
  }

  return (
    import.meta.env.VITE_ENABLE_DEV_LOGIN === "true" ||
    // Legacy compatibility for older local env files.
    import.meta.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === "true" ||
    (import.meta.env.DEV && import.meta.env.MODE !== "test")
  );
}

function loginErrorMessage(search: string) {
  const error = new URLSearchParams(search).get("error");
  if (error === "membership-left") {
    return "이전 멤버십이 종료된 계정입니다. 다시 참여하려면 호스트의 새 초대가 필요합니다.";
  }
  if (error === "google") {
    return "Google 로그인에 실패했습니다. 가입했던 Gmail 계정인지 확인한 뒤 다시 시도해 주세요.";
  }
  return null;
}

export function LoginRouteContent() {
  const loginAsDevAccount = useCallback(async (email: string) => {
    const response = await submitDevLogin(email);

    if (!response.ok) {
      throw new Error(`Dev login failed: ${response.status}`);
    }

    globalThis.location.assign("/app");
  }, []);

  return (
    <LoginCard
      devAccounts={devAccounts}
      initialError={loginErrorMessage(globalThis.location.search)}
      showDevLogin={isDevLoginEnabled()}
      onDevLogin={loginAsDevAccount}
    />
  );
}

export function LoginRoute() {
  return (
    <main className="auth-shell container">
      <LoginRouteContent />
    </main>
  );
}
