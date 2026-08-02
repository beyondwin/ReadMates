import { useState } from "react";
import { submitDevLogin } from "@/features/auth/api/auth-api";
import {
  canonicalLoginUrl,
  isKakaoInAppBrowser,
  loginRecoveryFromSearch,
} from "@/features/auth/model/login-recovery";
import { LoginCard, type DevAccount } from "@/features/auth/ui/login-card";
import { oauthHrefForReturnTo, safeRelativeReturnTo, scopedAppClubSlug } from "@/shared/auth/login-return";
import { PageMetadataHead } from "@/shared/ui/page-metadata-head";

const DEFAULT_CLUB_ENTRY_RETURN_TO = "/clubs/reading-sai/app";

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

function isGoogleLoginEnabled(showDevLogin: boolean) {
  return !showDevLogin || import.meta.env.VITE_ENABLE_GOOGLE_LOGIN === "true";
}

function requestedLoginReturnTo(search: string) {
  return safeRelativeReturnTo(new URLSearchParams(search).get("returnTo"));
}

function loginEntryReturnTo(search: string, requestedReturnTo: string | null) {
  const params = new URLSearchParams(search);
  if (params.has("returnTo") || params.has("error")) {
    return requestedReturnTo;
  }

  return DEFAULT_CLUB_ENTRY_RETURN_TO;
}

export function LoginRouteContent() {
  const search = globalThis.location.search;
  const recovery = loginRecoveryFromSearch(search);
  const requestedReturnTo = requestedLoginReturnTo(search);
  const returnTo = loginEntryReturnTo(search, requestedReturnTo);
  const joinClub = scopedAppClubSlug(returnTo);
  const isKakaoBrowser = isKakaoInAppBrowser(globalThis.navigator.userAgent);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const showDevLogin = isDevLoginEnabled();
  const loginUrl = isKakaoBrowser ? canonicalLoginUrl(globalThis.location.origin, returnTo, recovery) : null;
  const copyLoginUrl = async () => {
    if (!loginUrl) {
      return;
    }

    try {
      await globalThis.navigator.clipboard.writeText(loginUrl);
      setCopyStatus("로그인 주소를 복사했습니다.");
    } catch {
      setCopyStatus("주소를 복사하지 못했습니다. 브라우저 메뉴에서 다른 브라우저로 열어 주세요.");
    }
  };
  const loginAsDevAccount = async (email: string, defaultRedirectPath?: string) => {
    const response = await submitDevLogin(email);

    if (!response.ok) {
      throw new Error(`Dev login failed: ${response.status}`);
    }

    globalThis.location.assign(requestedReturnTo ?? defaultRedirectPath ?? "/app");
  };

  return (
    <LoginCard
      devAccounts={devAccounts}
      browseHref={joinClub ? returnTo ?? undefined : undefined}
      googleLoginHref={oauthHrefForReturnTo(returnTo, { chooseAccount: recovery.chooseAccount, joinClub: joinClub ?? undefined })}
      googleLoginLabel={isKakaoBrowser ? "Google 로그인 시도" : recovery.chooseAccount ? recovery.googleActionLabel : joinClub ? "멤버로 시작" : recovery.googleActionLabel}
      initialError={recovery.errorMessage}
      showDevLogin={showDevLogin}
      showGoogleLogin={isGoogleLoginEnabled(showDevLogin)}
      showExternalBrowserGuidance={isKakaoBrowser}
      copyStatus={copyStatus}
      onCopyLoginUrl={isKakaoBrowser ? copyLoginUrl : undefined}
      onDevLogin={loginAsDevAccount}
      joinClub={joinClub ?? undefined}
      joinReturnTo={joinClub ? returnTo ?? undefined : undefined}
      chooseAccount={recovery.chooseAccount}
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
