"use client";

import { Link } from "@/src/app/router-link";

export function PasswordResetCard({ token }: { token: string }) {
  void token;

  return (
    <section className="auth-shell">
      <div className="container" style={{ maxWidth: 520 }}>
        <Link to="/login" className="btn btn-quiet btn-sm" style={{ marginLeft: "-10px", marginBottom: 24 }}>
          ← 로그인으로
        </Link>
        <div className="surface auth-card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            Legacy password link
          </div>
          <h1 className="h2 editorial" style={{ margin: 0 }}>
            Google로 계속하기
          </h1>
          <p className="body" style={{ color: "var(--text-2)", marginTop: 16 }}>
            가입했던 Gmail 계정으로 Google 로그인을 진행하면 기존 읽는사이 회원 기록이 자동으로 연결됩니다.
          </p>
          <div className="auth-card__actions">
            <a className="btn btn-primary btn-lg" href="/oauth2/authorization/google">
              Google로 계속하기
            </a>
          </div>
          <p className="small" style={{ color: "var(--text-2)", marginTop: 12 }}>
            이 화면은 이전 비밀번호 재설정 링크를 위한 안내 페이지입니다. 비밀번호 재설정과 비밀번호 로그인은 더 이상
            제공하지 않습니다.
          </p>
        </div>
      </div>
    </section>
  );
}
