import type { ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { LogoutButton } from "@/features/auth/route/logout-button";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";
import { canUseHostApp, canUseMemberApp } from "@/shared/auth/member-app-access";
import { useAuth, useAuthActions } from "./auth-state";

export function RequireAuth({ children }: { children: ReactNode }) {
  const state = useAuth();

  if (state.status === "loading") return <ReadmatesRouteLoading label="로그인 상태를 확인하는 중" variant="auth" />;
  if (!state.auth.authenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export function RequireMemberApp({ children }: { children: ReactNode }) {
  const state = useAuth();

  if (state.status === "loading") return <ReadmatesRouteLoading label="멤버 화면을 확인하는 중" variant="member" />;
  if (!state.auth.authenticated) return <Navigate to="/login" replace />;
  if (!canUseMemberApp(state.auth)) {
    return <BlockedMemberApp />;
  }

  return <>{children}</>;
}

export const RequireActiveMember = RequireMemberApp;

export function RequireHost({ children }: { children: ReactNode }) {
  const state = useAuth();

  if (state.status === "loading") return <ReadmatesRouteLoading label="호스트 권한을 확인하는 중" variant="host" />;
  if (!state.auth.authenticated) return <Navigate to="/login" replace />;
  if (!canUseHostApp(state.auth)) return <Navigate to="/app" replace />;

  return <>{children}</>;
}

function BlockedMemberApp() {
  const { markLoggedOut } = useAuthActions();

  return (
    <main className="auth-pending-content">
      <section className="auth-pending-section">
        <div className="container">
          <div className="surface auth-card auth-card--pending">
            <p className="eyebrow">멤버십 확인 필요</p>
            <h1 className="h1 editorial auth-card__title">멤버 공간에 들어갈 수 없습니다.</h1>
            <p className="body auth-card__lede">
              현재 멤버십 상태에서는 멤버 공간이 열리지 않습니다. 공개 페이지는 계속 볼 수 있습니다.
            </p>
            <div className="auth-card__actions auth-card__actions--primary">
              <Link to="/" className="btn btn-primary">
                공개 홈
              </Link>
              <Link to="/about" className="btn btn-ghost">
                클럽 소개
              </Link>
              <LogoutButton className="btn btn-ghost" onLoggedOut={markLoggedOut} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
