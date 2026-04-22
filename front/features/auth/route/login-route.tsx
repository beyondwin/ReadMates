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

export function LoginRoute() {
  const loginAsDevAccount = useCallback(async (email: string) => {
    const response = await submitDevLogin(email);

    if (!response.ok) {
      throw new Error(`Dev login failed: ${response.status}`);
    }

    globalThis.location.assign("/app");
  }, []);

  return (
    <main className="auth-shell container">
      <LoginCard
        devAccounts={devAccounts}
        showDevLogin={isDevLoginEnabled()}
        onDevLogin={loginAsDevAccount}
      />
    </main>
  );
}
