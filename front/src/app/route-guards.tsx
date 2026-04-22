import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { ReadmatesRouteLoading } from "@/src/pages/readmates-page";
import type { AuthMeResponse } from "@/shared/api/readmates";
import { useAuth } from "./auth-state";

function canUseMemberApp(auth: AuthMeResponse) {
  return auth.approvalState === "VIEWER" || auth.approvalState === "ACTIVE" || auth.approvalState === "SUSPENDED";
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const state = useAuth();

  if (state.status === "loading") return <ReadmatesRouteLoading variant="auth" />;
  if (!state.auth.authenticated) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export function RequireMemberApp({ children }: { children: ReactNode }) {
  const state = useAuth();

  if (state.status === "loading") return <ReadmatesRouteLoading variant="member" />;
  if (!state.auth.authenticated) return <Navigate to="/login" replace />;
  if (!canUseMemberApp(state.auth)) {
    return <main className="container">활성 멤버만 이용할 수 있습니다.</main>;
  }

  return <>{children}</>;
}

export const RequireActiveMember = RequireMemberApp;

export function RequireHost({ children }: { children: ReactNode }) {
  const state = useAuth();

  if (state.status === "loading") return <ReadmatesRouteLoading variant="host" />;
  if (!state.auth.authenticated) return <Navigate to="/login" replace />;
  if (state.auth.role !== "HOST" || state.auth.approvalState !== "ACTIVE") return <Navigate to="/app" replace />;

  return <>{children}</>;
}
