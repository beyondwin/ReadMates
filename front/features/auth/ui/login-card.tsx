"use client";

import { useState } from "react";

export type DevAccount = {
  label: string;
  email: string;
};

export function LoginCard({
  devAccounts = [],
  initialError = null,
  showDevLogin = false,
  onDevLogin,
}: {
  devAccounts?: DevAccount[];
  initialError?: string | null;
  showDevLogin?: boolean;
  onDevLogin?: (email: string) => Promise<void>;
}) {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  const loginAsDevAccount = async (email: string) => {
    setError(null);
    setPendingEmail(email);

    try {
      await onDevLogin?.(email);
    } catch {
      setError("로컬 테스트 로그인에 실패했습니다. 백엔드 dev 모드를 확인해 주세요.");
      setPendingEmail(null);
    }
  };

  return (
    <section className="surface auth-card auth-card--club">
      <p className="eyebrow">Private reading room</p>
      <h1 className="h1 editorial">읽는사이 멤버 입장</h1>
      <p className="body auth-card__lede">
        초대받은 멤버와 기존 멤버가 같은 Google 계정으로 입장하는 조용한 클럽 공간입니다. 초대 링크가 없다면
        둘러보기 멤버로 시작하고, 호스트 전환 뒤 참여 권한이 열립니다.
      </p>
      <div className="auth-card__actions auth-card__actions--primary">
        <a className="btn btn-primary btn-lg" href="/oauth2/authorization/google">
          Google로 멤버 공간 열기
        </a>
      </div>
      {error ? (
        <p className="small auth-card__error" role="alert">
          {error}
        </p>
      ) : null}
      {showDevLogin ? (
        <div className="auth-dev-panel" aria-label="로컬 개발 전용 로그인">
          <div className="row-between auth-dev-panel__head">
            <p className="eyebrow">Local development only</p>
            <span className="badge badge-warning">프로덕션 제외</span>
          </div>
          <p className="small auth-dev-panel__copy">
            로컬 fixture 계정으로만 사용하는 개발용 shortcut입니다. 실제 멤버 로그인은 위 Google OAuth 경로를 사용합니다.
          </p>
          <div className="auth-card__actions auth-dev-panel__actions">
            {devAccounts.map((account) => (
              <button
                key={account.email}
                className="btn btn-ghost btn-sm"
                type="button"
                disabled={pendingEmail !== null}
                onClick={() => void loginAsDevAccount(account.email)}
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
