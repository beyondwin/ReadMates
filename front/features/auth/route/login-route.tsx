import { submitDevLogin } from "@/features/auth/api/auth-api";
import { loginRecoveryFromSearch } from "@/features/auth/model/login-recovery";
import { LoginCard, type DevAccount } from "@/features/auth/ui/login-card";
import { oauthHrefForReturnTo, safeRelativeReturnTo } from "@/shared/auth/login-return";
import { PageMetadataHead } from "@/shared/ui/page-metadata-head";

const devAccounts: DevAccount[] = [
  { label: "김호스트 · 호스트", email: "host@example.com" },
  { label: "플랫폼 관리자 · OWNER", email: "admin-owner@example.com", defaultRedirectPath: "/admin" },
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

function loginReturnTo(search: string) {
  return safeRelativeReturnTo(new URLSearchParams(search).get("returnTo"));
}

export function LoginRouteContent() {
  const search = globalThis.location.search;
  const recovery = loginRecoveryFromSearch(search);
  const returnTo = loginReturnTo(globalThis.location.search);
  const loginAsDevAccount = async (email: string, defaultRedirectPath?: string) => {
    const response = await submitDevLogin(email);

    if (!response.ok) {
      throw new Error(`Dev login failed: ${response.status}`);
    }

    globalThis.location.assign(returnTo ?? defaultRedirectPath ?? "/app");
  };

  return (
    <LoginCard
      devAccounts={devAccounts}
      googleLoginHref={oauthHrefForReturnTo(returnTo, { chooseAccount: recovery.chooseAccount })}
      googleLoginLabel={recovery.googleActionLabel}
      initialError={recovery.errorMessage}
      showDevLogin={isDevLoginEnabled()}
      onDevLogin={loginAsDevAccount}
    />
  );
}

export function LoginRoute() {
  return (
    <>
      <PageMetadataHead
        metadata={{
          title: "로그인 | ReadMates",
          description: "Google 계정으로 ReadMates 독서 모임에 들어가고, 초대받은 클럽의 멤버 공간으로 안전하게 이동합니다.",
        }}
      />
      <main className="auth-shell container">
        <LoginRouteContent />
      </main>
    </>
  );
}
