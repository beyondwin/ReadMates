
import { useState } from "react";

export type DevAccount = {
  label: string;
  email: string;
  defaultRedirectPath?: string;
};

export function LoginCard({
  devAccounts = [],
  browseHref,
  googleLoginHref = "/oauth2/authorization/google",
  googleLoginLabel = "Google로 시작하기",
  initialError = null,
  showDevLogin = false,
  showGoogleLogin = true,
  showExternalBrowserGuidance = false,
  copyStatus = null,
  onCopyLoginUrl,
  onDevLogin,
}: {
  devAccounts?: DevAccount[];
  browseHref?: string;
  googleLoginHref?: string;
  googleLoginLabel?: string;
  initialError?: string | null;
  showDevLogin?: boolean;
  showGoogleLogin?: boolean;
  showExternalBrowserGuidance?: boolean;
  copyStatus?: string | null;
  onCopyLoginUrl?: () => Promise<void>;
  onDevLogin?: (email: string, defaultRedirectPath?: string) => Promise<void>;
}) {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  const loginAsDevAccount = async (account: DevAccount) => {
    setError(null);
    setPendingEmail(account.email);

    try {
      await onDevLogin?.(account.email, account.defaultRedirectPath);
    } catch {
      setError("로컬 테스트 로그인에 실패했습니다. 백엔드 dev 모드를 확인해 주세요.");
      setPendingEmail(null);
    }
  };

  return (
    <section className="surface auth-card auth-card--club">
      <p className="eyebrow">둘러보기부터 멤버 참여까지</p>
      <h1 className="h1 editorial">읽는사이 들어가기</h1>
      <p className="body auth-card__lede">
        로그인 없이 공개된 클럽 기록을 둘러볼 수 있습니다. 멤버로 시작하면 Google 계정으로 참여 대기 상태가 열리고,
        호스트 승인 뒤 활동 권한이 생깁니다.
      </p>
      {error ? (
        <p className="small auth-card__error" role="alert">
          {error}
        </p>
      ) : null}
      {!showGoogleLogin ? (
        <aside className="auth-browser-guidance" role="note" aria-label="로컬 Google 로그인 설정 안내">
          <p className="eyebrow">Local development only</p>
          <h2 className="h3 editorial">Google 로그인은 명시적으로 활성화합니다</h2>
          <p className="small auth-browser-guidance__copy">
            Google OAuth 자격 증명을 안전하게 설정한 뒤에만 활성화할 수 있습니다. 지금은 아래 로컬 fixture 계정으로
            확인해 주세요.
          </p>
        </aside>
      ) : showExternalBrowserGuidance ? (
        <aside className="auth-browser-guidance" aria-labelledby="external-browser-guidance-title">
          <p className="eyebrow">카카오톡 브라우저</p>
          <h2 className="h3 editorial" id="external-browser-guidance-title">
            외부 브라우저에서 로그인해 주세요
          </h2>
          <p className="small auth-browser-guidance__copy">
            카카오톡 안의 브라우저에서는 Google 로그인이 제한될 수 있습니다. 카카오톡 메뉴에서 다른 브라우저로 열어 주세요.
          </p>
          <div className="auth-browser-guidance__actions">
            <button className="btn btn-primary btn-lg" type="button" onClick={() => void onCopyLoginUrl?.()}>
              로그인 주소 복사
            </button>
            {browseHref ? (
              <a className="btn btn-ghost btn-lg" href={browseHref}>
                둘러보기
              </a>
            ) : null}
            <a className="btn btn-ghost btn-lg" href={googleLoginHref}>
              {googleLoginLabel}
            </a>
          </div>
          {copyStatus ? (
            <p className="small auth-browser-guidance__status" role="status" aria-live="polite">
              {copyStatus}
            </p>
          ) : null}
        </aside>
      ) : (
        <div className="auth-card__actions auth-card__actions--primary">
          {browseHref ? (
            <a className="btn btn-primary btn-lg" href={browseHref}>
              둘러보기
            </a>
          ) : null}
          <a className={browseHref ? "btn btn-ghost btn-lg" : "btn btn-primary btn-lg"} href={googleLoginHref}>
            {googleLoginLabel}
          </a>
        </div>
      )}
      {showDevLogin ? (
        <div className="auth-dev-panel" aria-label="로컬 개발 전용 로그인">
          <div className="row-between auth-dev-panel__head">
            <p className="eyebrow">Local development only</p>
            <span className="badge badge-warning">프로덕션 제외</span>
          </div>
          <p className="small auth-dev-panel__copy">
            {showGoogleLogin
              ? "로컬 fixture 계정으로만 사용하는 개발용 shortcut입니다. 실제 운영 로그인은 위 Google OAuth 경로를 사용합니다."
              : "로컬 fixture 계정으로만 사용하는 개발용 shortcut입니다. 실제 Google 자격 증명은 브라우저에 노출하지 않습니다."}
          </p>
          <div className="auth-card__actions auth-dev-panel__actions">
            {devAccounts.map((account) => (
              <button
                key={account.email}
                className="btn btn-ghost btn-sm"
                type="button"
                disabled={pendingEmail !== null}
                onClick={() => void loginAsDevAccount(account)}
              >
                {pendingEmail === account.email ? "로그인 중" : account.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
