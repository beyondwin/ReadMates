"use client";

import { Link } from "@/features/auth/ui/auth-link";

export function PasswordResetCard({ token }: { token: string }) {
  void token;

  return (
    <section className="auth-shell">
      <div className="container" style={{ maxWidth: 520 }}>
        <Link to="/login" className="btn btn-quiet btn-sm auth-back-link">
          ← 로그인으로
        </Link>
        <div className="surface auth-card auth-card--boundary">
          <div className="row-between auth-card__kicker">
            <div className="eyebrow">Retired password route</div>
            <span className="badge badge-readonly">안내 전용</span>
          </div>
          <h1 className="h2 editorial auth-card__title">비밀번호 로그인은 종료되었습니다.</h1>
          <p className="body auth-card__lede">
            읽는사이는 현재 Google OAuth와 서버 세션으로만 입장합니다. 가입했던 Gmail 계정으로 계속하면 기존 멤버
            기록이 자동으로 연결됩니다.
          </p>
          <div className="auth-boundary-list" aria-label="비밀번호 경로 상태">
            <div className="auth-boundary-row">
              <span>현재 로그인</span>
              <strong>Google OAuth</strong>
              <em>기존 멤버 기록은 Gmail 계정 기준으로 연결됩니다.</em>
            </div>
            <div className="auth-boundary-row">
              <span>비밀번호 재설정</span>
              <strong>운영 경로에서 종료</strong>
              <em>이전 링크는 새 비밀번호 입력 화면을 열지 않습니다.</em>
            </div>
          </div>
          <div className="auth-card__actions auth-card__actions--primary">
            <a className="btn btn-primary btn-lg" href="/oauth2/authorization/google">
              Google로 계속하기
            </a>
          </div>
          <p className="small auth-card__next-step">
            비밀번호 입력, 새 비밀번호 저장, 재설정 제출 버튼은 제공하지 않습니다.
          </p>
        </div>
      </div>
    </section>
  );
}
