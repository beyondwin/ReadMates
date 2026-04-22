import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";
import { canUseMemberApp } from "@/shared/auth/member-app-access";
import { useAuth } from "./auth-state";

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
    return <main className="container">활성 멤버만 이용할 수 있습니다.</main>;
  }

  return <>{children}</>;
}

export const RequireActiveMember = RequireMemberApp;

export function RequireHost({ children }: { children: ReactNode }) {
  const state = useAuth();

  if (state.status === "loading") return <ReadmatesRouteLoading label="호스트 권한을 확인하는 중" variant="host" />;
  if (!state.auth.authenticated) return <Navigate to="/login" replace />;
  if (state.auth.role !== "HOST" || state.auth.approvalState !== "ACTIVE") return <Navigate to="/app" replace />;

  return <>{children}</>;
}
