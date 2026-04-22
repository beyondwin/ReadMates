"use client";

import { useState } from "react";
import type { DevLoginRequest } from "@/shared/api/readmates";

type DevAccount = {
  label: string;
  email: string;
};

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

export function LoginCard() {
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showDevLogin = isDevLoginEnabled();

  const loginAsDevAccount = async (email: string) => {
    setError(null);
    setPendingEmail(email);

    try {
      const body: DevLoginRequest = { email };
      const response = await fetch("/api/bff/api/dev/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Dev login failed: ${response.status}`);
      }

      globalThis.location.assign("/app");
    } catch {
      setError("로컬 테스트 로그인에 실패했습니다. 백엔드 dev 모드를 확인해 주세요.");
      setPendingEmail(null);
    }
  };

  return (
    <section className="auth-card">
      <p className="eyebrow">기존 멤버 로그인</p>
      <h1 className="h1 editorial">Google로 읽는사이에 들어가기</h1>
      <p className="body" style={{ color: "var(--text-2)" }}>
        <span>초대 없이 로그인하면 둘러보기 멤버로 시작합니다.</span> 초대 링크를 받았다면 링크에서 수락하면 바로 정식 멤버가 됩니다.
      </p>
      <a className="btn btn-primary btn-lg" href="/oauth2/authorization/google">
        Google로 계속하기
      </a>
      {showDevLogin ? (
        <div style={{ marginTop: 30 }}>
          <p className="eyebrow" style={{ marginBottom: 10 }}>
            로컬 테스트
          </p>
          <div className="auth-card__actions" style={{ marginTop: 0 }}>
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
          {error ? (
            <p className="small" role="alert" style={{ margin: "12px 0 0", color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
